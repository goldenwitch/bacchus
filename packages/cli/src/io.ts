import { readFileSync, writeFileSync } from 'node:fs';
import { parse, serialize } from '@bacchus/core';
import type { VineGraph } from '@bacchus/core';

/**
 * Read a .vine file from disk and parse it into a VineGraph.
 * Throws VineParseError or VineValidationError on invalid input.
 */
export function readGraph(filePath: string): VineGraph {
  const content = readFileSync(filePath, 'utf-8');
  return parse(content);
}

/**
 * Serialize a VineGraph and write it back to disk.
 */
export function writeGraph(filePath: string, graph: VineGraph): void {
  const content = serialize(graph);
  writeFileSync(filePath, content, 'utf-8');
}
