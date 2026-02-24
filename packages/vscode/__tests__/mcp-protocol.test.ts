import { describe, it, expect, afterAll, beforeAll, afterEach } from 'vitest';
import {
  mkdtempSync,
  writeFileSync,
  rmSync,
  readFileSync,
  existsSync,
} from 'node:fs';
import { execSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

const __dirname = dirname(fileURLToPath(import.meta.url));
const PKG_DIR = resolve(__dirname, '..');
const SERVER_PATH = resolve(PKG_DIR, 'dist', 'server.js');

let client: Client;
let transport: StdioClientTransport;
let tempDir: string | undefined;

beforeAll(async () => {
  // Build the server bundle if it doesn't exist yet.
  if (!existsSync(SERVER_PATH)) {
    execSync('node esbuild.mjs', { cwd: PKG_DIR, stdio: 'inherit' });
  }

  transport = new StdioClientTransport({
    command: 'node',
    args: [SERVER_PATH],
  });

  client = new Client({ name: 'test-client', version: '0.1.0' });
  await client.connect(transport);
});

afterAll(async () => {
  await client.close();
});

afterEach(() => {
  if (tempDir) {
    rmSync(tempDir, { recursive: true, force: true });
    tempDir = undefined;
  }
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SAMPLE_VINE = [
  'vine 1.0.0',
  'title: Protocol Test',
  '---',
  '[root] Root Task (started)',
  'The root task.',
  '-> leaf',
  '---',
  '[leaf] Leaf Task (notstarted)',
  'A leaf task.',
  '',
].join('\n');

function makeTempVine(content?: string): string {
  tempDir = mkdtempSync(join(tmpdir(), 'mcp-proto-'));
  const file = join(tempDir, 'test.vine');
  writeFileSync(file, content ?? SAMPLE_VINE, 'utf-8');
  return file;
}

type ContentItem = { type: string; text: string };
type ToolResult = { content: ContentItem[]; isError?: boolean };

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('MCP protocol — tools/list', () => {
  it('returns all 17 tools', async () => {
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name);
    expect(names).toHaveLength(17);
    expect(names).toContain('vine_validate');
    expect(names).toContain('vine_show');
    expect(names).toContain('vine_list');
    expect(names).toContain('vine_get_task');
    expect(names).toContain('vine_get_descendants');
    expect(names).toContain('vine_search');
    expect(names).toContain('vine_next_tasks');
    expect(names).toContain('vine_add_task');
    expect(names).toContain('vine_remove_task');
    expect(names).toContain('vine_set_status');
    expect(names).toContain('vine_update_task');
    expect(names).toContain('vine_add_dependency');
    expect(names).toContain('vine_remove_dependency');
    expect(names).toContain('vine_add_ref');
    expect(names).toContain('vine_expand_ref');
    expect(names).toContain('vine_update_ref_uri');
    expect(names).toContain('vine_get_refs');
  });
});

describe('MCP protocol — read-only tools', () => {
  it('vine_validate succeeds on valid file', async () => {
    const file = makeTempVine();
    const result = (await client.callTool({
      name: 'vine_validate',
      arguments: { file },
    })) as ToolResult;
    expect(result.isError).toBeFalsy();
    expect(result.content[0].text).toContain('Valid');
  });

  it('vine_show returns summary', async () => {
    const file = makeTempVine();
    const result = (await client.callTool({
      name: 'vine_show',
      arguments: { file },
    })) as ToolResult;
    expect(result.content[0].text).toContain('Root:');
    expect(result.content[0].text).toContain('Total tasks: 2');
  });

  it('vine_list returns tasks', async () => {
    const file = makeTempVine();
    const result = (await client.callTool({
      name: 'vine_list',
      arguments: { file },
    })) as ToolResult;
    const tasks = JSON.parse(result.content[0].text) as unknown[];
    expect(tasks).toHaveLength(2);
  });

  it('vine_validate fails on nonexistent file', async () => {
    const result = (await client.callTool({
      name: 'vine_validate',
      arguments: { file: '/nonexistent/path/missing.vine' },
    })) as ToolResult;
    expect(result.isError).toBe(true);
  });
});

describe('MCP protocol — mutation tools', () => {
  it('vine_set_status mutates and persists', async () => {
    const file = makeTempVine();
    const result = (await client.callTool({
      name: 'vine_set_status',
      arguments: { file, id: 'leaf', status: 'complete' },
    })) as ToolResult;
    expect(result.isError).toBeFalsy();

    const content = readFileSync(file, 'utf-8');
    expect(content).toContain('(complete)');
  });
});
