import { describe, it, expect } from 'vitest';
import {
  addTask,
  removeTask,
  setStatus,
  updateTask,
  addDependency,
  removeDependency,
} from '../src/mutations.js';
import { parse } from '../src/parser.js';
import { serialize } from '../src/serializer.js';
import { VineError, VineValidationError } from '../src/errors.js';
import type { Task, VineGraph } from '../src/types.js';

// ---------------------------------------------------------------------------
// Base graph
// ---------------------------------------------------------------------------

const baseVine = [
  '[leaf-a] Leaf A (complete)',
  'A simple leaf task.',
  '',
  '[leaf-b] Leaf B (started)',
  'Another leaf task.',
  '',
  '[middle] Middle Task (planning)',
  'Depends on both leaves.',
  '-> leaf-a',
  '-> leaf-b',
  '',
  '[root] Root Project (started)',
  'The root task.',
  '-> middle',
  '',
].join('\n');

const baseGraph: VineGraph = parse(baseVine);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Return a copy of `graph` with `depId` appended to root's dependencies.
 * This does NOT run validate — it is only used to prepare input for addTask.
 */
function patchRootDeps(graph: VineGraph, depId: string): VineGraph {
  const rootId = graph.order[graph.order.length - 1];
  const root = graph.tasks.get(rootId)!;
  const updatedRoot: Task = {
    ...root,
    dependencies: [...root.dependencies, depId],
  };
  const newTasks = new Map(graph.tasks);
  newTasks.set(rootId, updatedRoot);
  return { tasks: newTasks, order: graph.order };
}

// ---------------------------------------------------------------------------
// addTask
// ---------------------------------------------------------------------------

describe('addTask', () => {
  it('adds a task and verifies serialized output', () => {
    const patched = patchRootDeps(baseGraph, 'new-task');
    const newTask: Task = {
      id: 'new-task',
      shortName: 'New Task',
      description: 'Brand new.',
      status: 'notstarted',
      dependencies: ['leaf-a'],
      decisions: [],
    };
    const result = addTask(patched, newTask);

    expect(serialize(result)).toBe(
      [
        '[leaf-a] Leaf A (complete)',
        'A simple leaf task.',
        '',
        '[leaf-b] Leaf B (started)',
        'Another leaf task.',
        '',
        '[middle] Middle Task (planning)',
        'Depends on both leaves.',
        '-> leaf-a',
        '-> leaf-b',
        '',
        '[new-task] New Task (notstarted)',
        'Brand new.',
        '-> leaf-a',
        '',
        '[root] Root Project (started)',
        'The root task.',
        '-> middle',
        '-> new-task',
        '',
      ].join('\n'),
    );
  });

  it('preserves all original tasks unchanged', () => {
    const patched = patchRootDeps(baseGraph, 'new-task');
    const newTask: Task = {
      id: 'new-task',
      shortName: 'New Task',
      description: 'Brand new.',
      status: 'notstarted',
      dependencies: ['leaf-a'],
      decisions: [],
    };
    const result = addTask(patched, newTask);

    for (const id of ['leaf-a', 'leaf-b', 'middle'] as const) {
      const original = baseGraph.tasks.get(id)!;
      const after = result.tasks.get(id)!;
      expect(after).toEqual(original);
    }
  });

  it('does not mutate the original graph', () => {
    const patched = patchRootDeps(baseGraph, 'new-task');
    const newTask: Task = {
      id: 'new-task',
      shortName: 'New Task',
      description: 'Brand new.',
      status: 'notstarted',
      dependencies: ['leaf-a'],
      decisions: [],
    };
    addTask(patched, newTask);

    expect(baseGraph.tasks.size).toBe(4);
    expect(baseGraph.order.length).toBe(4);
  });

  it('throws VineError for duplicate id', () => {
    const dup: Task = {
      id: 'leaf-a',
      shortName: 'Dup',
      description: '',
      status: 'notstarted',
      dependencies: [],
      decisions: [],
    };

    expect(() => addTask(baseGraph, dup)).toThrow(VineError);
  });

  it('throws VineValidationError for invalid dependency ref', () => {
    const patched = patchRootDeps(baseGraph, 'bad-ref');
    const badTask: Task = {
      id: 'bad-ref',
      shortName: 'Bad Ref',
      description: '',
      status: 'notstarted',
      dependencies: ['does-not-exist'],
      decisions: [],
    };

    expect(() => addTask(patched, badTask)).toThrow(VineValidationError);
  });

  it('throws VineValidationError when task is unreachable (island)', () => {
    const island: Task = {
      id: 'orphan',
      shortName: 'Orphan',
      description: '',
      status: 'notstarted',
      dependencies: [],
      decisions: [],
    };

    expect(() => addTask(baseGraph, island)).toThrow(VineValidationError);
    try {
      addTask(baseGraph, island);
    } catch (e) {
      expect(e).toBeInstanceOf(VineValidationError);
      expect((e as VineValidationError).constraint).toBe('no-islands');
    }
  });
});

// ---------------------------------------------------------------------------
// removeTask
// ---------------------------------------------------------------------------

describe('removeTask', () => {
  it('removes leaf-b and verifies serialized output', () => {
    const result = removeTask(baseGraph, 'leaf-b');

    expect(serialize(result)).toBe(
      [
        '[leaf-a] Leaf A (complete)',
        'A simple leaf task.',
        '',
        '[middle] Middle Task (planning)',
        'Depends on both leaves.',
        '-> leaf-a',
        '',
        '[root] Root Project (started)',
        'The root task.',
        '-> middle',
        '',
      ].join('\n'),
    );
  });

  it('removes leaf-a and verifies serialized output', () => {
    const result = removeTask(baseGraph, 'leaf-a');

    expect(serialize(result)).toBe(
      [
        '[leaf-b] Leaf B (started)',
        'Another leaf task.',
        '',
        '[middle] Middle Task (planning)',
        'Depends on both leaves.',
        '-> leaf-b',
        '',
        '[root] Root Project (started)',
        'The root task.',
        '-> middle',
        '',
      ].join('\n'),
    );
  });

  it('does not mutate the original graph', () => {
    removeTask(baseGraph, 'leaf-b');

    expect(baseGraph.tasks.size).toBe(4);
    expect(baseGraph.order.length).toBe(4);
  });

  it('throws VineError for root removal', () => {
    expect(() => removeTask(baseGraph, 'root')).toThrow(VineError);
  });

  it('throws VineError for nonexistent task', () => {
    expect(() => removeTask(baseGraph, 'ghost')).toThrow(VineError);
  });

  it('throws VineValidationError when removal creates islands', () => {
    expect(() => removeTask(baseGraph, 'middle')).toThrow(VineValidationError);
    try {
      removeTask(baseGraph, 'middle');
    } catch (e) {
      expect(e).toBeInstanceOf(VineValidationError);
      expect((e as VineValidationError).constraint).toBe('no-islands');
    }
  });
});

// ---------------------------------------------------------------------------
// setStatus
// ---------------------------------------------------------------------------

describe('setStatus', () => {
  it("changes to 'started' with known output", () => {
    const result = setStatus(baseGraph, 'leaf-a', 'started');

    expect(serialize(result)).toBe(
      [
        '[leaf-a] Leaf A (started)',
        'A simple leaf task.',
        '',
        '[leaf-b] Leaf B (started)',
        'Another leaf task.',
        '',
        '[middle] Middle Task (planning)',
        'Depends on both leaves.',
        '-> leaf-a',
        '-> leaf-b',
        '',
        '[root] Root Project (started)',
        'The root task.',
        '-> middle',
        '',
      ].join('\n'),
    );
  });

  it("changes to 'complete'", () => {
    const result = setStatus(baseGraph, 'middle', 'complete');

    expect(serialize(result)).toBe(
      [
        '[leaf-a] Leaf A (complete)',
        'A simple leaf task.',
        '',
        '[leaf-b] Leaf B (started)',
        'Another leaf task.',
        '',
        '[middle] Middle Task (complete)',
        'Depends on both leaves.',
        '-> leaf-a',
        '-> leaf-b',
        '',
        '[root] Root Project (started)',
        'The root task.',
        '-> middle',
        '',
      ].join('\n'),
    );
  });

  it("changes to 'blocked'", () => {
    const result = setStatus(baseGraph, 'leaf-b', 'blocked');

    expect(serialize(result)).toBe(
      [
        '[leaf-a] Leaf A (complete)',
        'A simple leaf task.',
        '',
        '[leaf-b] Leaf B (blocked)',
        'Another leaf task.',
        '',
        '[middle] Middle Task (planning)',
        'Depends on both leaves.',
        '-> leaf-a',
        '-> leaf-b',
        '',
        '[root] Root Project (started)',
        'The root task.',
        '-> middle',
        '',
      ].join('\n'),
    );
  });

  it("changes to 'notstarted'", () => {
    const result = setStatus(baseGraph, 'root', 'notstarted');

    expect(serialize(result)).toBe(
      [
        '[leaf-a] Leaf A (complete)',
        'A simple leaf task.',
        '',
        '[leaf-b] Leaf B (started)',
        'Another leaf task.',
        '',
        '[middle] Middle Task (planning)',
        'Depends on both leaves.',
        '-> leaf-a',
        '-> leaf-b',
        '',
        '[root] Root Project (notstarted)',
        'The root task.',
        '-> middle',
        '',
      ].join('\n'),
    );
  });

  it("changes to 'planning'", () => {
    const result = setStatus(baseGraph, 'leaf-a', 'planning');

    expect(serialize(result)).toBe(
      [
        '[leaf-a] Leaf A (planning)',
        'A simple leaf task.',
        '',
        '[leaf-b] Leaf B (started)',
        'Another leaf task.',
        '',
        '[middle] Middle Task (planning)',
        'Depends on both leaves.',
        '-> leaf-a',
        '-> leaf-b',
        '',
        '[root] Root Project (started)',
        'The root task.',
        '-> middle',
        '',
      ].join('\n'),
    );
  });

  it('does not mutate the original graph', () => {
    setStatus(baseGraph, 'leaf-a', 'started');

    const original = baseGraph.tasks.get('leaf-a')!;
    expect(original.status).toBe('complete');
  });

  it('throws VineError for nonexistent task', () => {
    expect(() => setStatus(baseGraph, 'nope', 'started')).toThrow(VineError);
  });
});

// ---------------------------------------------------------------------------
// updateTask
// ---------------------------------------------------------------------------

describe('updateTask', () => {
  it('updates shortName with known output', () => {
    const result = updateTask(baseGraph, 'leaf-a', { shortName: 'Alpha Leaf' });

    expect(serialize(result)).toBe(
      [
        '[leaf-a] Alpha Leaf (complete)',
        'A simple leaf task.',
        '',
        '[leaf-b] Leaf B (started)',
        'Another leaf task.',
        '',
        '[middle] Middle Task (planning)',
        'Depends on both leaves.',
        '-> leaf-a',
        '-> leaf-b',
        '',
        '[root] Root Project (started)',
        'The root task.',
        '-> middle',
        '',
      ].join('\n'),
    );
  });

  it('updates description with known output', () => {
    const result = updateTask(baseGraph, 'middle', {
      description: 'Updated description.',
    });

    expect(serialize(result)).toBe(
      [
        '[leaf-a] Leaf A (complete)',
        'A simple leaf task.',
        '',
        '[leaf-b] Leaf B (started)',
        'Another leaf task.',
        '',
        '[middle] Middle Task (planning)',
        'Updated description.',
        '-> leaf-a',
        '-> leaf-b',
        '',
        '[root] Root Project (started)',
        'The root task.',
        '-> middle',
        '',
      ].join('\n'),
    );
  });

  it('updates decisions with known output', () => {
    const result = updateTask(baseGraph, 'leaf-a', {
      decisions: ['Use TypeScript', 'Keep it simple'],
    });

    expect(serialize(result)).toBe(
      [
        '[leaf-a] Leaf A (complete)',
        'A simple leaf task.',
        '> Use TypeScript',
        '> Keep it simple',
        '',
        '[leaf-b] Leaf B (started)',
        'Another leaf task.',
        '',
        '[middle] Middle Task (planning)',
        'Depends on both leaves.',
        '-> leaf-a',
        '-> leaf-b',
        '',
        '[root] Root Project (started)',
        'The root task.',
        '-> middle',
        '',
      ].join('\n'),
    );
  });

  it('updates multiple fields at once', () => {
    const result = updateTask(baseGraph, 'leaf-b', {
      shortName: 'Beta',
      description: 'New desc.',
      decisions: ['Go fast'],
    });

    expect(serialize(result)).toBe(
      [
        '[leaf-a] Leaf A (complete)',
        'A simple leaf task.',
        '',
        '[leaf-b] Beta (started)',
        'New desc.',
        '> Go fast',
        '',
        '[middle] Middle Task (planning)',
        'Depends on both leaves.',
        '-> leaf-a',
        '-> leaf-b',
        '',
        '[root] Root Project (started)',
        'The root task.',
        '-> middle',
        '',
      ].join('\n'),
    );
  });

  it('preserves fields not included in update', () => {
    const result = updateTask(baseGraph, 'leaf-a', { shortName: 'Alpha Leaf' });
    const updated = result.tasks.get('leaf-a')!;
    const original = baseGraph.tasks.get('leaf-a')!;

    expect(updated.id).toBe(original.id);
    expect(updated.status).toBe(original.status);
    expect(updated.description).toBe(original.description);
    expect(updated.dependencies).toEqual(original.dependencies);
    expect(updated.decisions).toEqual(original.decisions);
  });

  it('does not mutate the original graph', () => {
    updateTask(baseGraph, 'leaf-a', { shortName: 'Alpha Leaf' });

    const original = baseGraph.tasks.get('leaf-a')!;
    expect(original.shortName).toBe('Leaf A');
  });

  it('throws VineError for nonexistent task', () => {
    expect(() => updateTask(baseGraph, 'ghost', { shortName: 'X' })).toThrow(
      VineError,
    );
  });
});

// ---------------------------------------------------------------------------
// addDependency
// ---------------------------------------------------------------------------

describe('addDependency', () => {
  it('adds edge with known output', () => {
    const result = addDependency(baseGraph, 'root', 'leaf-a');

    expect(serialize(result)).toBe(
      [
        '[leaf-a] Leaf A (complete)',
        'A simple leaf task.',
        '',
        '[leaf-b] Leaf B (started)',
        'Another leaf task.',
        '',
        '[middle] Middle Task (planning)',
        'Depends on both leaves.',
        '-> leaf-a',
        '-> leaf-b',
        '',
        '[root] Root Project (started)',
        'The root task.',
        '-> middle',
        '-> leaf-a',
        '',
      ].join('\n'),
    );
  });

  it("added dependency appears in task's dependencies array", () => {
    const result = addDependency(baseGraph, 'root', 'leaf-a');
    const rootDeps = result.tasks.get('root')!.dependencies;

    expect(rootDeps).toEqual(['middle', 'leaf-a']);
  });

  it('other tasks unchanged', () => {
    const result = addDependency(baseGraph, 'root', 'leaf-a');

    for (const id of ['leaf-a', 'leaf-b', 'middle'] as const) {
      expect(result.tasks.get(id)).toEqual(baseGraph.tasks.get(id));
    }
  });

  it('does not mutate the original graph', () => {
    addDependency(baseGraph, 'root', 'leaf-a');

    const rootDeps = baseGraph.tasks.get('root')!.dependencies;
    expect(rootDeps).toEqual(['middle']);
  });

  it('throws VineValidationError for cycle', () => {
    expect(() => addDependency(baseGraph, 'leaf-a', 'root')).toThrow(
      VineValidationError,
    );
    try {
      addDependency(baseGraph, 'leaf-a', 'root');
    } catch (e) {
      expect(e).toBeInstanceOf(VineValidationError);
      expect((e as VineValidationError).constraint).toBe('no-cycles');
    }
  });

  it('throws VineError for duplicate dependency', () => {
    expect(() => addDependency(baseGraph, 'middle', 'leaf-a')).toThrow(
      VineError,
    );
  });

  it("throws VineError when depId doesn't exist", () => {
    expect(() => addDependency(baseGraph, 'root', 'phantom')).toThrow(
      VineError,
    );
  });
});

// ---------------------------------------------------------------------------
// removeDependency
// ---------------------------------------------------------------------------

describe('removeDependency', () => {
  it('removes edge with known output', () => {
    // First add a dependency so we can remove it and get back to baseline
    const withExtra = addDependency(baseGraph, 'root', 'leaf-a');
    const result = removeDependency(withExtra, 'root', 'leaf-a');

    expect(serialize(result)).toBe(
      [
        '[leaf-a] Leaf A (complete)',
        'A simple leaf task.',
        '',
        '[leaf-b] Leaf B (started)',
        'Another leaf task.',
        '',
        '[middle] Middle Task (planning)',
        'Depends on both leaves.',
        '-> leaf-a',
        '-> leaf-b',
        '',
        '[root] Root Project (started)',
        'The root task.',
        '-> middle',
        '',
      ].join('\n'),
    );
  });

  it('removed dep no longer in dependencies array', () => {
    const withExtra = addDependency(baseGraph, 'root', 'leaf-a');
    const result = removeDependency(withExtra, 'root', 'leaf-a');

    expect(result.tasks.get('root')!.dependencies).toEqual(['middle']);
  });

  it('other tasks unchanged', () => {
    const withExtra = addDependency(baseGraph, 'root', 'leaf-a');
    const result = removeDependency(withExtra, 'root', 'leaf-a');

    for (const id of ['leaf-a', 'leaf-b', 'middle'] as const) {
      expect(result.tasks.get(id)).toEqual(baseGraph.tasks.get(id));
    }
  });

  it('does not mutate the original graph', () => {
    const withExtra = addDependency(baseGraph, 'root', 'leaf-a');
    removeDependency(withExtra, 'root', 'leaf-a');

    expect(withExtra.tasks.get('root')!.dependencies).toEqual([
      'middle',
      'leaf-a',
    ]);
  });

  it('throws VineValidationError when removal creates island', () => {
    expect(() => removeDependency(baseGraph, 'root', 'middle')).toThrow(
      VineValidationError,
    );
    try {
      removeDependency(baseGraph, 'root', 'middle');
    } catch (e) {
      expect(e).toBeInstanceOf(VineValidationError);
      expect((e as VineValidationError).constraint).toBe('no-islands');
    }
  });

  it("throws VineError when dependency doesn't exist", () => {
    expect(() => removeDependency(baseGraph, 'leaf-a', 'leaf-b')).toThrow(
      VineError,
    );
  });

  it("throws VineError when task doesn't exist", () => {
    expect(() => removeDependency(baseGraph, 'ghost', 'leaf-a')).toThrow(
      VineError,
    );
  });
});
