import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readGraph, writeGraph } from '../src/io.js';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  getSummary,
  filterByStatus,
  searchTasks,
  addTask,
  setStatus,
  VineParseError,
  VineValidationError,
} from '@bacchus/core';
import type { Task, VineGraph, ConcreteTask } from '@bacchus/core';

/**
 * Patch the root task's dependencies to include a new id, so that
 * `addTask()` validation won't reject the new task as an island.
 */
function patchRootDeps(graph: VineGraph, newDepId: string): VineGraph {
  const rootId = graph.order[0];
  if (rootId === undefined) throw new Error('empty graph');
  const root = graph.tasks.get(rootId);
  if (!root) throw new Error('root task missing');
  const patched: Task = {
    ...root,
    dependencies: [...root.dependencies, newDepId],
  };
  const tasks = new Map(graph.tasks);
  tasks.set(rootId, patched);
  return { ...graph, tasks };
}

const SAMPLE_VINE = `\
vine 1.0.0
---
[root] Web Application (planning)
The full web application project.
-> dashboard
---
[dashboard] Dashboard UI (notstarted)
Build the main dashboard interface.
-> auth
---
[auth] Authentication Module (started)
Implement user login and session management.
-> setup
---
[setup] Environment Setup (complete)
Install dependencies and configure the build system.
`;

const INVALID_SYNTAX_VINE = `\
This is not a valid vine file at all.
Just random text.
`;

const CYCLE_VINE = `\
vine 1.0.0
---
[a] Task A (notstarted)
Description A.
-> b
---
[b] Task B (notstarted)
Description B.
-> a
`;

let tempDir: string;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'vine-cli-test-'));
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// readGraph
// ---------------------------------------------------------------------------

describe('readGraph', () => {
  it('reads and parses a valid .vine file from disk', () => {
    const filePath = join(tempDir, 'test.vine');
    writeFileSync(filePath, SAMPLE_VINE, 'utf-8');

    const graph = readGraph(filePath);

    expect(graph.tasks.size).toBe(4);
    expect(graph.order).toEqual(['root', 'dashboard', 'auth', 'setup']);

    const setup = graph.tasks.get('setup');
    expect(setup).toBeDefined();
    expect(setup!.shortName).toBe('Environment Setup');
    expect(setup!.status).toBe('complete');
    expect(setup!.dependencies).toEqual([]);

    const auth = graph.tasks.get('auth');
    expect(auth).toBeDefined();
    expect(auth!.status).toBe('started');
    expect(auth!.dependencies).toEqual(['setup']);
  });

  it('throws VineParseError for invalid syntax', () => {
    const filePath = join(tempDir, 'test.vine');
    writeFileSync(filePath, INVALID_SYNTAX_VINE, 'utf-8');

    expect(() => readGraph(filePath)).toThrow(VineParseError);
  });

  it('throws VineValidationError for structural error (cycle)', () => {
    const filePath = join(tempDir, 'test.vine');
    writeFileSync(filePath, CYCLE_VINE, 'utf-8');

    expect(() => readGraph(filePath)).toThrow(VineValidationError);
  });

  it('throws ENOENT for nonexistent file', () => {
    const filePath = join(tempDir, 'does-not-exist.vine');

    expect(() => readGraph(filePath)).toThrow(/ENOENT/);
  });
});

// ---------------------------------------------------------------------------
// writeGraph
// ---------------------------------------------------------------------------

describe('writeGraph', () => {
  it('serializes and writes a graph to disk, readable back as identical', () => {
    const filePath = join(tempDir, 'test.vine');
    writeFileSync(filePath, SAMPLE_VINE, 'utf-8');

    const graph = readGraph(filePath);

    const outputPath = join(tempDir, 'output.vine');
    writeGraph(outputPath, graph);

    const roundTripped = readGraph(outputPath);

    expect(roundTripped.order).toEqual(graph.order);
    expect(roundTripped.tasks.size).toBe(graph.tasks.size);

    for (const id of graph.order) {
      const original = graph.tasks.get(id);
      const restored = roundTripped.tasks.get(id);
      expect(original).toBeDefined();
      expect(restored).toBeDefined();
      expect(restored!.id).toBe(original!.id);
      expect(restored!.shortName).toBe(original!.shortName);
      expect(restored!.status).toBe(original!.status);
      expect(restored!.description).toBe(original!.description);
      expect([...restored!.dependencies]).toEqual([...original!.dependencies]);
    }
  });
});

// ---------------------------------------------------------------------------
// Round-trip: add task
// ---------------------------------------------------------------------------

describe('round-trip: add task', () => {
  it('adds a new task and persists it through write/read', () => {
    const filePath = join(tempDir, 'test.vine');
    writeFileSync(filePath, SAMPLE_VINE, 'utf-8');

    let graph = readGraph(filePath);

    const newTask: ConcreteTask = {
      kind: 'task',
      id: 'api',
      shortName: 'API Layer',
      description: 'REST API endpoints.',
      status: 'notstarted',
      dependencies: ['auth'],
      decisions: [],
      attachments: [],
    };

    graph = patchRootDeps(graph, 'api');
    graph = addTask(graph, newTask);
    writeGraph(filePath, graph);

    const reloaded = readGraph(filePath);

    expect(reloaded.tasks.has('api')).toBe(true);
    const api = reloaded.tasks.get('api');
    expect(api).toBeDefined();
    expect(api!.shortName).toBe('API Layer');
    expect(api!.status).toBe('notstarted');
    expect(api!.dependencies).toEqual(['auth']);
  });

  it('preserves original tasks after add', () => {
    const filePath = join(tempDir, 'test.vine');
    writeFileSync(filePath, SAMPLE_VINE, 'utf-8');

    const original = readGraph(filePath);
    const originalIds = [...original.order];

    const newTask: ConcreteTask = {
      kind: 'task',
      id: 'testing',
      shortName: 'Test Suite',
      description: 'Automated tests.',
      status: 'notstarted',
      dependencies: ['setup'],
      decisions: [],
      attachments: [],
    };

    const patched = patchRootDeps(original, 'testing');
    const updated = addTask(patched, newTask);
    writeGraph(filePath, updated);

    const reloaded = readGraph(filePath);

    // All original tasks except root should be completely unchanged.
    // Root's dependencies were patched to include the new task.
    for (const id of originalIds) {
      const before = original.tasks.get(id);
      const after = reloaded.tasks.get(id);
      expect(before).toBeDefined();
      expect(after).toBeDefined();
      expect(after!.shortName).toBe(before!.shortName);
      expect(after!.status).toBe(before!.status);
      if (id !== 'root') {
        expect([...after!.dependencies]).toEqual([...before!.dependencies]);
      }
    }
    // Root should still have its original dependency plus the new one.
    const rootAfter = reloaded.tasks.get('root');
    expect(rootAfter).toBeDefined();
    expect(rootAfter!.dependencies).toContain('dashboard');
    expect(rootAfter!.dependencies).toContain('testing');
  });
});

// ---------------------------------------------------------------------------
// Round-trip: update status
// ---------------------------------------------------------------------------

describe('round-trip: update status', () => {
  it('updates a task status and persists it through write/read', () => {
    const filePath = join(tempDir, 'test.vine');
    writeFileSync(filePath, SAMPLE_VINE, 'utf-8');

    let graph = readGraph(filePath);
    expect(graph.tasks.get('auth')?.status).toBe('started');

    graph = setStatus(graph, 'auth', 'complete');
    writeGraph(filePath, graph);

    const reloaded = readGraph(filePath);
    const auth = reloaded.tasks.get('auth');
    expect(auth).toBeDefined();
    expect(auth!.status).toBe('complete');
  });

  it('leaves other task statuses unchanged', () => {
    const filePath = join(tempDir, 'test.vine');
    writeFileSync(filePath, SAMPLE_VINE, 'utf-8');

    const original = readGraph(filePath);
    const updated = setStatus(original, 'auth', 'complete');
    writeGraph(filePath, updated);

    const reloaded = readGraph(filePath);

    const unchanged: Array<[string, string]> = [
      ['setup', 'complete'],
      ['dashboard', 'notstarted'],
      ['root', 'planning'],
    ];

    for (const [id, expectedStatus] of unchanged) {
      const task = reloaded.tasks.get(id);
      expect(task).toBeDefined();
      expect(task!.status).toBe(expectedStatus);
    }
  });
});

// ---------------------------------------------------------------------------
// Integration with search
// ---------------------------------------------------------------------------

describe('integration with search', () => {
  it('getSummary returns correct counts', () => {
    const filePath = join(tempDir, 'test.vine');
    writeFileSync(filePath, SAMPLE_VINE, 'utf-8');

    const graph = readGraph(filePath);
    const summary = getSummary(graph);

    expect(summary.total).toBe(4);
    expect(summary.rootId).toBe('root');
    expect(summary.rootName).toBe('Web Application');
    expect(summary.byStatus.complete).toBe(1);
    expect(summary.byStatus.started).toBe(1);
    expect(summary.byStatus.notstarted).toBe(1);
    expect(summary.byStatus.planning).toBe(1);
    expect(summary.byStatus.blocked).toBe(0);
    expect(summary.byStatus.reviewing).toBe(0);
    expect(summary.leafCount).toBe(1);
  });

  it('filterByStatus returns matching tasks', () => {
    const filePath = join(tempDir, 'test.vine');
    writeFileSync(filePath, SAMPLE_VINE, 'utf-8');

    const graph = readGraph(filePath);

    const complete = filterByStatus(graph, 'complete');
    expect(complete).toHaveLength(1);
    expect(complete[0]?.id).toBe('setup');

    const notstarted = filterByStatus(graph, 'notstarted');
    expect(notstarted).toHaveLength(1);
    expect(notstarted[0]?.id).toBe('dashboard');

    const blocked = filterByStatus(graph, 'blocked');
    expect(blocked).toHaveLength(0);
  });

  it('searchTasks returns matching tasks by substring', () => {
    const filePath = join(tempDir, 'test.vine');
    writeFileSync(filePath, SAMPLE_VINE, 'utf-8');

    const graph = readGraph(filePath);

    const results = searchTasks(graph, 'dashboard');
    expect(results).toHaveLength(1);
    expect(results[0]?.id).toBe('dashboard');

    const byDescription = searchTasks(graph, 'session');
    expect(byDescription).toHaveLength(1);
    expect(byDescription[0]?.id).toBe('auth');

    const caseInsensitive = searchTasks(graph, 'ENVIRONMENT');
    expect(caseInsensitive).toHaveLength(1);
    expect(caseInsensitive[0]?.id).toBe('setup');

    const noMatch = searchTasks(graph, 'zzz-nonexistent');
    expect(noMatch).toHaveLength(0);
  });
});
