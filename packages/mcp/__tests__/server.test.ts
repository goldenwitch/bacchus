import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import {
  parse,
  getTask,
  getDescendants,
  getSummary,
  getActionableTasks,
  filterByStatus,
  searchTasks,
  addTask,
  removeTask,
  setStatus,
  addRef,
  updateRefUri,
  getRefs,
  expandVineRef,
  applyBatch,
  isValidStatus,
  VineError,
  VineParseError,
  VineValidationError,
  EMPTY_ANNOTATIONS,
} from '@bacchus/core';
import type { ConcreteTask, Operation } from '@bacchus/core';

import {
  readGraph,
  writeGraph,
  readFileContent,
  resolvePath,
  setRoots,
  getRoots,
} from '../src/io.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const SAMPLE_VINE = `\
vine 1.0.0
title: Test Project
---
[root] Root Task (started)
The root task.
-> child-a
-> child-b
---
[child-a] Child A (complete)
First child task.
-> leaf
---
[child-b] Child B (planning)
Second child task.
-> leaf
---
[leaf] Leaf Task (notstarted)
A leaf task.
`;

let tempDir: string;

function makeTempDir(): string {
  tempDir = mkdtempSync(join(tmpdir(), 'mcp-test-'));
  return tempDir;
}

afterEach(() => {
  if (tempDir) {
    rmSync(tempDir, { recursive: true, force: true });
    tempDir = undefined!;
  }
});

function writeSample(dir: string, name = 'test.vine'): string {
  const file = join(dir, name);
  writeFileSync(file, SAMPLE_VINE, 'utf-8');
  return file;
}

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
// vine_read operations (unified query tool)
// ---------------------------------------------------------------------------

describe('vine_read operations', () => {
  it('vine_read validate: parse returns valid graph with correct task count', () => {
    const file = writeSample(makeTempDir());
    const graph = readGraph(file);
    expect(graph.tasks.size).toBe(4);
  });

  it('vine_read summary: getSummary returns correct summary', () => {
    const file = writeSample(makeTempDir());
    const graph = readGraph(file);
    const summary = getSummary(graph);
    expect(summary.total).toBe(4);
    expect(summary.rootId).toBe('root');
    expect(summary.rootName).toBe('Root Task');
    expect(summary.byStatus.complete).toBe(1);
    expect(summary.byStatus.planning).toBe(1);
    expect(summary.byStatus.notstarted).toBe(1);
    expect(summary.byStatus.started).toBe(1);
  });

  it('vine_read list: lists all tasks (4 in sample)', () => {
    const graph = readGraph(writeSample(makeTempDir()));
    expect(graph.order).toHaveLength(4);
  });

  it('vine_read list (status filter): filterByStatus returns only matching', () => {
    const graph = readGraph(writeSample(makeTempDir()));
    const complete = filterByStatus(graph, 'complete');
    expect(complete).toHaveLength(1);
    expect(complete[0]!.id).toBe('child-a');
  });

  it('vine_read list (search): searchTasks matches by text', () => {
    const graph = readGraph(writeSample(makeTempDir()));
    const results = searchTasks(graph, 'leaf');
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results.some((t) => t.id === 'leaf')).toBe(true);
  });

  it('vine_read task: getTask returns correct task details', () => {
    const graph = readGraph(writeSample(makeTempDir()));
    const task = getTask(graph, 'child-b') as ConcreteTask;
    expect(task.shortName).toBe('Child B');
    expect(task.status).toBe('planning');
    expect(task.dependencies).toContain('leaf');
  });

  it('vine_read descendants: getDescendants returns transitive dependants', () => {
    const graph = readGraph(writeSample(makeTempDir()));
    const desc = getDescendants(graph, 'leaf');
    const ids = desc.map((t) => t.id);
    expect(ids).toContain('child-a');
    expect(ids).toContain('child-b');
  });

  it('vine_read search: searchTasks finds tasks by query', () => {
    const graph = readGraph(writeSample(makeTempDir()));
    const results = searchTasks(graph, 'Root');
    expect(results).toHaveLength(1);
    expect(results[0]!.id).toBe('root');
  });

  it('vine_read refs: returns ref nodes from graph', () => {
    const dir = makeTempDir();
    const file = join(dir, 'ref.vine');
    writeFileSync(file, REF_VINE, 'utf-8');
    const graph = readGraph(file);
    const refs = getRefs(graph);
    expect(refs).toHaveLength(1);
    expect(refs[0]!.id).toBe('ext-ref');
  });

  it('vine_read refs: returns empty array when no refs', () => {
    const graph = readGraph(writeSample(makeTempDir()));
    const refs = getRefs(graph);
    expect(refs).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// vine_write operations (batch mutations)
// ---------------------------------------------------------------------------

describe('vine_write operations', () => {
  it('vine_write add_task: adds via applyBatch with add_dep (island-rule fix)', () => {
    const dir = makeTempDir();
    const file = writeSample(dir);
    let graph = readGraph(file);

    // Use applyBatch: add_task + add_dep atomically — no manual root patching
    graph = applyBatch(graph, [
      { op: 'add_task', id: 'new-task', name: 'New Task', description: 'Brand new.', dependsOn: ['leaf'] },
      { op: 'add_dep', taskId: 'root', depId: 'new-task' },
    ]);
    writeGraph(file, graph);

    const reloaded = readGraph(file);
    expect(reloaded.tasks.has('new-task')).toBe(true);
    expect(reloaded.tasks.size).toBe(5);
    expect(getTask(reloaded, 'root').dependencies).toContain('new-task');
  });

  it('vine_write remove_task: removes a non-root task', () => {
    const dir = makeTempDir();
    const file = writeSample(dir);
    let graph = readGraph(file);
    graph = removeTask(graph, 'leaf');
    writeGraph(file, graph);
    const reloaded = readGraph(file);
    expect(reloaded.tasks.has('leaf')).toBe(false);
    expect(reloaded.tasks.size).toBe(3);
  });

  it('vine_write set_status: changes status', () => {
    const dir = makeTempDir();
    const file = writeSample(dir);
    let graph = readGraph(file);
    graph = applyBatch(graph, [
      { op: 'set_status', id: 'child-b', status: 'complete' },
    ]);
    writeGraph(file, graph);
    const reloaded = readGraph(file);
    const task = getTask(reloaded, 'child-b') as ConcreteTask;
    expect(task.status).toBe('complete');
  });

  it('vine_write update: updates shortName/description', () => {
    const dir = makeTempDir();
    const file = writeSample(dir);
    let graph = readGraph(file);
    graph = applyBatch(graph, [
      { op: 'update', id: 'child-a', name: 'Updated A', description: 'New desc.' },
    ]);
    writeGraph(file, graph);
    const reloaded = readGraph(file);
    const task = getTask(reloaded, 'child-a');
    expect(task.shortName).toBe('Updated A');
    expect(task.description).toBe('New desc.');
  });

  it('vine_write add_dep: adds edge', () => {
    const dir = makeTempDir();
    const file = writeSample(dir);
    let graph = readGraph(file);
    graph = applyBatch(graph, [
      { op: 'add_dep', taskId: 'root', depId: 'leaf' },
    ]);
    writeGraph(file, graph);
    const reloaded = readGraph(file);
    const task = getTask(reloaded, 'root');
    expect(task.dependencies).toContain('leaf');
  });

  it('vine_write remove_dep: removes edge', () => {
    const dir = makeTempDir();
    const file = writeSample(dir);
    let graph = readGraph(file);
    graph = applyBatch(graph, [
      { op: 'remove_dep', taskId: 'child-a', depId: 'leaf' },
    ]);
    writeGraph(file, graph);
    const reloaded = readGraph(file);
    const task = getTask(reloaded, 'child-a');
    expect(task.dependencies).not.toContain('leaf');
  });

  it('vine_write batch: multiple operations in one call', () => {
    const dir = makeTempDir();
    const file = writeSample(dir);
    let graph = readGraph(file);
    graph = applyBatch(graph, [
      { op: 'set_status', id: 'leaf', status: 'complete' },
      { op: 'set_status', id: 'child-b', status: 'started' },
      { op: 'update', id: 'child-b', description: 'Updated via batch.' },
    ]);
    writeGraph(file, graph);

    const reloaded = readGraph(file);
    const leaf = getTask(reloaded, 'leaf') as ConcreteTask;
    const childB = getTask(reloaded, 'child-b') as ConcreteTask;
    expect(leaf.status).toBe('complete');
    expect(childB.status).toBe('started');
    expect(childB.description).toBe('Updated via batch.');
  });
});

// ---------------------------------------------------------------------------
// vine_write ref operations + vine_expand
// ---------------------------------------------------------------------------

describe('vine_write ref operations + vine_expand', () => {
  it('vine_write add_ref: adds via applyBatch (island-rule fix)', () => {
    const dir = makeTempDir();
    const file = writeSample(dir);
    let graph = readGraph(file);

    // Use applyBatch: add_ref + add_dep atomically — no manual root patching
    graph = applyBatch(graph, [
      { op: 'add_ref', id: 'my-ref', name: 'My Ref', vine: './other.vine', description: 'A reference node.', dependsOn: ['leaf'] },
      { op: 'add_dep', taskId: 'root', depId: 'my-ref' },
    ]);
    writeGraph(file, graph);

    const reloaded = readGraph(file);
    expect(reloaded.tasks.has('my-ref')).toBe(true);
    const task = getTask(reloaded, 'my-ref');
    expect(task.kind).toBe('ref');
    if (task.kind === 'ref') {
      expect(task.vine).toBe('./other.vine');
    }
  });

  it('vine_write add_ref: missing vine URI throws error', () => {
    const graph = readGraph(writeSample(makeTempDir()));
    const bad = {
      kind: 'ref' as const,
      id: 'bad-ref',
      shortName: 'Bad Ref',
      description: '',
      vine: '',
      dependencies: [],
      decisions: [],
      annotations: EMPTY_ANNOTATIONS,
    };
    expect(() => addRef(graph, bad)).toThrow();
  });

  it('vine_write update_ref_uri: updates the URI', () => {
    const dir = makeTempDir();
    const file = join(dir, 'ref.vine');
    writeFileSync(file, REF_VINE, 'utf-8');
    let graph = readGraph(file);
    graph = applyBatch(graph, [
      { op: 'update_ref_uri', id: 'ext-ref', uri: './updated.vine' },
    ]);
    writeGraph(file, graph);

    const reloaded = readGraph(file);
    const task = getTask(reloaded, 'ext-ref');
    expect(task.kind).toBe('ref');
    if (task.kind === 'ref') {
      expect(task.vine).toBe('./updated.vine');
    }
  });

  it('vine_write update_ref_uri: throws on non-ref node', () => {
    const graph = readGraph(writeSample(makeTempDir()));
    expect(() => updateRefUri(graph, 'root', './other.vine')).toThrow();
  });

  it('vine_expand: expands a ref by inlining child graph', () => {
    const dir = makeTempDir();
    const parentFile = join(dir, 'parent.vine');
    const childFile = join(dir, 'child.vine');
    writeFileSync(parentFile, REF_VINE, 'utf-8');
    writeFileSync(childFile, CHILD_VINE, 'utf-8');

    const parentGraph = readGraph(parentFile);
    const childContent = readFileContent(childFile);
    const childGraph = parse(childContent);
    const expanded = expandVineRef(parentGraph, 'ext-ref', childGraph);
    writeGraph(parentFile, expanded);

    const reloaded = readGraph(parentFile);
    // The ref node should be replaced with a concrete task at the same ID
    expect(reloaded.tasks.has('ext-ref')).toBe(true);
    const expandedTask = getTask(reloaded, 'ext-ref');
    expect(expandedTask.kind).toBe('task');
    // Child graph non-root nodes should be inlined
    expect(reloaded.tasks.has('ext-ref/child-leaf')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// error handling
// ---------------------------------------------------------------------------

describe('error handling', () => {
  it('addTask with duplicate id throws VineError', () => {
    const graph = readGraph(writeSample(makeTempDir()));
    const dup: ConcreteTask = {
      kind: 'task',
      id: 'root',
      shortName: 'Dup',
      description: '',
      status: 'notstarted',
      dependencies: [],
      decisions: [],
      annotations: EMPTY_ANNOTATIONS,
      attachments: [],
    };
    expect(() => addTask(graph, dup)).toThrow(VineError);
  });

  it('removeTask on root throws VineError', () => {
    const graph = readGraph(writeSample(makeTempDir()));
    expect(() => removeTask(graph, 'root')).toThrow(VineError);
  });

  it('isValidStatus rejects invalid status strings', () => {
    expect(isValidStatus('banana')).toBe(false);
    expect(isValidStatus('complete')).toBe(true);
    expect(isValidStatus('')).toBe(false);
  });

  it('getTask with unknown id throws VineError', () => {
    const graph = readGraph(writeSample(makeTempDir()));
    expect(() => getTask(graph, 'nonexistent')).toThrow(VineError);
  });

  it('parse invalid .vine throws VineParseError', () => {
    expect(() => parse('totally invalid content')).toThrow(VineParseError);
  });
});

// ---------------------------------------------------------------------------
// applyBatch
// ---------------------------------------------------------------------------

describe('applyBatch', () => {
  it('add_task alone fails island rule (pre-fix behavior)', () => {
    const graph = readGraph(writeSample(makeTempDir()));
    const op: Operation = { op: 'add_task', id: 'orphan', name: 'Orphan', dependsOn: ['leaf'] };
    // orphan depends on leaf but nothing depends on orphan → island
    expect(() => applyBatch(graph, [op])).toThrow(VineValidationError);
  });

  it('add_task + add_dep fixes island rule', () => {
    const dir = makeTempDir();
    const file = writeSample(dir);
    let graph = readGraph(file);
    graph = applyBatch(graph, [
      { op: 'add_task', id: 'new-task', name: 'New Task', dependsOn: ['leaf'] },
      { op: 'add_dep', taskId: 'root', depId: 'new-task' },
    ]);
    writeGraph(file, graph);
    const reloaded = readGraph(file);
    expect(reloaded.tasks.has('new-task')).toBe(true);
    expect(getTask(reloaded, 'root').dependencies).toContain('new-task');
  });

  it('rejects batch resulting in cycle', () => {
    const dir = makeTempDir();
    const file = writeSample(dir);
    const graph = readGraph(file);
    // leaf -> child-a -> leaf would be a cycle
    expect(() => applyBatch(graph, [
      { op: 'add_dep', taskId: 'leaf', depId: 'child-a' },
    ])).toThrow(VineValidationError);
  });

  it('empty operations array passes (no-op)', () => {
    const graph = readGraph(writeSample(makeTempDir()));
    const result = applyBatch(graph, []);
    expect(result.tasks.size).toBe(graph.tasks.size);
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
    writeFileSync(join(rootDir, 'shared.vine'), SAMPLE_VINE, 'utf-8');
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
// Ref fixtures
// ---------------------------------------------------------------------------

const REF_VINE = `\
vine 1.1.0
title: Parent Project
---
[root] Root Task (started)
The root task.
-> child-a
-> ext-ref
---
[child-a] Child A (complete)
First child task.
-> leaf
---
ref [ext-ref] External Module (./child.vine)
A reference to an external vine file.
-> leaf
---
[leaf] Leaf Task (notstarted)
A leaf task.
`;

const CHILD_VINE = `\
vine 1.0.0
title: Child Module
---
[child-root] Child Root (notstarted)
Root of the child graph.
-> child-leaf
---
[child-leaf] Child Leaf (notstarted)
Leaf node in child graph.
`;

// ---------------------------------------------------------------------------
// vine_next (execution frontier)
// ---------------------------------------------------------------------------

describe('vine_next', () => {
  it('vine_next: returns leaves as ready on a fresh graph', () => {
    const dir = makeTempDir();
    const file = writeSample(dir);
    const graph = readGraph(file);
    const result = getActionableTasks(graph);

    // 'leaf' is the only task with no dependencies
    expect(result.ready.map((t) => t.id)).toEqual(['leaf']);
    expect(result.completable).toEqual([]);
    expect(result.expandable).toEqual([]);
  });

  it('vine_next: unblocks dependants when a leaf is set to complete', () => {
    const dir = makeTempDir();
    const file = writeSample(dir);

    let graph = readGraph(file);
    graph = setStatus(graph, 'leaf', 'complete');
    writeGraph(file, graph);

    const reloaded = readGraph(file);
    const result = getActionableTasks(reloaded);

    // child-a and child-b both depend only on leaf (now complete)
    // child-a is "complete" already in the fixture → not in ready
    // child-b is "planning" → should be in ready
    expect(result.ready.map((t) => t.id)).toEqual(['child-b']);
  });

  it('vine_next: reviewing task appears in completable when dependant starts', () => {
    const dir = makeTempDir();
    const file = writeSample(dir);

    let graph = readGraph(file);
    graph = setStatus(graph, 'leaf', 'reviewing');
    graph = setStatus(graph, 'child-a', 'started');
    writeGraph(file, graph);

    const reloaded = readGraph(file);
    const result = getActionableTasks(reloaded);

    expect(result.completable.map((t) => t.id)).toEqual(['leaf']);
  });

  it('vine_next: ref nodes on frontier appear in needs_expansion', () => {
    const dir = makeTempDir();
    const file = join(dir, 'ref.vine');
    writeFileSync(file, REF_VINE, 'utf-8');

    const graph = readGraph(file);
    const result = getActionableTasks(graph);

    // ext-ref depends on leaf (notstarted) → not on frontier yet
    // leaf has no deps → ready
    expect(result.ready.map((t) => t.id)).toEqual(['leaf']);
    expect(result.expandable).toEqual([]);

    // Now complete leaf → ext-ref should become expandable
    const updated = setStatus(graph, 'leaf', 'complete');
    writeGraph(file, updated);
    const reloaded = readGraph(file);
    const result2 = getActionableTasks(reloaded);
    expect(result2.expandable.map((t) => t.id)).toEqual(['ext-ref']);
  });

  it('vine_next: progress reflects file state after mutations', () => {
    const dir = makeTempDir();
    const file = writeSample(dir);

    const g = readGraph(file);
    // Fixture statuses: root=started, child-a=complete, child-b=planning, leaf=notstarted
    const result = getActionableTasks(g);
    expect(result.progress.total).toBe(4);
    expect(result.progress.complete).toBe(1); // child-a
    expect(result.progress.percentage).toBe(25);
    expect(result.progress.rootStatus).toBe('started');
  });
});
