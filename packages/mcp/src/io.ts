import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { extname, isAbsolute, resolve } from 'node:path';
import { parse, serialize } from '@bacchus/core';
import type { VineGraph } from '@bacchus/core';

// ---------------------------------------------------------------------------
// Root directories for relative-path resolution
// ---------------------------------------------------------------------------

/** Candidate root directories for relative-path resolution. */
let roots: readonly string[] = [];

/**
 * Register additional root directories to search when resolving relative
 * paths.  Roots from the MCP `roots` capability or `--cwd` flag feed into
 * this.
 */
export function setRoots(dirs: readonly string[]): void {
  roots = [...dirs];
}

/** Return the current list of registered roots. */
export function getRoots(): readonly string[] {
  return roots;
}

// ---------------------------------------------------------------------------
// Path resolution
// ---------------------------------------------------------------------------

/** True when the file has no extension and might benefit from `.vine` inference. */
function needsVineExtension(file: string): boolean {
  return extname(file) === '';
}

/**
 * Resolve a file path to an absolute path.
 *
 * Strategy (tried in order — first match wins):
 *  1. If already absolute and the file exists → use it.
 *  2. Resolve against `process.cwd()` → if the file exists, use it.
 *  3. Resolve against each registered root → if the file exists, use it.
 *  4. Retry steps 1–3 with `.vine` appended (when the input has no extension).
 *  5. Fall back to `process.cwd()` resolution so callers get a concrete path.
 */
export function resolvePath(file: string): string {
  const variants = needsVineExtension(file) ? [file, `${file}.vine`] : [file];

  for (const variant of variants) {
    // Absolute path that already exists on disk?
    if (isAbsolute(variant) && existsSync(variant)) return variant;

    // Relative to the current working directory?
    const fromCwd = resolve(variant);
    if (existsSync(fromCwd)) return fromCwd;

    // Relative to each registered root?
    for (const root of roots) {
      const fromRoot = resolve(root, variant);
      if (existsSync(fromRoot)) return fromRoot;
    }
  }

  // Nothing found — fall back to cwd resolution so the error references a
  // concrete path the caller can inspect.
  return resolve(file);
}

// ---------------------------------------------------------------------------
// Graph I/O
// ---------------------------------------------------------------------------

/**
 * Read a .vine file from disk and parse it into a VineGraph.
 * Throws VineParseError or VineValidationError on invalid input.
 */
export function readGraph(filePath: string): VineGraph {
  const content = readFileSync(resolvePath(filePath), 'utf-8');
  return parse(content);
}

/**
 * Read a file from disk and return its raw text content.
 * Uses the same path resolution as readGraph.
 */
export function readFileContent(filePath: string): string {
  return readFileSync(resolvePath(filePath), 'utf-8');
}

/**
 * Serialize a VineGraph and write it back to disk.
 */
export function writeGraph(filePath: string, graph: VineGraph): void {
  const content = serialize(graph);
  writeFileSync(resolvePath(filePath), content, 'utf-8');
}
