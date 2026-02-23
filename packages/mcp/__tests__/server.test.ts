import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  parse,
  getTask,
  getDescendants,
  getSummary,
  filterByStatus,
  searchTasks,
  addTask,
  removeTask,
  setStatus,
  updateTask,
  addDependency,
  removeDependency,
  isValidStatus,
  VineError,
  VineParseError,
  EMPTY_ANNOTATIONS,
} from '@bacchus/core';
import type { ConcreteTask } from '@bacchus/core';

import { readGraph, writeGraph, resolvePath } from '../src/io.js';

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
