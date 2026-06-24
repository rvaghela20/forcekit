/**
 * ForceKit Model Context Protocol (MCP) Server
 *
 * Implements a native stdio transport for the MCP protocol, allowing
 * ForceKit tools to be programmatically discovered and called by AI clients.
 */

import readline from 'node:readline';
import type { AgentEngine } from './engine.js';
import type { ToolInput } from './registry.js';

/**
 * Starts the MCP stdio server using the given AgentEngine instance.
 * Redirects stdout logging to stderr to protect JSON-RPC channel integrity.
 */
export async function startMcpServer(engine: AgentEngine, projectRoot: string): Promise<void> {
  // Redirect standard console output streams to stderr so that they don't corrupt stdout JSON-RPC
  console.log = (...args) => console.error(...args);
  console.info = (...args) => console.error(...args);
  console.warn = (...args) => console.error(...args);

  const rl = readline.createInterface({
    input: process.stdin,
    terminal: false,
  });

  rl.on('line', async (line) => {
    if (!line.trim()) return;
    try {
      const message = JSON.parse(line);
      await handleMessage(message, engine, projectRoot);
    } catch (err) {
      sendError(null, -32700, 'Parse error', err instanceof Error ? err.message : String(err));
    }
  });
}

/**
 * Handle incoming JSON-RPC request.
 */
async function handleMessage(message: any, engine: AgentEngine, projectRoot: string) {
  const { jsonrpc, method, id, params } = message;

  if (jsonrpc !== '2.0') {
    sendError(id, -32600, 'Invalid Request', 'Only JSON-RPC 2.0 is supported');
    return;
  }

  try {
    switch (method) {
      case 'initialize':
        sendMessage({
          jsonrpc: '2.0',
          id,
          result: {
            protocolVersion: params?.protocolVersion || '2024-11-05',
            capabilities: {
              tools: {},
            },
            serverInfo: {
              name: 'forcekit-mcp',
              version: '2.0.0',
            },
          },
        });
        break;

      case 'notifications/initialized':
        // Notifications do not have a response
        break;

      case 'tools/list': {
        const toolsList = engine.tools.list();
        const mcpTools = toolsList.map((tool) => ({
          name: tool.name,
          description: tool.description,
          inputSchema: mapInputsToSchema(tool.inputs),
        }));

        sendMessage({
          jsonrpc: '2.0',
          id,
          result: {
            tools: mcpTools,
          },
        });
        break;
      }

      case 'tools/call': {
        const { name, arguments: args } = params || {};
        if (!name) {
          sendError(id, -32602, 'Invalid params', 'Missing tool name in tools/call request');
          return;
        }

        const tool = engine.tools.get(name);
        if (!tool) {
          sendError(id, -32601, 'Method not found', `Tool '${name}' not found`);
          return;
        }

        // Auto-inject projectRoot if not provided
        const toolArgs = {
          projectRoot,
          ...args,
        };

        const result = await engine.tools.invoke(name, toolArgs);

        if (result.success) {
          sendMessage({
            jsonrpc: '2.0',
            id,
            result: {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result.data || { success: true }, null, 2),
                },
              ],
              isError: false,
            },
          });
        } else {
          sendMessage({
            jsonrpc: '2.0',
            id,
            result: {
              content: [
                {
                  type: 'text',
                  text: result.error || 'Unknown tool execution error',
                },
              ],
              isError: true,
            },
          });
        }
        break;
      }

      case 'resources/list':
        sendMessage({
          jsonrpc: '2.0',
          id,
          result: {
            resources: [],
          },
        });
        break;

      case 'prompts/list':
        sendMessage({
          jsonrpc: '2.0',
          id,
          result: {
            prompts: [],
          },
        });
        break;

      default:
        sendError(id, -32601, 'Method not found', `Method '${method}' not found`);
        break;
    }
  } catch (error) {
    sendError(
      id,
      -32603,
      'Internal error',
      error instanceof Error ? error.message : String(error)
    );
  }
}

/**
 * Send JSON-RPC response to stdout.
 */
function sendMessage(msg: any) {
  process.stdout.write(JSON.stringify(msg) + '\n');
}

/**
 * Send JSON-RPC error response.
 */
function sendError(id: any, code: number, message: string, data?: any) {
  sendMessage({
    jsonrpc: '2.0',
    id,
    error: {
      code,
      message,
      ...(data ? { data } : {}),
    },
  });
}

/**
 * Maps ToolInput arrays into JSON Schema properties formats.
 */
function mapInputsToSchema(inputs: ToolInput[]) {
  const properties: Record<string, any> = {};
  const required: string[] = [];

  for (const input of inputs) {
    let type = 'string';
    let items: any;

    if (input.type === 'number') {
      type = 'number';
    } else if (input.type === 'boolean') {
      type = 'boolean';
    } else if (input.type === 'string[]') {
      type = 'array';
      items = { type: 'string' };
    }

    properties[input.name] = {
      type,
      ...(items ? { items } : {}),
      description: input.description,
      ...(input.default !== undefined ? { default: input.default } : {}),
    };

    if (input.required) {
      required.push(input.name);
    }
  }

  return {
    type: 'object',
    properties,
    ...(required.length > 0 ? { required } : {}),
  };
}
