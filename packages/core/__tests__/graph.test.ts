import { describe, it, expect } from 'vitest';
import { parse } from '../src/parser.js';
import {
  getTask,
  getRoot,
  getDependencies,
  getDependants,
} from '../src/graph.js';
import { VineError } from '../src/errors.js';
import { VINE_EXAMPLE } from './fixtures/vine-example.js';
import type { ConcreteTask } from '../src/types.js';

const graph = parse(VINE_EXAMPLE);

describe('getTask', () => {
  it('returns correct task', () => {
    const task = getTask(graph, 'vine-ts');

    expect(task.id).toBe('vine-ts');
    expect(task.shortName).toBe('VINE TypeScript Library');
    expect((task as ConcreteTask).status).toBe('started');
    expect(task.description).toBe('Parse and validate .vine files.');
    expect(task.dependencies).toEqual(['vine-format']);
    expect(task.decisions).toEqual([]);
  });

  it('throws VineError for unknown id', () => {
    expect(() => getTask(graph, 'nonexistent')).toThrow(VineError);
  });
});

describe('getRoot', () => {
  it('returns the first task', () => {
    const root = getRoot(graph);

    expect(root.id).toBe('root');
    expect(root.shortName).toBe('Project Bacchus');
  });
});

describe('getDependencies', () => {
  it('returns direct deps', () => {
    const deps = getDependencies(graph, 'graph-cli');
    const depIds = deps.map((t) => t.id);

    expect(depIds).toEqual(['build-ui', 'vine-ts']);
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
