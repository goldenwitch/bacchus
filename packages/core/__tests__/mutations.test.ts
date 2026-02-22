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
import type { Task, VineGraph, ConcreteTask } from '../src/types.js';

// ---------------------------------------------------------------------------
// Base graph
// ---------------------------------------------------------------------------

const baseVine = [
  'vine 1.0.0',
  '---',
  '[root] Root Project (started)',
  'The root task.',
  '-> middle',
  '---',
  '[middle] Middle Task (planning)',
  'Depends on both leaves.',
  '-> leaf-a',
  '-> leaf-b',
  '---',
  '[leaf-a] Leaf A (complete)',
  'A simple leaf task.',
  '---',
  '[leaf-b] Leaf B (started)',
  'Another leaf task.',
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
  const rootId = graph.order[0];
  const root = graph.tasks.get(rootId!)!;
  const updatedRoot: Task = {
    ...root,
    dependencies: [...root.dependencies, depId],
  };
  const newTasks = new Map(graph.tasks);
  newTasks.set(rootId!, updatedRoot);
  return { ...graph, tasks: newTasks };
}

/** Build the expected serialized output for the base graph (with optional overrides). */
function baseOutput(): string {
  return [
    'vine 1.0.0',
    '---',
    '[root] Root Project (started)',
    'The root task.',
    '-> middle',
    '---',
    '[middle] Middle Task (planning)',
    'Depends on both leaves.',
    '-> leaf-a',
    '-> leaf-b',
    '---',
    '[leaf-a] Leaf A (complete)',
    'A simple leaf task.',
    '---',
    '[leaf-b] Leaf B (started)',
    'Another leaf task.',
    '',
  ].join('\n');
}

// ---------------------------------------------------------------------------
// addTask
// ---------------------------------------------------------------------------

describe('addTask', () => {
  it('adds a task and verifies serialized output', () => {
    const patched = patchRootDeps(baseGraph, 'new-task');
    const newTask: ConcreteTask = {
      kind: 'task',
      id: 'new-task',
      shortName: 'New Task',
      description: 'Brand new.',
      status: 'notstarted',
      dependencies: ['leaf-a'],
      decisions: [],
      attachments: [],
    };
    const result = addTask(patched, newTask);

    expect(serialize(result)).toBe(
      [
        'vine 1.0.0',
        '---',
        '[root] Root Project (started)',
        'The root task.',
        '-> middle',
        '-> new-task',
        '---',
        '[middle] Middle Task (planning)',
        'Depends on both leaves.',
        '-> leaf-a',
        '-> leaf-b',
        '---',
        '[leaf-a] Leaf A (complete)',
        'A simple leaf task.',
        '---',
        '[leaf-b] Leaf B (started)',
        'Another leaf task.',
        '---',
        '[new-task] New Task (notstarted)',
        'Brand new.',
        '-> leaf-a',
        '',
      ].join('\n'),
    );
  });

  it('preserves all original tasks unchanged', () => {
    const patched = patchRootDeps(baseGraph, 'new-task');
    const newTask: ConcreteTask = {
      kind: 'task',
      id: 'new-task',
      shortName: 'New Task',
      description: 'Brand new.',
      status: 'notstarted',
      dependencies: ['leaf-a'],
      decisions: [],
      attachments: [],
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
    const newTask: ConcreteTask = {
      kind: 'task',
      id: 'new-task',
      shortName: 'New Task',
      description: 'Brand new.',
      status: 'notstarted',
      dependencies: ['leaf-a'],
      decisions: [],
      attachments: [],
    };
    addTask(patched, newTask);

    expect(baseGraph.tasks.size).toBe(4);
    expect(baseGraph.order.length).toBe(4);
  });

  it('throws VineError for duplicate id', () => {
    const dup: ConcreteTask = {
      kind: 'task',
      id: 'leaf-a',
      shortName: 'Dup',
      description: '',
      status: 'notstarted',
      dependencies: [],
      decisions: [],
      attachments: [],
    };

    expect(() => addTask(baseGraph, dup)).toThrow(VineError);
  });

  it('throws VineValidationError for invalid dependency ref', () => {
    const patched = patchRootDeps(baseGraph, 'bad-ref');
    const badTask: ConcreteTask = {
      kind: 'task',
      id: 'bad-ref',
      shortName: 'Bad Ref',
      description: '',
      status: 'notstarted',
      dependencies: ['does-not-exist'],
      decisions: [],
      attachments: [],
    };

    expect(() => addTask(patched, badTask)).toThrow(VineValidationError);
  });

  it('throws VineValidationError when task is unreachable (island)', () => {
    const island: ConcreteTask = {
      kind: 'task',
      id: 'orphan',
      shortName: 'Orphan',
      description: '',
      status: 'notstarted',
      dependencies: [],
      decisions: [],
      attachments: [],
    };

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
        'vine 1.0.0',
        '---',
        '[root] Root Project (started)',
        'The root task.',
        '-> middle',
        '---',
        '[middle] Middle Task (planning)',
        'Depends on both leaves.',
        '-> leaf-a',
        '---',
        '[leaf-a] Leaf A (complete)',
        'A simple leaf task.',
        '',
      ].join('\n'),
    );
  });

  it('removes leaf-a and verifies serialized output', () => {
    const result = removeTask(baseGraph, 'leaf-a');

    expect(serialize(result)).toBe(
      [
        'vine 1.0.0',
        '---',
        '[root] Root Project (started)',
        'The root task.',
        '-> middle',
        '---',
        '[middle] Middle Task (planning)',
        'Depends on both leaves.',
        '-> leaf-b',
        '---',
        '[leaf-b] Leaf B (started)',
        'Another leaf task.',
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
        'vine 1.0.0',
        '---',
        '[root] Root Project (started)',
        'The root task.',
        '-> middle',
        '---',
        '[middle] Middle Task (planning)',
        'Depends on both leaves.',
        '-> leaf-a',
        '-> leaf-b',
        '---',
        '[leaf-a] Leaf A (started)',
        'A simple leaf task.',
        '---',
        '[leaf-b] Leaf B (started)',
        'Another leaf task.',
        '',
      ].join('\n'),
    );
  });

  it("changes to 'complete'", () => {
    const result = setStatus(baseGraph, 'middle', 'complete');

    expect(serialize(result)).toBe(
      [
        'vine 1.0.0',
        '---',
        '[root] Root Project (started)',
        'The root task.',
        '-> middle',
        '---',
        '[middle] Middle Task (complete)',
        'Depends on both leaves.',
        '-> leaf-a',
        '-> leaf-b',
        '---',
        '[leaf-a] Leaf A (complete)',
        'A simple leaf task.',
        '---',
        '[leaf-b] Leaf B (started)',
        'Another leaf task.',
        '',
      ].join('\n'),
    );
  });

  it("changes to 'blocked'", () => {
    const result = setStatus(baseGraph, 'leaf-b', 'blocked');

    expect(serialize(result)).toBe(
      [
        'vine 1.0.0',
        '---',
        '[root] Root Project (started)',
        'The root task.',
        '-> middle',
        '---',
        '[middle] Middle Task (planning)',
        'Depends on both leaves.',
        '-> leaf-a',
        '-> leaf-b',
        '---',
        '[leaf-a] Leaf A (complete)',
        'A simple leaf task.',
        '---',
        '[leaf-b] Leaf B (blocked)',
        'Another leaf task.',
        '',
      ].join('\n'),
    );
  });

  it("changes to 'notstarted'", () => {
    const result = setStatus(baseGraph, 'root', 'notstarted');

    expect(serialize(result)).toBe(
      [
        'vine 1.0.0',
        '---',
        '[root] Root Project (notstarted)',
        'The root task.',
        '-> middle',
        '---',
        '[middle] Middle Task (planning)',
        'Depends on both leaves.',
        '-> leaf-a',
        '-> leaf-b',
        '---',
        '[leaf-a] Leaf A (complete)',
        'A simple leaf task.',
        '---',
        '[leaf-b] Leaf B (started)',
        'Another leaf task.',
        '',
      ].join('\n'),
    );
  });

  it("changes to 'planning'", () => {
    const result = setStatus(baseGraph, 'leaf-a', 'planning');

    expect(serialize(result)).toBe(
      [
        'vine 1.0.0',
        '---',
        '[root] Root Project (started)',
        'The root task.',
        '-> middle',
        '---',
        '[middle] Middle Task (planning)',
        'Depends on both leaves.',
        '-> leaf-a',
        '-> leaf-b',
        '---',
        '[leaf-a] Leaf A (planning)',
        'A simple leaf task.',
        '---',
        '[leaf-b] Leaf B (started)',
        'Another leaf task.',
        '',
      ].join('\n'),
    );
  });

  it('does not mutate the original graph', () => {
    setStatus(baseGraph, 'leaf-a', 'started');

    const original = baseGraph.tasks.get('leaf-a')! as ConcreteTask;
    expect(original.status).toBe('complete');
  });

  it('throws VineError for nonexistent task', () => {
    expect(() => setStatus(baseGraph, 'nope', 'started')).toThrow(VineError);
  });

  it('throws VineError when setting status on a ref node', () => {
    const refVine = [
      'vine 1.1.0',
      '---',
      '[root] Root (started)',
      '-> ext',
      '---',
      'ref [ext] External (./other.vine)',
    ].join('\n');
    const refGraph = parse(refVine);

    expect(() => setStatus(refGraph, 'ext', 'complete')).toThrow(VineError);
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
        'vine 1.0.0',
        '---',
        '[root] Root Project (started)',
        'The root task.',
        '-> middle',
        '---',
        '[middle] Middle Task (planning)',
        'Depends on both leaves.',
        '-> leaf-a',
        '-> leaf-b',
        '---',
        '[leaf-a] Alpha Leaf (complete)',
        'A simple leaf task.',
        '---',
        '[leaf-b] Leaf B (started)',
        'Another leaf task.',
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
        'vine 1.0.0',
        '---',
        '[root] Root Project (started)',
        'The root task.',
        '-> middle',
        '---',
        '[middle] Middle Task (planning)',
        'Updated description.',
        '-> leaf-a',
        '-> leaf-b',
        '---',
        '[leaf-a] Leaf A (complete)',
        'A simple leaf task.',
        '---',
        '[leaf-b] Leaf B (started)',
        'Another leaf task.',
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
        'vine 1.0.0',
        '---',
        '[root] Root Project (started)',
        'The root task.',
        '-> middle',
        '---',
        '[middle] Middle Task (planning)',
        'Depends on both leaves.',
        '-> leaf-a',
        '-> leaf-b',
        '---',
        '[leaf-a] Leaf A (complete)',
        'A simple leaf task.',
        '> Use TypeScript',
        '> Keep it simple',
        '---',
        '[leaf-b] Leaf B (started)',
        'Another leaf task.',
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
        'vine 1.0.0',
        '---',
        '[root] Root Project (started)',
        'The root task.',
        '-> middle',
        '---',
        '[middle] Middle Task (planning)',
        'Depends on both leaves.',
        '-> leaf-a',
        '-> leaf-b',
        '---',
        '[leaf-a] Leaf A (complete)',
        'A simple leaf task.',
        '---',
        '[leaf-b] Beta (started)',
        'New desc.',
        '> Go fast',
        '',
      ].join('\n'),
    );
  });

  it('preserves fields not included in update', () => {
    const result = updateTask(baseGraph, 'leaf-a', { shortName: 'Alpha Leaf' });
    const updated = result.tasks.get('leaf-a')! as ConcreteTask;
    const original = baseGraph.tasks.get('leaf-a')! as ConcreteTask;

    expect(updated.id).toBe(original.id);
    expect(updated.status).toBe(original.status);
    expect(updated.description).toBe(original.description);
    expect(updated.dependencies).toEqual(original.dependencies);
    expect(updated.decisions).toEqual(original.decisions);
    expect(updated.attachments).toEqual(original.attachments);
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

  it('throws VineError when adding attachments to a ref node', () => {
    const refVine = [
      'vine 1.1.0',
      '---',
      '[root] Root (started)',
      '-> ext',
      '---',
      'ref [ext] External (./other.vine)',
    ].join('\n');
    const refGraph = parse(refVine);

    expect(() => updateTask(refGraph, 'ext', {
      attachments: [{ class: 'artifact', mime: 'text/plain', uri: 'file.txt' }],
    })).toThrow(VineError);
  });

  it('allows updating description on a ref node', () => {
    const refVine = [
      'vine 1.1.0',
      '---',
      '[root] Root (started)',
      '-> ext',
      '---',
      'ref [ext] External (./other.vine)',
    ].join('\n');
    const refGraph = parse(refVine);

    const updated = updateTask(refGraph, 'ext', { description: 'Updated ref desc.' });
    expect(updated.tasks.get('ext')!.description).toBe('Updated ref desc.');
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
        'vine 1.0.0',
        '---',
        '[root] Root Project (started)',
        'The root task.',
        '-> leaf-a',
        '-> middle',
        '---',
        '[middle] Middle Task (planning)',
        'Depends on both leaves.',
        '-> leaf-a',
        '-> leaf-b',
        '---',
        '[leaf-a] Leaf A (complete)',
        'A simple leaf task.',
        '---',
        '[leaf-b] Leaf B (started)',
        'Another leaf task.',
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

    expect(serialize(result)).toBe(baseOutput());
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
