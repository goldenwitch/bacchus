import { describe, it, expect, afterEach } from 'vitest';
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import {
  parse,
  getTask,
  applyBatch,
  validate,
  VineParseError,
} from '@bacchus/core';

import {
  readGraph,
  writeGraph,
  readFileContent,
  resolvePath,
  resolveNewPath,
  createGraph,
  setRoots,
  getRoots,
} from '../src/io.js';

import { makeTempDir, useTempDir, writeSample, readFixture, writeVineContent } from './fixtures/helpers.js';

// Register afterEach cleanup for temp directories
useTempDir();

// ---------------------------------------------------------------------------
// readGraph / writeGraph
// ---------------------------------------------------------------------------

describe('readGraph / writeGraph', () => {
  it('reads and parses a valid .vine file', () => {
    const file = writeSample(makeTempDir());
    const graph = readGraph(file);
    expect(graph.tasks.size).toBe(4);
    expect(graph.title).toBe('Test Project');
  });

  it('throws VineParseError on invalid content', () => {
    const dir = makeTempDir();
    const file = join(dir, 'bad.vine');
    writeFileSync(file, 'not a vine file at all', 'utf-8');
    expect(() => readGraph(file)).toThrow(VineParseError);
  });

  it('throws on missing file (ENOENT)', () => {
    expect(() => readGraph('/nonexistent/path/missing.vine')).toThrow();
  });

  it('write → read round-trip preserves graph', () => {
    const dir = makeTempDir();
    const src = writeSample(dir);
    const graph = readGraph(src);

    const dst = join(dir, 'out.vine');
    writeGraph(dst, graph);

    const reloaded = readGraph(dst);
    expect(reloaded.tasks.size).toBe(graph.tasks.size);
    expect(reloaded.order).toEqual(graph.order);
    expect(reloaded.title).toBe(graph.title);
  });
});

// ---------------------------------------------------------------------------
// resolvePath
// ---------------------------------------------------------------------------

describe('resolvePath', () => {
  afterEach(() => {
    setRoots([]);
  });

  it('returns an absolute path unchanged when the file exists', () => {
    const dir = makeTempDir();
    const file = writeSample(dir);
    expect(resolvePath(file)).toBe(file);
  });

  it('resolves a relative path against cwd', () => {
    const dir = makeTempDir();
    writeSample(dir, 'plan.vine');
    const original = process.cwd();
    try {
      process.chdir(dir);
      const resolved = resolvePath('plan.vine');
      expect(resolved).toBe(join(dir, 'plan.vine'));
    } finally {
      process.chdir(original);
    }
  });

  it('resolves a relative path against registered roots', () => {
    const dir = makeTempDir();
    writeSample(dir, 'tasks.vine');
    setRoots([dir]);
    const resolved = resolvePath('tasks.vine');
    expect(resolved).toBe(join(dir, 'tasks.vine'));
  });

  it('prefers cwd over roots when both contain the file', () => {
    const cwdDir = makeTempDir();
    writeSample(cwdDir, 'shared.vine');
    // Create a second temp dir as a root
    const rootDir = mkdtempSync(join(tmpdir(), 'mcp-root-'));
    writeVineContent(rootDir, readFixture('sample.vine'), 'shared.vine');
    setRoots([rootDir]);
    const original = process.cwd();
    try {
      process.chdir(cwdDir);
      const resolved = resolvePath('shared.vine');
      expect(resolved).toBe(join(cwdDir, 'shared.vine'));
    } finally {
      process.chdir(original);
      rmSync(rootDir, { recursive: true, force: true });
    }
  });

  it('infers .vine extension when the input has no extension', () => {
    const dir = makeTempDir();
    writeSample(dir, 'project.vine');
    setRoots([dir]);
    const resolved = resolvePath('project');
    expect(resolved).toBe(join(dir, 'project.vine'));
  });

  it('does not infer .vine when the input already has an extension', () => {
    const dir = makeTempDir();
    writeSample(dir, 'data.txt');
    setRoots([dir]);
    // 'data' should try data and data.vine, but data.txt should not match 'data'
    // resolvePath('data.txt') should find data.txt directly
    const resolved = resolvePath('data.txt');
    expect(resolved).toBe(join(dir, 'data.txt'));
  });

  it('falls back to cwd-based resolution when nothing matches', () => {
    setRoots([]);
    const resolved = resolvePath('nonexistent.vine');
    expect(resolved).toBe(resolve('nonexistent.vine'));
  });

  it('readGraph works with a relative path when cwd is correct', () => {
    const dir = makeTempDir();
    writeSample(dir, 'rel.vine');
    const original = process.cwd();
    try {
      process.chdir(dir);
      const graph = readGraph('rel.vine');
      expect(graph.tasks.size).toBe(4);
    } finally {
      process.chdir(original);
    }
  });

  it('readGraph works via registered roots', () => {
    const dir = makeTempDir();
    writeSample(dir, 'rooted.vine');
    setRoots([dir]);
    const graph = readGraph('rooted.vine');
    expect(graph.tasks.size).toBe(4);
  });

  it('readGraph with .vine extension inference', () => {
    const dir = makeTempDir();
    writeSample(dir, 'inferred.vine');
    setRoots([dir]);
    const graph = readGraph('inferred');
    expect(graph.tasks.size).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// setRoots / getRoots
// ---------------------------------------------------------------------------

describe('setRoots / getRoots', () => {
  afterEach(() => {
    setRoots([]);
  });

  it('getRoots returns empty array by default', () => {
    expect(getRoots()).toEqual([]);
  });

  it('setRoots stores and getRoots retrieves roots', () => {
    setRoots(['/a', '/b']);
    expect(getRoots()).toEqual(['/a', '/b']);
  });

  it('setRoots replaces previous roots', () => {
    setRoots(['/old']);
    setRoots(['/new']);
    expect(getRoots()).toEqual(['/new']);
  });
});

// ---------------------------------------------------------------------------
// createGraph
// ---------------------------------------------------------------------------

describe('createGraph', () => {
  it('creates a new .vine file', () => {
    const dir = makeTempDir();
    const file = join(dir, 'new-project.vine');
    const graph = parse(readFixture('sample.vine'));
    createGraph(file, graph);
    const reloaded = readGraph(file);
    expect(reloaded.tasks.size).toBe(4);
  });

  it('throws if file already exists', () => {
    const dir = makeTempDir();
    const file = writeSample(dir);
    const graph = parse(readFixture('sample.vine'));
    expect(() => createGraph(file, graph)).toThrow('already exists');
  });

  it('creates parent directories if needed', () => {
    const dir = makeTempDir();
    const file = join(dir, 'subdir', 'nested', 'plan.vine');
    const graph = parse(readFixture('sample.vine'));
    createGraph(file, graph);
    const reloaded = readGraph(file);
    expect(reloaded.tasks.size).toBe(4);
  });

  it('created graph is valid (passes validation)', () => {
    const dir = makeTempDir();
    const file = join(dir, 'valid.vine');
    const graph = parse(readFixture('sample.vine'));
    createGraph(file, graph);
    const reread = readGraph(file);
    expect(() => validate(reread)).not.toThrow();
  });

  it('createGraph preserves title metadata', () => {
    const dir = makeTempDir();
    const file = join(dir, 'titled.vine');
    const graph = parse(readFixture('sample.vine'));
    createGraph(file, graph);
    const reread = readGraph(file);
    expect(reread.title).toBe('Test Project');
  });
});

// ---------------------------------------------------------------------------
// resolveNewPath
// ---------------------------------------------------------------------------

describe('resolveNewPath', () => {
  it('appends .vine when no extension', () => {
    const result = resolveNewPath('my-plan');
    expect(result.endsWith('.vine')).toBe(true);
  });

  it('does not append .vine when extension exists', () => {
    const result = resolveNewPath('my-plan.vine');
    expect(result.endsWith('.vine.vine')).toBe(false);
    expect(result.endsWith('.vine')).toBe(true);
  });

  it('returns absolute path unchanged', () => {
    const abs = join(tmpdir(), 'test.vine');
    expect(resolveNewPath(abs)).toBe(abs);
  });

  it('resolves relative path to absolute', () => {
    const result = resolveNewPath('relative');
    expect(result).toMatch(/^([A-Z]:\\|\/)/i);
    expect(result.endsWith('.vine')).toBe(true);
  });

  it('handles path with directory separators', () => {
    const result = resolveNewPath('sub/dir/plan');
    expect(result.endsWith('.vine')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// IO edge cases
// ---------------------------------------------------------------------------

describe('IO edge cases', () => {
  it('writeGraph creates parent directories', () => {
    const dir = makeTempDir();
    const nested = join(dir, 'sub', 'dir', 'test.vine');
    const graph = parse(readFixture('sample.vine'));
    writeGraph(nested, graph);
    const reread = readGraph(nested);
    expect(reread.tasks.size).toBe(4);
  });

  it('readFileContent returns raw text', () => {
    const dir = makeTempDir();
    const file = writeVineContent(dir, readFixture('sample.vine'), 'raw.vine');
    const content = readFileContent(file);
    expect(content).toContain('vine 1.0.0');
    expect(content).toContain('[root]');
  });

  it('readFileContent preserves exact content', () => {
    const dir = makeTempDir();
    const file = writeVineContent(dir, readFixture('sample.vine'), 'exact.vine');
    const content = readFileContent(file);
    // Re-parsing should produce the same graph
    const graph = parse(content);
    expect(graph.tasks.size).toBe(4);
    expect(graph.title).toBe('Test Project');
  });

  it('writeGraph then readGraph preserves all task fields', () => {
    const dir = makeTempDir();
    let graph = parse(readFixture('sample.vine'));
    graph = applyBatch(graph, [
      { op: 'update', id: 'leaf', decisions: ['D1', 'D2'], description: 'Updated leaf' },
    ]);
    const file = join(dir, 'fields.vine');
    writeGraph(file, graph);
    const reread = readGraph(file);
    const task = getTask(reread, 'leaf');
    expect(task.description).toBe('Updated leaf');
    expect([...task.decisions]).toEqual(['D1', 'D2']);
  });
});
