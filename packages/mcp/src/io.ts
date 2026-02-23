import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse, serialize } from '@bacchus/core';
import type { VineGraph } from '@bacchus/core';

/**
 * Resolve a file path to an absolute path.
 * MCP tools receive paths from the client — resolve them relative to cwd.
 */
export function resolvePath(file: string): string {
  return resolve(file);
}

/**
 * Read a .vine file from disk and parse it into a VineGraph.
 * Throws VineParseError or VineValidationError on invalid input.
 */
export function readGraph(filePath: string): VineGraph {
  const content = readFileSync(resolvePath(filePath), 'utf-8');
  return parse(content);
}

/**
 * Serialize a VineGraph and write it back to disk.
 */
export function writeGraph(filePath: string, graph: VineGraph): void {
  const content = serialize(graph);
  writeFileSync(resolvePath(filePath), content, 'utf-8');
}
