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
      attachments: [] as readonly [],
    });
    order.push(t.id);
  }

  return { version: '1.0.0', title: undefined, delimiter: '---', tasks: taskMap, order };
}

describe('validate', () => {
  it('passes for a valid graph', () => {
    const graph = makeGraph([
      { id: 'root', deps: ['a', 'b'] },
      { id: 'a' },
      { id: 'b', deps: ['a'] },
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
      { id: 'root', deps: ['a'] },
      { id: 'a', deps: ['nonexistent'] },
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
      { id: 'root', deps: ['a', 'b'] },
      { id: 'a', deps: ['b'] },
      { id: 'b', deps: ['a'] },
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
      { id: 'root', deps: ['a', 'b', 'c'] },
      { id: 'a', deps: ['c'] },
      { id: 'b', deps: ['a'] },
      { id: 'c', deps: ['b'] },
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
      { id: 'root', deps: ['connected'] },
      { id: 'island' },
      { id: 'connected' },
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
