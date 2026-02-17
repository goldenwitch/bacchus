import { describe, it, expect } from 'vitest';
import { parse } from '../src/parser.js';
import {
  getTask,
  getRoot,
  getDependencies,
  getDependants,
} from '../src/graph.js';
import { VineError } from '../src/errors.js';

const VINE_EXAMPLE = [
  '[vine-format] Define VINE Format (complete)',
  'Specify the .vine file format.',
  '> Keep it line-oriented, no nesting.',
  '',
  '[vine-ts] VINE TypeScript Library (started)',
  'Parse and validate .vine files.',
  '-> vine-format',
  '',
  '[build-ui] Build Graph Visualizer (notstarted)',
  'Render the task graph with d3-force.',
  '-> vine-ts',
  '',
  '[graph-cli] Graph Interface (planning)',
  'CLI for pulling, creating, and updating work.',
  '-> vine-ts',
  '-> build-ui',
  '',
  '[root] Project Bacchus (started)',
  'Build a graph of tasks and visualize them as a vine.',
  '-> vine-format',
  '-> vine-ts',
  '-> build-ui',
  '-> graph-cli',
].join('\n');

const graph = parse(VINE_EXAMPLE);

describe('getTask', () => {
  it('returns correct task', () => {
    const task = getTask(graph, 'vine-ts');

    expect(task.id).toBe('vine-ts');
    expect(task.shortName).toBe('VINE TypeScript Library');
    expect(task.status).toBe('started');
    expect(task.description).toBe('Parse and validate .vine files.');
    expect(task.dependencies).toEqual(['vine-format']);
    expect(task.decisions).toEqual([]);
  });

  it('throws VineError for unknown id', () => {
    expect(() => getTask(graph, 'nonexistent')).toThrow(VineError);
  });
});

describe('getRoot', () => {
  it('returns the last task', () => {
    const root = getRoot(graph);

    expect(root.id).toBe('root');
    expect(root.shortName).toBe('Project Bacchus');
  });
});

describe('getDependencies', () => {
  it('returns direct deps', () => {
    const deps = getDependencies(graph, 'graph-cli');
    const depIds = deps.map((t) => t.id);

    expect(depIds).toEqual(['vine-ts', 'build-ui']);
  });

  it('returns empty for leaf task', () => {
    const deps = getDependencies(graph, 'vine-format');

    expect(deps).toEqual([]);
  });
});

describe('getDependants', () => {
  it('returns tasks that depend on given task', () => {
    const dependants = getDependants(graph, 'vine-ts');
    const ids = dependants.map((t) => t.id);

    expect(ids).toContain('build-ui');
    expect(ids).toContain('graph-cli');
    expect(ids).toContain('root');
    expect(ids).toHaveLength(3);
  });

  it('returns empty for root', () => {
    const dependants = getDependants(graph, 'root');

    expect(dependants).toEqual([]);
  });
});
