import { describe, it, expect } from 'vitest';
import { parse } from '../src/parser.js';
import { VineError } from '../src/errors.js';
import {
  filterByStatus,
  searchTasks,
  getLeaves,
  getRefs,
  getDescendants,
  getSummary,
} from '../src/search.js';

const VINE_TEXT = [
  'vine 1.0.0',
  '---',
  '[root] Launch Product (planning)',
  'Ship the product to users.',
  '-> deploy',
  '---',
  '[deploy] Deploy Pipeline (blocked)',
  'Set up CI/CD and deployment.',
  '-> docs',
  '-> frontend',
  '---',
  '[frontend] Build Frontend (started)',
  'Build the React app.',
  '-> api',
  '-> design',
  '---',
  '[docs] Write Docs (notstarted)',
  'Documentation for the project.',
  '-> api',
  '---',
  '[api] Build API (started)',
  'Implement REST endpoints.',
  '-> design',
  '---',
  '[design] Design System (complete)',
  'Create the visual design language.',
].join('\n');

const graph = parse(VINE_TEXT);

describe('filterByStatus', () => {
  it("returns [frontend, api] for 'started'", () => {
    const result = filterByStatus(graph, 'started');
    expect(result.map((t) => t.id)).toEqual(['frontend', 'api']);
  });

  it("returns [design] for 'complete'", () => {
    const result = filterByStatus(graph, 'complete');
    expect(result.map((t) => t.id)).toEqual(['design']);
  });

  it("returns [docs] for 'notstarted'", () => {
    const result = filterByStatus(graph, 'notstarted');
    expect(result.map((t) => t.id)).toEqual(['docs']);
  });

  it('returns empty array when no tasks match', () => {
    // all statuses are accounted for; create a status filter that yields nothing
    // by checking a status that exists but has zero matches after we know the graph
    // 'blocked' has deploy, 'planning' has root — they exist, so instead filter
    // a freshly-parsed single-task graph for a missing status
    const small = parse('vine 1.0.0\n---\n[only] Only Task (complete)\nDone.');
    const result = filterByStatus(small, 'blocked');
    expect(result).toEqual([]);
  });

  it('results are in graph.order', () => {
    const result = filterByStatus(graph, 'started');
    const ids = result.map((t) => t.id);
    const orderIndices = ids.map((id) => graph.order.indexOf(id));
    for (let i = 1; i < orderIndices.length; i++) {
      expect(orderIndices[i]).toBeGreaterThan(orderIndices[i - 1]!);
    }
  });

  it('ref nodes are not returned for any status filter', () => {
    const refVine = [
      'vine 1.1.0',
      '---',
      '[root] Root (started)',
      '-> ext',
      '---',
      'ref [ext] External (./other.vine)',
    ].join('\n');
    const refGraph = parse(refVine);
    const started = filterByStatus(refGraph, 'started');
    expect(started.map((t) => t.id)).toEqual(['root']);
    // ref node should not appear in any status filter
    const allStatuses = [
      'complete',
      'started',
      'reviewing',
      'planning',
      'notstarted',
      'blocked',
    ] as const;
    for (const s of allStatuses) {
      const result = filterByStatus(refGraph, s);
      expect(result.every((t) => t.kind === 'task')).toBe(true);
    }
  });
});

describe('searchTasks', () => {
  it("'build' matches frontend and api (case insensitive)", () => {
    const result = searchTasks(graph, 'build');
    expect(result.map((t) => t.id)).toEqual(['frontend', 'api']);
  });

  it("'REST' matches api by description", () => {
    const result = searchTasks(graph, 'REST');
    expect(result.map((t) => t.id)).toEqual(['api']);
  });

  it('empty string returns all tasks', () => {
    const result = searchTasks(graph, '');
    expect(result.map((t) => t.id)).toEqual([
      'root',
      'deploy',
      'frontend',
      'docs',
      'api',
      'design',
    ]);
  });

  it("'zzzzz' returns empty array", () => {
    const result = searchTasks(graph, 'zzzzz');
    expect(result).toEqual([]);
  });

  it('finds ref nodes by name/description', () => {
    const refVine = [
      'vine 1.1.0',
      '---',
      '[root] Root (started)',
      '-> ext',
      '---',
      'ref [ext] External Library (./other.vine)',
      'Points to the external library.',
    ].join('\n');
    const refGraph = parse(refVine);

    const result = searchTasks(refGraph, 'External');
    expect(result.map((t) => t.id)).toContain('ext');
  });
});

describe('getLeaves', () => {
  it('returns [design] as the only task with no dependencies', () => {
    const result = getLeaves(graph);
    expect(result.map((t) => t.id)).toEqual(['design']);
  });
});

describe('getRefs', () => {
  it('returns only ref nodes in graph order', () => {
    const refVine = [
      'vine 1.1.0',
      '---',
      '[root] Root (started)',
      '-> ext-a',
      '-> task-a',
      '-> ext-b',
      '---',
      'ref [ext-a] External A (./a.vine)',
      '-> task-a',
      '---',
      '[task-a] Task A (complete)',
      '---',
      'ref [ext-b] External B (./b.vine)',
    ].join('\n');
    const refGraph = parse(refVine);

    const result = getRefs(refGraph);
    expect(result.map((t) => t.id)).toEqual(['ext-a', 'ext-b']);
    expect(result.every((t) => t.kind === 'ref')).toBe(true);
  });

  it('returns empty array when no refs exist', () => {
    const result = getRefs(graph);
    expect(result).toEqual([]);
  });
});

describe('getDescendants', () => {
  it("descendants of 'design' includes all other tasks", () => {
    const result = getDescendants(graph, 'design');
    expect(result.map((t) => t.id)).toEqual([
      'root',
      'deploy',
      'frontend',
      'docs',
      'api',
    ]);
  });

  it("descendants of 'root' is empty", () => {
    const result = getDescendants(graph, 'root');
    expect(result).toEqual([]);
  });

  it("descendants of 'api' = [root, deploy, frontend, docs]", () => {
    const result = getDescendants(graph, 'api');
    expect(result.map((t) => t.id)).toEqual([
      'root',
      'deploy',
      'frontend',
      'docs',
    ]);
  });

  it('throws VineError for nonexistent task', () => {
    expect(() => getDescendants(graph, 'nonexistent')).toThrow(VineError);
  });
});

describe('getSummary', () => {
  it('returns correct aggregate summary', () => {
    const summary = getSummary(graph);

    expect(summary.total).toBe(6);
    expect(summary.byStatus).toEqual({
      complete: 1,
      started: 2,
      reviewing: 0,
      notstarted: 1,
      blocked: 1,
      planning: 1,
    });
    expect(summary.rootId).toBe('root');
    expect(summary.rootName).toBe('Launch Product');
    expect(summary.leafCount).toBe(1);
  });

  it('handles ref nodes without crashing', () => {
    const refVine = [
      'vine 1.1.0',
      '---',
      '[root] Root (started)',
      '-> ext',
      '---',
      '[task-a] Task A (complete)',
      '---',
      'ref [ext] External (./other.vine)',
      '-> task-a',
    ].join('\n');
    const refGraph = parse(refVine);
    const summary = getSummary(refGraph);

    expect(summary.total).toBe(3);
    expect(summary.byStatus.started).toBe(1);
    expect(summary.byStatus.complete).toBe(1);
    // ref node has undefined status — should not crash or pollute counts
    expect(Number.isNaN(summary.byStatus.notstarted)).toBe(false);
  });
});
