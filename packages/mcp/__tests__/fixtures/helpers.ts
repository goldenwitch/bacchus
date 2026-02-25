/**
 * Shared test helpers for MCP package tests.
 *
 * Provides temp-directory lifecycle management, fixture loading,
 * and MCP client setup for handler-level tests.
 */

import { mkdtempSync, readFileSync, writeFileSync, rmSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach } from 'vitest';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

import { createServer } from '../../src/server.js';

// ---------------------------------------------------------------------------
// Fixture paths
// ---------------------------------------------------------------------------

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/** Absolute path to a named fixture file. */
export function fixturePath(name: string): string {
  return join(__dirname, name);
}

// ---------------------------------------------------------------------------
// Temp-directory lifecycle
// ---------------------------------------------------------------------------

let _tempDir: string | undefined;

/** Create a fresh temp directory, tracked for cleanup. */
export function makeTempDir(): string {
  _tempDir = mkdtempSync(join(tmpdir(), 'mcp-test-'));
  return _tempDir;
}

/** Remove the current temp directory (call in afterEach). */
export function cleanupTempDir(): void {
  if (_tempDir) {
    rmSync(_tempDir, { recursive: true, force: true });
    _tempDir = undefined;
  }
}

/**
 * Register a default afterEach hook that cleans up the temp directory.
 * Call once at the top of each test file.
 */
export function useTempDir(): void {
  afterEach(() => {
    cleanupTempDir();
  });
}

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

/**
 * Copy a .vine fixture file into a temp directory.
 * @returns Absolute path to the copied file.
 */
export function writeFixture(dir: string, fixtureName: string, destName?: string): string {
  const src = fixturePath(fixtureName);
  const dest = join(dir, destName ?? fixtureName);
  copyFileSync(src, dest);
  return dest;
}

/**
 * Write arbitrary vine content to a file in the given directory.
 * @returns Absolute path to the written file.
 */
export function writeVineContent(dir: string, content: string, name = 'test.vine'): string {
  const file = join(dir, name);
  writeFileSync(file, content, 'utf-8');
  return file;
}

/**
 * Shorthand: copy sample.vine into a temp dir.
 * @returns Absolute path to the copied file.
 */
export function writeSample(dir: string, name = 'test.vine'): string {
  return writeFixture(dir, 'sample.vine', name);
}

/**
 * Read a fixture file's raw content as a string.
 */
export function readFixture(name: string): string {
  return readFileSync(fixturePath(name), 'utf-8');
}

// ---------------------------------------------------------------------------
// MCP Client setup (handler-level testing)
// ---------------------------------------------------------------------------

export interface TestClient {
  client: Client;
  cleanup: () => Promise<void>;
}

/**
 * Create an in-memory MCP client connected to a fully-configured VINE server.
 * Returns the client and a cleanup function to close the connection.
 */
export async function createTestClient(): Promise<TestClient> {
  const server = createServer();
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);

  const client = new Client({ name: 'test-client', version: '1.0.0' });
  await client.connect(clientTransport);

  return {
    client,
    cleanup: async () => {
      await client.close();
      await server.close();
    },
  };
}

// ---------------------------------------------------------------------------
// Response helpers
// ---------------------------------------------------------------------------

export interface ToolResult {
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
}

/** Call a tool and return the typed result. */
export async function callTool(
  client: Client,
  name: string,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  const result = await client.callTool({ name, arguments: args });
  return result as unknown as ToolResult;
}

/** Extract the text from a tool result. */
export function resultText(result: ToolResult): string {
  return result.content[0]?.text ?? '';
}

/** Parse JSON from a tool result's text. */
export function resultJSON(result: ToolResult): unknown {
  return JSON.parse(resultText(result));
}
