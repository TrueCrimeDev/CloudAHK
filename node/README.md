# CloudAHK Node.js Integration

Run and validate AutoHotkey scripts from Node.js with automatic error detection. Includes an MCP server for integration with Claude Code and other AI coding assistants.

## Features

- Execute AHK v1 and v2 scripts via HTTP
- Automatic error detection and classification
- Human-readable error summaries
- MCP server for Claude Code integration
- File-based script execution

## Installation

```bash
cd node
npm install
```

## Quick Start

### Using the Client Library

```javascript
import { CloudAHKClient } from './src/client.js';

const client = new CloudAHKClient({
  baseUrl: 'http://localhost:8000', // CloudAHK server URL
});

// Run AHK code
const result = await client.run(`
  x := 10
  y := 20
  Print(x + y)
`);

console.log(result.success);  // true
console.log(result.output);   // "30\n"
console.log(result.errors);   // []

// Validate code
const validation = await client.validate(`
  MsgBox % "Hello"
`);

console.log(validation.valid);    // true
console.log(validation.message);  // "Code is valid and runs without errors"
```

### Error Detection Example

```javascript
const result = await client.run(`
  Print(undefinedVariable)
`);

console.log(result.success);  // false
console.log(result.hasErrors); // true
console.log(result.errors);
// [{ type: 'reference', message: 'Error: ...', context: [...] }]
console.log(result.summary);
// "Script failed with 1 error(s): ..."
```

## Claude Code Integration

The MCP server allows Claude Code to automatically run and validate AHK scripts.

### Setup

1. **Start the CloudAHK server** (requires Docker):
   ```bash
   # From the CloudAHK root directory
   docker-compose up -d
   ```

2. **Configure Claude Code** to use the MCP server. Add to your `~/.claude.json` or project's `.claude/settings.json`:

   ```json
   {
     "mcpServers": {
       "cloudahk": {
         "command": "node",
         "args": ["/path/to/CloudAHK/node/src/mcp-server.js"],
         "env": {
           "CLOUDAHK_URL": "http://localhost:8000"
         }
       }
     }
   }
   ```

   Or if you install the package globally:
   ```json
   {
     "mcpServers": {
       "cloudahk": {
         "command": "npx",
         "args": ["cloudahk-mcp"],
         "env": {
           "CLOUDAHK_URL": "http://localhost:8000"
         }
       }
     }
   }
   ```

3. **Restart Claude Code** to load the MCP server.

### Available Tools

Once configured, Claude Code will have access to these tools:

| Tool | Description |
|------|-------------|
| `run_ahk` | Execute AHK v1 code and return output with error detection |
| `run_ahk2` | Execute AHK v2 code and return output with error detection |
| `validate_ahk` | Quick validation - returns whether code runs without errors |
| `run_ahk_file` | Execute an AHK file from disk |
| `cloudahk_status` | Check if CloudAHK server is running |

### How It Works

When Claude Code writes AHK code, it can automatically:

1. Call `run_ahk` with the code
2. See if there are any errors
3. Read the error messages with line numbers
4. Fix the code and re-test

Example Claude Code interaction:

```
You: Write an AHK script that calculates fibonacci numbers

Claude: I'll write the script and test it:

[Uses run_ahk tool with the code]

The script ran successfully! Here's the tested code:
...
```

## API Reference

### CloudAHKClient

#### Constructor Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `baseUrl` | string | `http://localhost:8000` | CloudAHK API URL |
| `timeout` | number | `7000` | Request timeout in milliseconds |

#### Methods

##### `run(code, options)`

Execute AHK code and return detailed results.

```javascript
const result = await client.run(code, { language: 'ahk' });
```

**Options:**
- `language`: `'ahk'` (v1), `'ahk2'` (v2), `'rlx'`, or `'unix'`

**Returns:** `ExecutionResult`
- `success`: boolean - Whether code ran without errors
- `output`: string - stdout from the script
- `executionTime`: number | null - Execution time in seconds
- `timedOut`: boolean - Whether execution timed out
- `language`: string - Language that was executed
- `errors`: Array - Detected errors
- `hasErrors`: boolean - Whether any errors were detected
- `summary`: string - Human-readable summary

##### `validate(code, options)`

Quick validation of AHK code.

```javascript
const result = await client.validate(code, { language: 'ahk' });
```

**Returns:** `ValidationResult`
- `valid`: boolean - Whether code is valid
- `errors`: Array - Detected errors
- `message`: string - Human-readable message

##### `isAvailable()`

Check if CloudAHK server is running.

```javascript
const running = await client.isAvailable();
```

##### `getContainerCount()`

Get number of containers in the pool.

```javascript
const count = await client.getContainerCount();
```

## Error Types

The client automatically classifies errors:

| Type | Description |
|------|-------------|
| `syntax` | Syntax errors, missing brackets, invalid statements |
| `reference` | Undefined variables, nonexistent functions |
| `type` | Type errors (mainly AHK v2) |
| `runtime` | General runtime errors |
| `timeout` | Script exceeded time limit |
| `wine` | Wine/system level errors |

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `CLOUDAHK_URL` | `http://localhost:8000` | CloudAHK API URL |

## Requirements

- Node.js 18+
- CloudAHK server running (Docker)
- For MCP: Claude Code or compatible AI assistant

## Troubleshooting

### "CloudAHK server is not running"

Make sure the CloudAHK Docker container is running:

```bash
docker-compose up -d
docker-compose logs -f
```

### Timeout errors

Scripts have a 7-second execution limit. Check for:
- Infinite loops
- Blocking operations
- GUI windows waiting for input (use `Print()` instead of `MsgBox`)

### Wine errors in output

Some Wine warnings (`fixme:`, `err:`) are normal and don't affect script execution. The client filters these when determining success.
