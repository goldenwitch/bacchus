import { describe, it, expect } from 'vitest';
import { validate } from '../src/validator.js';
import { VineValidationError } from '../src/errors.js';
import type { VineGraph } from '../src/types.js';

function makeGraph(tasks: Array<{ id: string; deps?: string[] }>): VineGraph {
  const taskMap = new Map();
  const order: string[] = [];

  for (const t of tasks) {
    taskMap.set(t.id, {
      id: t.id,
      shortName: t.id,
      description: '',
      status: 'complete' as const,
      dependencies: t.deps ?? [],
      decisions: [],
    });
    order.push(t.id);
  }

  return { tasks: taskMap, order };
}

describe('validate', () => {
  it('passes for a valid graph', () => {
    const graph = makeGraph([
      { id: 'a' },
      { id: 'b', deps: ['a'] },
      { id: 'root', deps: ['a', 'b'] },
    ]);

    expect(() => validate(graph)).not.toThrow();
  });

  it('throws at-least-one-task for empty graph', () => {
    const graph = makeGraph([]);

    try {
      validate(graph);
      expect.unreachable('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(VineValidationError);
      expect((e as VineValidationError).constraint).toBe('at-least-one-task');
    }
  });

  it('throws valid-dependency-refs for missing dep', () => {
    const graph = makeGraph([
      { id: 'a', deps: ['nonexistent'] },
      { id: 'root', deps: ['a'] },
    ]);

    try {
      validate(graph);
      expect.unreachable('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(VineValidationError);
      const err = e as VineValidationError;
      expect(err.constraint).toBe('valid-dependency-refs');
      expect(err.details).toHaveProperty('taskId', 'a');
      expect(err.details).toHaveProperty('missingDep', 'nonexistent');
    }
  });

  it('throws no-cycles for direct cycle', () => {
    const graph = makeGraph([
      { id: 'a', deps: ['b'] },
      { id: 'b', deps: ['a'] },
      { id: 'root', deps: ['a', 'b'] },
    ]);

    try {
      validate(graph);
      expect.unreachable('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(VineValidationError);
      const err = e as VineValidationError;
      expect(err.constraint).toBe('no-cycles');
      expect(err.details).toHaveProperty('cycle');
      expect(Array.isArray((err.details as { cycle: string[] }).cycle)).toBe(
        true,
      );
    }
  });

  it('throws no-cycles for transitive cycle', () => {
    const graph = makeGraph([
      { id: 'a', deps: ['c'] },
      { id: 'b', deps: ['a'] },
      { id: 'c', deps: ['b'] },
      { id: 'root', deps: ['a', 'b', 'c'] },
    ]);

    try {
      validate(graph);
      expect.unreachable('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(VineValidationError);
      expect((e as VineValidationError).constraint).toBe('no-cycles');
    }
  });

  it('throws no-islands for disconnected task', () => {
    const graph = makeGraph([
      { id: 'island' },
      { id: 'connected' },
      { id: 'root', deps: ['connected'] },
    ]);

    try {
      validate(graph);
      expect.unreachable('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(VineValidationError);
      const err = e as VineValidationError;
      expect(err.constraint).toBe('no-islands');
      expect(
        (err.details as { islandTaskIds: string[] }).islandTaskIds,
      ).toContain('island');
    }
  });

  it('valid single-task graph', () => {
    const graph = makeGraph([{ id: 'root' }]);

    expect(() => validate(graph)).not.toThrow();
  });
});
