import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
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
  updateTask,
  addDependency,
  removeDependency,
  addRef,
  updateRefUri,
  getRefs,
  expandVineRef,
  isValidStatus,
  VineError,
  VineParseError,
  EMPTY_ANNOTATIONS,
} from '@bacchus/core';
import type { ConcreteTask, RefTask } from '@bacchus/core';

import { readGraph, writeGraph, readFileContent, resolvePath, setRoots, getRoots } from '../src/io.js';

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
// Read-only operations (simulating tool handlers)
// ---------------------------------------------------------------------------

describe('read-only operations', () => {
  it('vine_validate: parse returns valid graph with correct task count', () => {
    const file = writeSample(makeTempDir());
    const graph = readGraph(file);
    expect(graph.tasks.size).toBe(4);
  });

  it('vine_show: getSummary returns correct summary', () => {
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

  it('vine_list: lists all tasks (4 in sample)', () => {
    const graph = readGraph(writeSample(makeTempDir()));
    expect(graph.order).toHaveLength(4);
  });

  it('vine_list with status filter: filterByStatus returns only matching', () => {
    const graph = readGraph(writeSample(makeTempDir()));
    const complete = filterByStatus(graph, 'complete');
    expect(complete).toHaveLength(1);
    expect(complete[0].id).toBe('child-a');
  });

  it('vine_list with search: searchTasks matches by text', () => {
    const graph = readGraph(writeSample(makeTempDir()));
    const results = searchTasks(graph, 'leaf');
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results.some((t) => t.id === 'leaf')).toBe(true);
  });

  it('vine_get_task: getTask returns correct task details', () => {
    const graph = readGraph(writeSample(makeTempDir()));
    const task = getTask(graph, 'child-b') as ConcreteTask;
    expect(task.shortName).toBe('Child B');
    expect(task.status).toBe('planning');
    expect(task.dependencies).toContain('leaf');
  });

  it('vine_get_descendants: getDescendants returns transitive dependants', () => {
    const graph = readGraph(writeSample(makeTempDir()));
    const desc = getDescendants(graph, 'leaf');
    const ids = desc.map((t) => t.id);
    expect(ids).toContain('child-a');
    expect(ids).toContain('child-b');
  });

  it('vine_search: searchTasks finds tasks by query', () => {
    const graph = readGraph(writeSample(makeTempDir()));
    const results = searchTasks(graph, 'Root');
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('root');
  });
});

// ---------------------------------------------------------------------------
// Mutation operations (simulating tool handlers)
// ---------------------------------------------------------------------------

describe('mutation operations', () => {
  it('vine_add_task: adds a task, write, re-read, verify', () => {
    const dir = makeTempDir();
    const file = writeSample(dir);
    let graph = readGraph(file);

    // First, make root depend on the new task so the graph stays connected.
    const root = getTask(graph, 'root') as ConcreteTask;
    const patchedRoot: ConcreteTask = {
      ...root,
      dependencies: [...root.dependencies, 'new-task'],
    };
    const patchedTasks = new Map(graph.tasks);
    patchedTasks.set('root', patchedRoot);
    graph = { ...graph, tasks: patchedTasks };

    const newTask: ConcreteTask = {
      kind: 'task',
      id: 'new-task',
      shortName: 'New Task',
      description: 'A brand new task.',
      status: 'notstarted',
      dependencies: ['leaf'],
      decisions: [],
      annotations: EMPTY_ANNOTATIONS,
      attachments: [],
    };
    graph = addTask(graph, newTask);
    writeGraph(file, graph);
    const reloaded = readGraph(file);
    expect(reloaded.tasks.has('new-task')).toBe(true);
    expect(reloaded.tasks.size).toBe(5);
  });

  it('vine_remove_task: removes a non-root task, write, re-read, verify', () => {
    const dir = makeTempDir();
    const file = writeSample(dir);
    let graph = readGraph(file);
    graph = removeTask(graph, 'leaf');
    writeGraph(file, graph);
    const reloaded = readGraph(file);
    expect(reloaded.tasks.has('leaf')).toBe(false);
    expect(reloaded.tasks.size).toBe(3);
  });

  it('vine_set_status: changes status, write, re-read, verify', () => {
    const dir = makeTempDir();
    const file = writeSample(dir);
    let graph = readGraph(file);
    graph = setStatus(graph, 'child-b', 'complete');
    writeGraph(file, graph);
    const reloaded = readGraph(file);
    const task = getTask(reloaded, 'child-b') as ConcreteTask;
    expect(task.status).toBe('complete');
  });

  it('vine_update_task: updates shortName/description, write, re-read, verify', () => {
    const dir = makeTempDir();
    const file = writeSample(dir);
    let graph = readGraph(file);
    graph = updateTask(graph, 'child-a', { shortName: 'Updated A', description: 'New desc.' });
    writeGraph(file, graph);
    const reloaded = readGraph(file);
    const task = getTask(reloaded, 'child-a');
    expect(task.shortName).toBe('Updated A');
    expect(task.description).toBe('New desc.');
  });

  it('vine_add_dependency: adds edge, write, re-read, verify', () => {
    const dir = makeTempDir();
    const file = writeSample(dir);
    let graph = readGraph(file);
    graph = addDependency(graph, 'root', 'leaf');
    writeGraph(file, graph);
    const reloaded = readGraph(file);
    const task = getTask(reloaded, 'root');
    expect(task.dependencies).toContain('leaf');
  });

  it('vine_remove_dependency: removes edge, write, re-read, verify', () => {
    const dir = makeTempDir();
    const file = writeSample(dir);
    let graph = readGraph(file);
    graph = removeDependency(graph, 'child-a', 'leaf');
    writeGraph(file, graph);
    const reloaded = readGraph(file);
    const task = getTask(reloaded, 'child-a');
    expect(task.dependencies).not.toContain('leaf');
  });
});

// ---------------------------------------------------------------------------
// Error handling
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
// Path resolution
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
// Ref operations
// ---------------------------------------------------------------------------

describe('ref operations', () => {
  it('vine_add_ref: adds a ref node, write, re-read, verify', () => {
    const dir = makeTempDir();
    const file = writeSample(dir);
    let graph = readGraph(file);

    // Wire root to depend on the new ref so graph stays connected
    const root = getTask(graph, 'root') as ConcreteTask;
    const patchedRoot: ConcreteTask = {
      ...root,
      dependencies: [...root.dependencies, 'my-ref'],
    };
    const patchedTasks = new Map(graph.tasks);
    patchedTasks.set('root', patchedRoot);
    graph = { ...graph, tasks: patchedTasks };

    const refTask: RefTask = {
      kind: 'ref',
      id: 'my-ref',
      shortName: 'My Ref',
      description: 'A reference node.',
      vine: './other.vine',
      dependencies: ['leaf'],
      decisions: [],
      annotations: EMPTY_ANNOTATIONS,
    };
    graph = addRef(graph, refTask);
    writeGraph(file, graph);

    const reloaded = readGraph(file);
    expect(reloaded.tasks.has('my-ref')).toBe(true);
    const task = getTask(reloaded, 'my-ref');
    expect(task.kind).toBe('ref');
    if (task.kind === 'ref') {
      expect(task.vine).toBe('./other.vine');
    }
  });

  it('vine_add_ref: missing vine URI throws error', () => {
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

  it('vine_get_refs: returns ref nodes from a graph with refs', () => {
    const dir = makeTempDir();
    const file = join(dir, 'ref.vine');
    writeFileSync(file, REF_VINE, 'utf-8');
    const graph = readGraph(file);
    const refs = getRefs(graph);
    expect(refs).toHaveLength(1);
    expect(refs[0].id).toBe('ext-ref');
    expect(refs[0].vine).toBe('./child.vine');
  });

  it('vine_get_refs: returns empty array when no refs exist', () => {
    const graph = readGraph(writeSample(makeTempDir()));
    const refs = getRefs(graph);
    expect(refs).toHaveLength(0);
  });

  it('vine_update_ref_uri: updates the URI of a ref node', () => {
    const dir = makeTempDir();
    const file = join(dir, 'ref.vine');
    writeFileSync(file, REF_VINE, 'utf-8');
    let graph = readGraph(file);
    graph = updateRefUri(graph, 'ext-ref', './updated.vine');
    writeGraph(file, graph);

    const reloaded = readGraph(file);
    const task = getTask(reloaded, 'ext-ref');
    expect(task.kind).toBe('ref');
    if (task.kind === 'ref') {
      expect(task.vine).toBe('./updated.vine');
    }
  });

  it('vine_update_ref_uri: throws on non-ref node', () => {
    const graph = readGraph(writeSample(makeTempDir()));
    expect(() => updateRefUri(graph, 'root', './other.vine')).toThrow();
  });

  it('vine_expand_ref: expands a ref by inlining child graph', () => {
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
// vine_next_tasks (getActionableTasks via I/O layer)
// ---------------------------------------------------------------------------

describe('vine_next_tasks', () => {
  it('returns leaves as ready on a fresh graph', () => {
    const dir = makeTempDir();
    const file = writeSample(dir);
    const graph = readGraph(file);
    const result = getActionableTasks(graph);

    // 'leaf' is the only task with no dependencies
    expect(result.ready.map((t) => t.id)).toEqual(['leaf']);
    expect(result.completable).toEqual([]);
    expect(result.expandable).toEqual([]);
  });

  it('unblocks dependants when a leaf is set to complete', () => {
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

  it('reviewing task appears in completable when dependant starts', () => {
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

  it('ref nodes on frontier appear in needs_expansion', () => {
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

  it('progress reflects file state after mutations', () => {
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
