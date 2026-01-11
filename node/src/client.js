/**
 * CloudAHK Node.js Client
 *
 * A client library for executing AutoHotkey scripts via the CloudAHK API
 * and detecting errors automatically.
 */

const DEFAULT_BASE_URL = process.env.CLOUDAHK_URL || 'http://localhost:8000';
const DEFAULT_TIMEOUT = 7000; // 7 seconds (matches server default)

/**
 * CloudAHK client for running AutoHotkey scripts
 */
export class CloudAHKClient {
  /**
   * @param {Object} options
   * @param {string} [options.baseUrl] - CloudAHK API URL (default: http://localhost:8000)
   * @param {number} [options.timeout] - Request timeout in ms (default: 7000)
   */
  constructor(options = {}) {
    this.baseUrl = options.baseUrl || DEFAULT_BASE_URL;
    this.timeout = options.timeout || DEFAULT_TIMEOUT;
  }

  /**
   * Run AutoHotkey code and return the result
   *
   * @param {string} code - The AHK code to execute
   * @param {Object} options
   * @param {string} [options.language='ahk'] - Language: 'ahk', 'ahk2', 'rlx', or 'unix'
   * @returns {Promise<ExecutionResult>}
   */
  async run(code, options = {}) {
    const language = options.language || 'ahk';
    const url = `${this.baseUrl}/${language}/run`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout + 5000);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
        },
        body: code,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`CloudAHK API error: ${response.status} ${response.statusText}`);
      }

      const result = await response.json();
      return this._parseResult(result, code);
    } catch (error) {
      clearTimeout(timeoutId);
      if (error.name === 'AbortError') {
        throw new Error('CloudAHK request timed out');
      }
      throw error;
    }
  }

  /**
   * Parse the API result and detect errors
   * @private
   */
  _parseResult(result, code) {
    const output = result.stdout || '';
    const timedOut = result.time === null;
    const errors = this._detectErrors(output);

    return {
      success: errors.length === 0 && !timedOut,
      output: output,
      executionTime: result.time,
      timedOut: timedOut,
      language: result.language,
      errors: errors,
      hasErrors: errors.length > 0,
      // Convenience method for Claude Code
      summary: this._generateSummary(output, errors, timedOut),
    };
  }

  /**
   * Detect AHK errors in output
   * @private
   */
  _detectErrors(output) {
    const errors = [];
    const lines = output.split('\n');

    // Common AHK error patterns
    const errorPatterns = [
      // AHK v1 errors
      /^Error(?:\s+in\s+#include)?:/i,
      /^Error:\s+/i,
      /-->\s*Line Text:/i,
      /-->\s*Line#:/i,
      /^Specifically:\s+/i,
      /^The following variable name contains an illegal character:/i,
      /^Call to nonexistent function/i,
      /^Duplicate (?:function|label|hotkey)/i,
      /^Invalid hotkey/i,
      /^Missing (?:comma|closing|opening)/i,
      /^Unexpected end of file/i,
      /^This line does not contain a recognized action/i,
      /^Target label does not exist/i,

      // AHK v2 errors
      /^(?:Error|ValueError|TypeError|OSError|TargetError|MemberError|PropertyError|MethodError|UnsetError|UnsetItemError|ZeroDivisionError):/,
      /^\s+Line \d+:/,
      /^\s+What: /,
      /^\s+File: /,
      /^\s+Stack:/,

      // Wine/system errors
      /^wine:/i,
      /^err:/i,
      /^fixme:/i,
    ];

    let currentError = null;
    let inErrorBlock = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmedLine = line.trim();

      // Check if this line starts an error
      const isErrorLine = errorPatterns.some(pattern => pattern.test(trimmedLine));

      if (isErrorLine) {
        if (currentError) {
          errors.push(currentError);
        }
        currentError = {
          line: i + 1,
          message: trimmedLine,
          context: [],
          type: this._classifyError(trimmedLine),
        };
        inErrorBlock = true;
      } else if (inErrorBlock && currentError) {
        // Continue capturing error context (stack traces, etc.)
        if (trimmedLine.startsWith('-->') ||
            trimmedLine.startsWith('Line') ||
            trimmedLine.startsWith('What:') ||
            trimmedLine.startsWith('File:') ||
            trimmedLine.startsWith('Stack:') ||
            /^\d+:/.test(trimmedLine)) {
          currentError.context.push(trimmedLine);
        } else if (trimmedLine === '' || (!trimmedLine.startsWith(' ') && !trimmedLine.startsWith('\t'))) {
          // End of error block
          errors.push(currentError);
          currentError = null;
          inErrorBlock = false;
        } else {
          currentError.context.push(trimmedLine);
        }
      }
    }

    // Don't forget the last error
    if (currentError) {
      errors.push(currentError);
    }

    return errors;
  }

  /**
   * Classify the error type
   * @private
   */
  _classifyError(message) {
    if (/syntax|unexpected|missing|invalid/i.test(message)) return 'syntax';
    if (/undefined|nonexistent|not found|unset/i.test(message)) return 'reference';
    if (/type|typeerror/i.test(message)) return 'type';
    if (/timeout|timed out/i.test(message)) return 'timeout';
    if (/wine:|err:|fixme:/i.test(message)) return 'wine';
    return 'runtime';
  }

  /**
   * Generate a human-readable summary for Claude Code
   * @private
   */
  _generateSummary(output, errors, timedOut) {
    if (timedOut) {
      return 'Script execution timed out (exceeded 7 seconds). Check for infinite loops or blocking operations.';
    }

    if (errors.length === 0) {
      const outputPreview = output.length > 200 ? output.substring(0, 200) + '...' : output;
      return `Script executed successfully.\nOutput: ${outputPreview || '(no output)'}`;
    }

    const errorSummary = errors.map(e => {
      let msg = `[${e.type}] ${e.message}`;
      if (e.context.length > 0) {
        msg += '\n  ' + e.context.slice(0, 3).join('\n  ');
      }
      return msg;
    }).join('\n\n');

    return `Script failed with ${errors.length} error(s):\n\n${errorSummary}`;
  }

  /**
   * Validate AHK code without caring about output
   * Returns true if code runs without errors
   *
   * @param {string} code - The AHK code to validate
   * @param {Object} options
   * @returns {Promise<ValidationResult>}
   */
  async validate(code, options = {}) {
    const result = await this.run(code, options);
    return {
      valid: result.success,
      errors: result.errors,
      message: result.success
        ? 'Code is valid and runs without errors'
        : result.summary,
    };
  }

  /**
   * Check if CloudAHK server is running
   * @returns {Promise<boolean>}
   */
  async isAvailable() {
    try {
      const response = await fetch(`${this.baseUrl}/`);
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Get the number of containers in the pool
   * @returns {Promise<number>}
   */
  async getContainerCount() {
    const response = await fetch(`${this.baseUrl}/containers`);
    const data = await response.json();
    return data.num;
  }
}

// Default export for convenience
export default CloudAHKClient;

/**
 * @typedef {Object} ExecutionResult
 * @property {boolean} success - Whether the script ran without errors
 * @property {string} output - The stdout output from the script
 * @property {number|null} executionTime - Execution time in seconds, null if timed out
 * @property {boolean} timedOut - Whether the script timed out
 * @property {string} language - The language that was executed
 * @property {Array<AHKError>} errors - Detected errors
 * @property {boolean} hasErrors - Whether any errors were detected
 * @property {string} summary - Human-readable summary for Claude Code
 */

/**
 * @typedef {Object} AHKError
 * @property {number} line - Line number in output where error appears
 * @property {string} message - The error message
 * @property {Array<string>} context - Additional context lines
 * @property {string} type - Error type: 'syntax', 'reference', 'type', 'runtime', 'timeout', 'wine'
 */

/**
 * @typedef {Object} ValidationResult
 * @property {boolean} valid - Whether the code is valid
 * @property {Array<AHKError>} errors - Detected errors
 * @property {string} message - Human-readable message
 */
