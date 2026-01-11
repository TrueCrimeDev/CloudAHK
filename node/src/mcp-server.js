#!/usr/bin/env node

/**
 * CloudAHK MCP Server
 *
 * An MCP (Model Context Protocol) server that provides tools for running
 * and validating AutoHotkey scripts. This allows Claude Code to automatically
 * test AHK code and detect errors.
 *
 * Usage:
 *   npx cloudahk-mcp
 *   node src/mcp-server.js
 *
 * Environment Variables:
 *   CLOUDAHK_URL - CloudAHK API URL (default: http://localhost:8000)
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { CloudAHKClient } from './client.js';

const client = new CloudAHKClient();

// Create the MCP server
const server = new Server(
  {
    name: 'cloudahk',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Define available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'run_ahk',
        description: `Execute AutoHotkey (AHK v1) code and return the output. Use this to test if AHK code works correctly. The result includes:
- success: whether the code ran without errors
- output: the stdout from the script
- errors: any detected errors with line numbers and types
- summary: a human-readable summary of the result

Always use this tool to validate AHK code before considering it complete.`,
        inputSchema: {
          type: 'object',
          properties: {
            code: {
              type: 'string',
              description: 'The AutoHotkey v1 code to execute',
            },
          },
          required: ['code'],
        },
      },
      {
        name: 'run_ahk2',
        description: `Execute AutoHotkey v2 code and return the output. Use this for AHK v2 syntax. The result includes:
- success: whether the code ran without errors
- output: the stdout from the script
- errors: any detected errors with line numbers and types
- summary: a human-readable summary of the result`,
        inputSchema: {
          type: 'object',
          properties: {
            code: {
              type: 'string',
              description: 'The AutoHotkey v2 code to execute',
            },
          },
          required: ['code'],
        },
      },
      {
        name: 'validate_ahk',
        description: `Validate AutoHotkey code without caring about output. Returns whether the code is syntactically correct and runs without runtime errors. Use this for quick validation when you only need to know if the code works.`,
        inputSchema: {
          type: 'object',
          properties: {
            code: {
              type: 'string',
              description: 'The AutoHotkey code to validate',
            },
            version: {
              type: 'string',
              enum: ['v1', 'v2'],
              description: 'AHK version (default: v1)',
              default: 'v1',
            },
          },
          required: ['code'],
        },
      },
      {
        name: 'run_ahk_file',
        description: `Run an AutoHotkey script from a file path. Reads the file and executes it. Use this when you want to test a .ahk file that exists on disk.`,
        inputSchema: {
          type: 'object',
          properties: {
            filePath: {
              type: 'string',
              description: 'Path to the .ahk file to execute',
            },
            version: {
              type: 'string',
              enum: ['v1', 'v2'],
              description: 'AHK version (default: auto-detect from file or v1)',
              default: 'v1',
            },
          },
          required: ['filePath'],
        },
      },
      {
        name: 'cloudahk_status',
        description: `Check if the CloudAHK server is running and available. Returns the server status and container pool size.`,
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
    ],
  };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case 'run_ahk': {
        const result = await client.run(args.code, { language: 'ahk' });
        return {
          content: [
            {
              type: 'text',
              text: formatResult(result),
            },
          ],
        };
      }

      case 'run_ahk2': {
        const result = await client.run(args.code, { language: 'ahk2' });
        return {
          content: [
            {
              type: 'text',
              text: formatResult(result),
            },
          ],
        };
      }

      case 'validate_ahk': {
        const language = args.version === 'v2' ? 'ahk2' : 'ahk';
        const result = await client.validate(args.code, { language });
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  valid: result.valid,
                  errorCount: result.errors.length,
                  message: result.message,
                  errors: result.errors.map((e) => ({
                    type: e.type,
                    message: e.message,
                    context: e.context,
                  })),
                },
                null,
                2
              ),
            },
          ],
        };
      }

      case 'run_ahk_file': {
        // Read file and execute
        const fs = await import('fs/promises');
        let code;
        try {
          code = await fs.readFile(args.filePath, 'utf-8');
        } catch (err) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  success: false,
                  error: `Failed to read file: ${err.message}`,
                }),
              },
            ],
            isError: true,
          };
        }

        // Auto-detect version from file extension or directive
        let language = args.version === 'v2' ? 'ahk2' : 'ahk';
        if (!args.version) {
          if (
            args.filePath.endsWith('.ahk2') ||
            code.includes('#Requires AutoHotkey v2')
          ) {
            language = 'ahk2';
          }
        }

        const result = await client.run(code, { language });
        return {
          content: [
            {
              type: 'text',
              text: formatResult(result, args.filePath),
            },
          ],
        };
      }

      case 'cloudahk_status': {
        const available = await client.isAvailable();
        if (!available) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  available: false,
                  message: `CloudAHK server is not running at ${client.baseUrl}. Start it with: docker-compose up`,
                }),
              },
            ],
          };
        }

        const containerCount = await client.getContainerCount();
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                available: true,
                url: client.baseUrl,
                containerPool: containerCount,
                message: 'CloudAHK server is running and ready',
              }),
            },
          ],
        };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: false,
            error: error.message,
          }),
        },
      ],
      isError: true,
    };
  }
});

/**
 * Format execution result for display
 */
function formatResult(result, filePath = null) {
  const output = {
    success: result.success,
    ...(filePath && { file: filePath }),
    executionTime: result.executionTime,
    timedOut: result.timedOut,
    language: result.language,
    output: result.output,
    errorCount: result.errors.length,
    summary: result.summary,
  };

  if (result.errors.length > 0) {
    output.errors = result.errors.map((e) => ({
      type: e.type,
      message: e.message,
      context: e.context,
    }));
  }

  return JSON.stringify(output, null, 2);
}

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('CloudAHK MCP server running on stdio');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
