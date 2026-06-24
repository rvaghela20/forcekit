/**
 * Tests for ForceKit MCP Server
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Readable } from 'node:stream';
import { AgentEngine } from '../../core/engine.js';
import { startMcpServer } from '../../core/mcp.js';
import type { Tool } from '../../core/registry.js';

describe('MCP Server Integration', () => {
  let tempDir: string;
  let docsDir: string;
  let engine: AgentEngine;
  let mockStdin: Readable;
  const stdoutLines: string[] = [];

  let originalStdin: any;
  let originalStdoutWrite: any;
  let originalConsoleLog: any;
  let originalConsoleInfo: any;
  let originalConsoleWarn: any;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'forcekit-mcp-test-'));
    docsDir = join(tempDir, 'forcekit');
    mkdirSync(docsDir, { recursive: true });

    engine = new AgentEngine({ projectRoot: tempDir, docsRoot: docsDir });

    // Add a custom mock tool to verify schema mapping
    const mockTool: Tool = {
      name: 'mcp-mock-tool',
      description: 'A mock tool for MCP testing',
      inputs: [
        { name: 'strInput', type: 'string', required: true, description: 'A string input' },
        { name: 'numInput', type: 'number', required: false, description: 'A number input', default: 100 },
        { name: 'boolInput', type: 'boolean', required: false, description: 'A boolean input' },
        { name: 'arrInput', type: 'string[]', required: false, description: 'An array input' },
      ],
      execute: async (args) => ({
        success: true,
        data: { echoed: args },
        durationMs: 1,
      }),
    };
    engine.tools.register(mockTool);

    // Set up stream/console overrides
    mockStdin = new Readable({ read() {} });
    stdoutLines.length = 0;

    originalStdin = process.stdin;
    originalStdoutWrite = process.stdout.write;
    originalConsoleLog = console.log;
    originalConsoleInfo = console.info;
    originalConsoleWarn = console.warn;

    Object.defineProperty(process, 'stdin', {
      value: mockStdin,
      configurable: true,
      writable: true,
    });

    process.stdout.write = (chunk: any, encoding?: any, cb?: any) => {
      const str = chunk.toString();
      if (str.startsWith('{"jsonrpc"') || str.includes('"jsonrpc":"2.0"')) {
        stdoutLines.push(str);
        if (typeof cb === 'function') cb();
        return true;
      }
      return originalStdoutWrite.call(process.stdout, chunk, encoding, cb);
    };
  });

  afterEach(() => {
    // Restore stream/console overrides
    Object.defineProperty(process, 'stdin', {
      value: originalStdin,
      configurable: true,
      writable: true,
    });

    process.stdout.write = originalStdoutWrite;
    console.log = originalConsoleLog;
    console.info = originalConsoleInfo;
    console.warn = originalConsoleWarn;

    // Clean up files
    rmSync(tempDir, { recursive: true, force: true });
  });

  async function sendMcpMessage(msg: any): Promise<any> {
    stdoutLines.length = 0;
    mockStdin.push(JSON.stringify(msg) + '\n');
    
    // Wait for async execution
    await new Promise((resolve) => setTimeout(resolve, 25));
    
    if (stdoutLines.length === 0) {
      throw new Error('No response written to process.stdout');
    }
    return JSON.parse(stdoutLines[0].trim());
  }

  it('should initialize and return protocol capabilities', async () => {
    startMcpServer(engine, tempDir);

    const req = {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        clientInfo: { name: 'test-client', version: '1.0' },
      },
    };

    const res = await sendMcpMessage(req);
    assert.equal(res.jsonrpc, '2.0');
    assert.equal(res.id, 1);
    assert.equal(res.result.protocolVersion, '2024-11-05');
    assert.ok(res.result.capabilities.tools);
    assert.equal(res.result.serverInfo.name, 'forcekit-mcp');
  });

  it('should list all tools and map inputs schema correctly', async () => {
    startMcpServer(engine, tempDir);

    const req = {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/list',
    };

    const res = await sendMcpMessage(req);
    assert.equal(res.jsonrpc, '2.0');
    assert.equal(res.id, 2);
    
    const tools = res.result.tools;
    assert.ok(Array.isArray(tools));
    
    // Verify our mcp-mock-tool is present
    const mockToolInfo = tools.find((t: any) => t.name === 'mcp-mock-tool');
    assert.ok(mockToolInfo);
    assert.equal(mockToolInfo.description, 'A mock tool for MCP testing');
    
    const schema = mockToolInfo.inputSchema;
    assert.equal(schema.type, 'object');
    assert.ok(schema.required.includes('strInput'));
    assert.equal(schema.properties.strInput.type, 'string');
    assert.equal(schema.properties.numInput.type, 'number');
    assert.equal(schema.properties.numInput.default, 100);
    assert.equal(schema.properties.boolInput.type, 'boolean');
    assert.equal(schema.properties.arrInput.type, 'array');
    assert.equal(schema.properties.arrInput.items.type, 'string');
  });

  it('should execute registered tools successfully', async () => {
    startMcpServer(engine, tempDir);

    const req = {
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: {
        name: 'mcp-mock-tool',
        arguments: {
          strInput: 'hello',
          boolInput: true,
        },
      },
    };

    const res = await sendMcpMessage(req);
    assert.equal(res.jsonrpc, '2.0');
    assert.equal(res.id, 3);
    assert.equal(res.result.isError, false);
    
    const content = JSON.parse(res.result.content[0].text);
    assert.deepEqual(content.echoed, {
      projectRoot: tempDir,
      strInput: 'hello',
      boolInput: true,
      numInput: 100, // Default value applied
    });
  });

  it('should report execution errors gracefully', async () => {
    // Unregister and register a tool that throws
    engine.tools.unregister('mcp-mock-tool');
    engine.tools.register({
      name: 'mcp-mock-tool',
      description: 'throwing tool',
      inputs: [],
      execute: async () => ({ success: false, error: 'Simulated failure', durationMs: 0 }),
    });

    startMcpServer(engine, tempDir);

    const req = {
      jsonrpc: '2.0',
      id: 4,
      method: 'tools/call',
      params: {
        name: 'mcp-mock-tool',
        arguments: {},
      },
    };

    const res = await sendMcpMessage(req);
    assert.equal(res.jsonrpc, '2.0');
    assert.equal(res.id, 4);
    assert.equal(res.result.isError, true);
    assert.equal(res.result.content[0].text, 'Simulated failure');
  });

  it('should handle unknown methods with Method not found error', async () => {
    startMcpServer(engine, tempDir);

    const req = {
      jsonrpc: '2.0',
      id: 5,
      method: 'some/invalid/method',
    };

    const res = await sendMcpMessage(req);
    assert.equal(res.jsonrpc, '2.0');
    assert.equal(res.id, 5);
    assert.ok(res.error);
    assert.equal(res.error.code, -32601);
  });
});
