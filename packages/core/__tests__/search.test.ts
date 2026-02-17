import { describe, it, expect } from 'vitest';
import { parse } from '../src/parser.js';
import { VineError } from '../src/errors.js';
import {
  filterByStatus,
  searchTasks,
  getLeaves,
  getDescendants,
  getSummary,
} from '../src/search.js';

const VINE_TEXT = [
  '[design] Design System (complete)',
  'Create the visual design language.',
  '',
  '[api] Build API (started)',
  'Implement REST endpoints.',
  '-> design',
  '',
  '[frontend] Build Frontend (started)',
  'Build the React app.',
  '-> design',
  '-> api',
  '',
  '[docs] Write Docs (notstarted)',
  'Documentation for the project.',
  '-> api',
  '',
  '[deploy] Deploy Pipeline (blocked)',
  'Set up CI/CD and deployment.',
  '-> frontend',
  '-> docs',
  '',
  '[root] Launch Product (planning)',
  'Ship the product to users.',
  '-> deploy',
].join('\n');

const graph = parse(VINE_TEXT);

describe('filterByStatus', () => {
  it("returns [api, frontend] for 'started'", () => {
    const result = filterByStatus(graph, 'started');
    expect(result.map((t) => t.id)).toEqual(['api', 'frontend']);
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
    const small = parse('[only] Only Task (complete)\nDone.');
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
});

describe('searchTasks', () => {
  it("'build' matches api and frontend (case insensitive)", () => {
    const result = searchTasks(graph, 'build');
    expect(result.map((t) => t.id)).toEqual(['api', 'frontend']);
  });

  it("'REST' matches api by description", () => {
    const result = searchTasks(graph, 'REST');
    expect(result.map((t) => t.id)).toEqual(['api']);
  });

  it('empty string returns all tasks', () => {
    const result = searchTasks(graph, '');
    expect(result.map((t) => t.id)).toEqual([
      'design',
      'api',
      'frontend',
      'docs',
      'deploy',
      'root',
    ]);
  });

  it("'zzzzz' returns empty array", () => {
    const result = searchTasks(graph, 'zzzzz');
    expect(result).toEqual([]);
  });
});

describe('getLeaves', () => {
  it('returns [design] as the only task with no dependencies', () => {
    const result = getLeaves(graph);
    expect(result.map((t) => t.id)).toEqual(['design']);
  });
});

describe('getDescendants', () => {
  it("descendants of 'design' includes all other tasks", () => {
    const result = getDescendants(graph, 'design');
    expect(result.map((t) => t.id)).toEqual([
      'api',
      'frontend',
      'docs',
      'deploy',
      'root',
    ]);
  });

  it("descendants of 'root' is empty", () => {
    const result = getDescendants(graph, 'root');
    expect(result).toEqual([]);
  });

  it("descendants of 'api' = [frontend, docs, deploy, root]", () => {
    const result = getDescendants(graph, 'api');
    expect(result.map((t) => t.id)).toEqual([
      'frontend',
      'docs',
      'deploy',
      'root',
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
      notstarted: 1,
      blocked: 1,
      planning: 1,
    });
    expect(summary.rootId).toBe('root');
    expect(summary.rootName).toBe('Launch Product');
    expect(summary.leafCount).toBe(1);
  });
});
