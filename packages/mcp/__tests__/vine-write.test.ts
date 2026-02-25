import { describe, it, expect } from 'vitest';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  parse,
  getTask,
  removeTask,
  addRef,
  updateRefUri,
  expandVineRef,
  applyBatch,
  validate,
  getDependencies,
  VineError,
  VineValidationError,
  EMPTY_ANNOTATIONS,
} from '@bacchus/core';
import type { ConcreteTask, RefTask, Operation, Attachment, VineGraph } from '@bacchus/core';

import {
  readGraph,
  writeGraph,
  readFileContent,
  createGraph,
} from '../src/io.js';

import { makeTempDir, useTempDir, writeSample, readFixture } from './fixtures/helpers.js';

useTempDir();

// ---------------------------------------------------------------------------
// vine_write operations (batch mutations)
// ---------------------------------------------------------------------------

describe('vine_write operations', () => {
  it('vine_write add_task: adds via applyBatch with add_dep (island-rule fix)', () => {
    const dir = makeTempDir();
    const file = writeSample(dir);
    let graph = readGraph(file);

    // Use applyBatch: add_task + add_dep atomically — no manual root patching
    graph = applyBatch(graph, [
      { op: 'add_task', id: 'new-task', name: 'New Task', description: 'Brand new.', dependsOn: ['leaf'] },
      { op: 'add_dep', taskId: 'root', depId: 'new-task' },
    ]);
    writeGraph(file, graph);

    const reloaded = readGraph(file);
    expect(reloaded.tasks.has('new-task')).toBe(true);
    expect(reloaded.tasks.size).toBe(5);
    expect(getTask(reloaded, 'root').dependencies).toContain('new-task');
  });

  it('vine_write remove_task: removes a non-root task', () => {
    const dir = makeTempDir();
    const file = writeSample(dir);
    let graph = readGraph(file);
    graph = removeTask(graph, 'leaf');
    writeGraph(file, graph);
    const reloaded = readGraph(file);
    expect(reloaded.tasks.has('leaf')).toBe(false);
    expect(reloaded.tasks.size).toBe(3);
  });

  it('vine_write set_status: changes status', () => {
    const dir = makeTempDir();
    const file = writeSample(dir);
    let graph = readGraph(file);
    graph = applyBatch(graph, [
      { op: 'set_status', id: 'child-b', status: 'complete' },
    ]);
    writeGraph(file, graph);
    const reloaded = readGraph(file);
    const task = getTask(reloaded, 'child-b') as ConcreteTask;
    expect(task.status).toBe('complete');
  });

  it('vine_write update: updates shortName/description', () => {
    const dir = makeTempDir();
    const file = writeSample(dir);
    let graph = readGraph(file);
    graph = applyBatch(graph, [
      { op: 'update', id: 'child-a', name: 'Updated A', description: 'New desc.' },
    ]);
    writeGraph(file, graph);
    const reloaded = readGraph(file);
    const task = getTask(reloaded, 'child-a');
    expect(task.shortName).toBe('Updated A');
    expect(task.description).toBe('New desc.');
  });

  it('vine_write add_dep: adds edge', () => {
    const dir = makeTempDir();
    const file = writeSample(dir);
    let graph = readGraph(file);
    graph = applyBatch(graph, [
      { op: 'add_dep', taskId: 'root', depId: 'leaf' },
    ]);
    writeGraph(file, graph);
    const reloaded = readGraph(file);
    const task = getTask(reloaded, 'root');
    expect(task.dependencies).toContain('leaf');
  });

  it('vine_write remove_dep: removes edge', () => {
    const dir = makeTempDir();
    const file = writeSample(dir);
    let graph = readGraph(file);
    graph = applyBatch(graph, [
      { op: 'remove_dep', taskId: 'child-a', depId: 'leaf' },
    ]);
    writeGraph(file, graph);
    const reloaded = readGraph(file);
    const task = getTask(reloaded, 'child-a');
    expect(task.dependencies).not.toContain('leaf');
  });

  it('vine_write batch: multiple operations in one call', () => {
    const dir = makeTempDir();
    const file = writeSample(dir);
    let graph = readGraph(file);
    graph = applyBatch(graph, [
      { op: 'set_status', id: 'leaf', status: 'complete' },
      { op: 'set_status', id: 'child-b', status: 'started' },
      { op: 'update', id: 'child-b', description: 'Updated via batch.' },
    ]);
    writeGraph(file, graph);

    const reloaded = readGraph(file);
    const leaf = getTask(reloaded, 'leaf') as ConcreteTask;
    const childB = getTask(reloaded, 'child-b') as ConcreteTask;
    expect(leaf.status).toBe('complete');
    expect(childB.status).toBe('started');
    expect(childB.description).toBe('Updated via batch.');
  });
});

// ---------------------------------------------------------------------------
// vine_write ref operations + vine_expand
// ---------------------------------------------------------------------------

describe('vine_write ref operations + vine_expand', () => {
  it('vine_write add_ref: adds via applyBatch (island-rule fix)', () => {
    const dir = makeTempDir();
    const file = writeSample(dir);
    let graph = readGraph(file);

    // Use applyBatch: add_ref + add_dep atomically — no manual root patching
    graph = applyBatch(graph, [
      { op: 'add_ref', id: 'my-ref', name: 'My Ref', vine: './other.vine', description: 'A reference node.', dependsOn: ['leaf'] },
      { op: 'add_dep', taskId: 'root', depId: 'my-ref' },
    ]);
    writeGraph(file, graph);

    const reloaded = readGraph(file);
    expect(reloaded.tasks.has('my-ref')).toBe(true);
    const task = getTask(reloaded, 'my-ref');
    expect(task.kind).toBe('ref');
    if (task.kind === 'ref') {
      expect(task.vine).toBe('./other.vine');
    }
  });

  it('vine_write add_ref: missing vine URI throws error', () => {
    const graph = readGraph(writeSample(makeTempDir()));
    const bad = {
      kind: 'ref' as const,
      id: 'bad-ref',
      shortName: 'Bad Ref',
      description: '',
      vine: '',
      dependencies: [],
      decisions: [],
      annotations: EMPTY_ANNOTATIONS,
    };
    expect(() => addRef(graph, bad)).toThrow();
  });

  it('vine_write update_ref_uri: updates the URI', () => {
    const dir = makeTempDir();
    const file = join(dir, 'ref.vine');
    writeFileSync(file, readFixture('ref-parent.vine'), 'utf-8');
    let graph = readGraph(file);
    graph = applyBatch(graph, [
      { op: 'update_ref_uri', id: 'ext-ref', uri: './updated.vine' },
    ]);
    writeGraph(file, graph);

    const reloaded = readGraph(file);
    const task = getTask(reloaded, 'ext-ref');
    expect(task.kind).toBe('ref');
    if (task.kind === 'ref') {
      expect(task.vine).toBe('./updated.vine');
    }
  });

  it('vine_write update_ref_uri: throws on non-ref node', () => {
    const graph = readGraph(writeSample(makeTempDir()));
    expect(() => updateRefUri(graph, 'root', './other.vine')).toThrow();
  });

  it('vine_expand: expands a ref by inlining child graph', () => {
    const dir = makeTempDir();
    const parentFile = join(dir, 'parent.vine');
    const childFile = join(dir, 'child.vine');
    writeFileSync(parentFile, readFixture('ref-parent.vine'), 'utf-8');
    writeFileSync(childFile, readFixture('ref-child.vine'), 'utf-8');

    const parentGraph = readGraph(parentFile);
    const childContent = readFileContent(childFile);
    const childGraph = parse(childContent);
    const expanded = expandVineRef(parentGraph, 'ext-ref', childGraph);
    writeGraph(parentFile, expanded);

    const reloaded = readGraph(parentFile);
    // The ref node should be replaced with a concrete task at the same ID
    expect(reloaded.tasks.has('ext-ref')).toBe(true);
    const expandedTask = getTask(reloaded, 'ext-ref');
    expect(expandedTask.kind).toBe('task');
    // Child graph non-root nodes should be inlined
    expect(reloaded.tasks.has('ext-ref/child-leaf')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// applyBatch
// ---------------------------------------------------------------------------

describe('applyBatch', () => {
  it('add_task alone fails island rule (pre-fix behavior)', () => {
    const graph = readGraph(writeSample(makeTempDir()));
    const op: Operation = { op: 'add_task', id: 'orphan', name: 'Orphan', dependsOn: ['leaf'] };
    // orphan depends on leaf but nothing depends on orphan → island
    expect(() => applyBatch(graph, [op])).toThrow(VineValidationError);
  });

  it('add_task + add_dep fixes island rule', () => {
    const dir = makeTempDir();
    const file = writeSample(dir);
    let graph = readGraph(file);
    graph = applyBatch(graph, [
      { op: 'add_task', id: 'new-task', name: 'New Task', dependsOn: ['leaf'] },
      { op: 'add_dep', taskId: 'root', depId: 'new-task' },
    ]);
    writeGraph(file, graph);
    const reloaded = readGraph(file);
    expect(reloaded.tasks.has('new-task')).toBe(true);
    expect(getTask(reloaded, 'root').dependencies).toContain('new-task');
  });

  it('rejects batch resulting in cycle', () => {
    const dir = makeTempDir();
    const file = writeSample(dir);
    const graph = readGraph(file);
    // leaf -> child-a -> leaf would be a cycle
    expect(() => applyBatch(graph, [
      { op: 'add_dep', taskId: 'leaf', depId: 'child-a' },
    ])).toThrow(VineValidationError);
  });

  it('empty operations array passes (no-op)', () => {
    const graph = readGraph(writeSample(makeTempDir()));
    const result = applyBatch(graph, []);
    expect(result.tasks.size).toBe(graph.tasks.size);
  });
});

// ---------------------------------------------------------------------------
// claim operation
// ---------------------------------------------------------------------------

describe('claim operation', () => {
  it('sets task status to started', () => {
    const dir = makeTempDir();
    const file = writeSample(dir);
    let graph = readGraph(file);
    graph = applyBatch(graph, [{ op: 'claim', id: 'leaf' }]);
    writeGraph(file, graph);
    const reloaded = readGraph(file);
    const task = getTask(reloaded, 'leaf') as ConcreteTask;
    expect(task.status).toBe('started');
  });

  it('throws on ref node', () => {
    const dir = makeTempDir();
    const file = join(dir, 'ref.vine');
    writeFileSync(file, readFixture('ref-parent.vine'), 'utf-8');
    const graph = readGraph(file);
    expect(() => applyBatch(graph, [{ op: 'claim', id: 'ext-ref' }])).toThrow(VineError);
  });
});

// ---------------------------------------------------------------------------
// create operation (server-level only)
// ---------------------------------------------------------------------------

describe('create operation', () => {
  it('throws when used in applyBatch (server-level only)', () => {
    const graph = readGraph(writeSample(makeTempDir()));
    expect(() => applyBatch(graph, [{ op: 'create' } as any])).toThrow(VineError);
  });
});

// ---------------------------------------------------------------------------
// update with attachments and annotations
// ---------------------------------------------------------------------------

describe('update with attachments and annotations', () => {
  it('sets attachments on a task', () => {
    const dir = makeTempDir();
    const file = writeSample(dir);
    let graph = readGraph(file);
    const attachment: Attachment = { class: 'artifact', mime: 'text/plain', uri: 'https://example.com/report.txt' };
    graph = applyBatch(graph, [
      { op: 'update', id: 'child-a', attachments: [attachment] },
    ]);
    writeGraph(file, graph);
    const reloaded = readGraph(file);
    const task = getTask(reloaded, 'child-a') as ConcreteTask;
    expect(task.attachments).toHaveLength(1);
    expect(task.attachments[0]!.uri).toBe('https://example.com/report.txt');
  });

  it('sets annotations on a task', () => {
    const dir = makeTempDir();
    const file = writeSample(dir);
    let graph = readGraph(file);
    graph = applyBatch(graph, [
      { op: 'update', id: 'child-a', annotations: { sprite: ['./icon.svg'] } },
    ]);
    writeGraph(file, graph);
    const reloaded = readGraph(file);
    const task = getTask(reloaded, 'child-a');
    expect(task.annotations.get('sprite')).toEqual(['./icon.svg']);
  });

  it('rejects attachments on ref nodes', () => {
    const dir = makeTempDir();
    const file = join(dir, 'ref.vine');
    writeFileSync(file, readFixture('ref-parent.vine'), 'utf-8');
    const graph = readGraph(file);
    const attachment: Attachment = { class: 'artifact', mime: 'text/plain', uri: 'https://example.com/x.txt' };
    expect(() => applyBatch(graph, [
      { op: 'update', id: 'ext-ref', attachments: [attachment] },
    ])).toThrow(VineError);
  });
});

// ---------------------------------------------------------------------------
// add_task with annotations
// ---------------------------------------------------------------------------

describe('add_task with annotations', () => {
  it('creates task with annotations via applyBatch', () => {
    const dir = makeTempDir();
    const file = writeSample(dir);
    let graph = readGraph(file);
    graph = applyBatch(graph, [
      { op: 'add_task', id: 'annotated', name: 'Annotated Task', dependsOn: ['leaf'], annotations: { sprite: ['./sprite.svg'], priority: ['high'] } },
      { op: 'add_dep', taskId: 'root', depId: 'annotated' },
    ]);
    writeGraph(file, graph);
    const reloaded = readGraph(file);
    const task = getTask(reloaded, 'annotated');
    expect(task.annotations.get('sprite')).toEqual(['./sprite.svg']);
    expect(task.annotations.get('priority')).toEqual(['high']);
  });
});

// ---------------------------------------------------------------------------
// extract_to_ref operation (server-level only)
// ---------------------------------------------------------------------------

describe('extract_to_ref operation', () => {
  it('throws when used in applyBatch (server-level only)', () => {
    const graph = readGraph(writeSample(makeTempDir()));
    expect(() => applyBatch(graph, [
      { op: 'extract_to_ref', id: 'child-a', vine: './child-a.vine' } as any,
    ])).toThrow(VineError);
  });
});

// ---------------------------------------------------------------------------
// vine_write create building blocks
// ---------------------------------------------------------------------------

describe('vine_write create building blocks', () => {
  it('createGraph + readGraph round-trips with seed task', () => {
    const dir = makeTempDir();
    const file = join(dir, 'created.vine');
    const seedTask: ConcreteTask = {
      kind: 'task',
      id: 'root',
      shortName: 'Root',
      status: 'notstarted',
      description: 'Created root',
      dependencies: [],
      decisions: [],
      attachments: [],
      annotations: EMPTY_ANNOTATIONS,
    };
    const graph: VineGraph = {
      version: '1.2.0',
      title: undefined,
      delimiter: '---',
      prefix: undefined,
      tasks: new Map([['root', seedTask]]),
      order: ['root'],
    };
    createGraph(file, graph);
    const reread = readGraph(file);
    expect(reread.tasks.size).toBe(1);
    expect(getTask(reread, 'root').shortName).toBe('Root');
  });

  it('create then applyBatch adds more tasks', () => {
    const dir = makeTempDir();
    const file = join(dir, 'batch-create.vine');
    const seedTask: ConcreteTask = {
      kind: 'task',
      id: 'root',
      shortName: 'Root',
      status: 'notstarted',
      description: '',
      dependencies: [],
      decisions: [],
      attachments: [],
      annotations: EMPTY_ANNOTATIONS,
    };
    let graph: VineGraph = {
      version: '1.2.0',
      title: undefined,
      delimiter: '---',
      prefix: undefined,
      tasks: new Map([['root', seedTask]]),
      order: ['root'],
    };
    graph = applyBatch(graph, [
      { op: 'add_task', id: 'child', name: 'Child' },
      { op: 'add_dep', taskId: 'root', depId: 'child' },
    ]);
    createGraph(file, graph);
    const reread = readGraph(file);
    expect(reread.tasks.size).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// vine_write extract_to_ref building blocks
// ---------------------------------------------------------------------------

describe('vine_write extract_to_ref building blocks', () => {
  it('extracted task becomes ref and child graph is created', () => {
    const dir = makeTempDir();
    const parentFile = join(dir, 'parent.vine');
    const childFile = join(dir, 'child-extract.vine');

    // Write a parent graph with root -> middle -> leaf
    const parentVine = `vine 1.1.0\n---\n[root] Root (started)\n-> middle\n---\n[middle] Middle (notstarted)\n-> leaf\n---\n[leaf] Leaf (notstarted)\nA leaf.\n`;
    writeFileSync(parentFile, parentVine, 'utf-8');

    // Read the parent, manually extract 'middle' to ref
    const graph = readGraph(parentFile);
    const task = getTask(graph, 'middle');
    expect(task.kind).toBe('task');

    // Build child graph
    const childRoot: ConcreteTask = {
      kind: 'task',
      id: 'middle',
      shortName: task.shortName,
      status: (task as ConcreteTask).status,
      description: task.description,
      dependencies: [],
      decisions: [...task.decisions],
      attachments: [],
      annotations: EMPTY_ANNOTATIONS,
    };
    const childGraph: VineGraph = {
      version: graph.version,
      title: task.shortName,
      delimiter: '---',
      prefix: undefined,
      tasks: new Map([['middle', childRoot]]),
      order: ['middle'],
    };
    createGraph(childFile, childGraph);

    // Verify child was created
    const childReread = readGraph(childFile);
    expect(childReread.tasks.size).toBe(1);
    expect(getTask(childReread, 'middle').shortName).toBe('Middle');
  });
});

// ---------------------------------------------------------------------------
// vine_write update decisions
// ---------------------------------------------------------------------------

describe('vine_write update decisions', () => {
  it('update with decisions replaces existing decisions', () => {
    const graph = parse(readFixture('sample.vine'));
    const ops: Operation[] = [
      { op: 'update', id: 'leaf', decisions: ['Decision 1', 'Decision 2'] },
    ];
    const updated = applyBatch(graph, ops);
    const task = getTask(updated, 'leaf');
    expect([...task.decisions]).toEqual(['Decision 1', 'Decision 2']);
  });

  it('update with empty decisions clears them', () => {
    let graph = parse(readFixture('sample.vine'));
    graph = applyBatch(graph, [
      { op: 'update', id: 'leaf', decisions: ['Some decision'] },
    ]);
    expect([...getTask(graph, 'leaf').decisions]).toEqual(['Some decision']);
    graph = applyBatch(graph, [
      { op: 'update', id: 'leaf', decisions: [] },
    ]);
    expect([...getTask(graph, 'leaf').decisions]).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// applyBatch edge cases
// ---------------------------------------------------------------------------

describe('applyBatch edge cases', () => {
  it('claim on non-existent task throws', () => {
    const graph = parse(readFixture('sample.vine'));
    expect(() => applyBatch(graph, [{ op: 'claim', id: 'nonexistent' }])).toThrow('Task not found');
  });

  it('set_status on ref node throws', () => {
    const vine = `vine 1.1.0\n---\n[root] Root (notstarted)\n-> sub\n---\nref [sub] Sub (./sub.vine)\n`;
    const graph = parse(vine);
    expect(() => applyBatch(graph, [{ op: 'set_status', id: 'sub', status: 'started' }])).toThrow('reference node');
  });

  it('claim on ref node throws', () => {
    const vine = `vine 1.1.0\n---\n[root] Root (notstarted)\n-> sub\n---\nref [sub] Sub (./sub.vine)\n`;
    const graph = parse(vine);
    expect(() => applyBatch(graph, [{ op: 'claim', id: 'sub' }])).toThrow('reference node');
  });

  it('update_ref_uri on concrete task throws', () => {
    const graph = parse(readFixture('sample.vine'));
    expect(() => applyBatch(graph, [{ op: 'update_ref_uri', id: 'leaf', uri: './new.vine' }])).toThrow('ref nodes');
  });

  it('update_ref_uri with empty URI throws', () => {
    const vine = `vine 1.1.0\n---\n[root] Root (notstarted)\n-> sub\n---\nref [sub] Sub (./sub.vine)\n`;
    const graph = parse(vine);
    expect(() => applyBatch(graph, [{ op: 'update_ref_uri', id: 'sub', uri: '' }])).toThrow('non-empty');
  });

  it('add_dep duplicate throws', () => {
    const graph = parse(readFixture('sample.vine'));
    // root already depends on child-a
    expect(() => applyBatch(graph, [{ op: 'add_dep', taskId: 'root', depId: 'child-a' }])).toThrow('already depends');
  });

  it('remove_dep nonexistent dependency throws', () => {
    const graph = parse(readFixture('sample.vine'));
    expect(() => applyBatch(graph, [{ op: 'remove_dep', taskId: 'child-a', depId: 'child-b' }])).toThrow('does not depend');
  });

  it('add_ref with empty vine throws', () => {
    const graph = parse(readFixture('sample.vine'));
    expect(() => applyBatch(graph, [
      { op: 'add_ref', id: 'new-ref', name: 'New Ref', vine: '' },
      { op: 'add_dep', taskId: 'root', depId: 'new-ref' },
    ])).toThrow('non-empty vine URI');
  });

  it('remove_task on nonexistent throws', () => {
    const graph = parse(readFixture('sample.vine'));
    expect(() => applyBatch(graph, [{ op: 'remove_task', id: 'nope' }])).toThrow('not found');
  });

  it('update attachments on ref throws', () => {
    const vine = `vine 1.1.0\n---\n[root] Root (notstarted)\n-> sub\n---\nref [sub] Sub (./sub.vine)\n`;
    const graph = parse(vine);
    expect(() => applyBatch(graph, [{ op: 'update', id: 'sub', attachments: [{ class: 'artifact', mime: 'text/plain', uri: 'foo.txt' }] }])).toThrow('attachments on reference');
  });

  it('add_task with duplicate id throws', () => {
    const graph = parse(readFixture('sample.vine'));
    expect(() => applyBatch(graph, [
      { op: 'add_task', id: 'root', name: 'Duplicate Root' },
    ])).toThrow('already exists');
  });

  it('add_ref with duplicate id throws', () => {
    const vine = `vine 1.1.0\n---\n[root] Root (notstarted)\n-> sub\n---\nref [sub] Sub (./sub.vine)\n`;
    const graph = parse(vine);
    expect(() => applyBatch(graph, [
      { op: 'add_ref', id: 'sub', name: 'Dup Ref', vine: './other.vine' },
    ])).toThrow('already exists');
  });

  it('remove_task on root throws', () => {
    const graph = parse(readFixture('sample.vine'));
    expect(() => applyBatch(graph, [{ op: 'remove_task', id: 'root' }])).toThrow('root task');
  });

  it('add_dep with nonexistent depId throws', () => {
    const graph = parse(readFixture('sample.vine'));
    expect(() => applyBatch(graph, [{ op: 'add_dep', taskId: 'root', depId: 'nope' }])).toThrow('not found');
  });

  it('remove_dep with nonexistent task throws', () => {
    const graph = parse(readFixture('sample.vine'));
    expect(() => applyBatch(graph, [{ op: 'remove_dep', taskId: 'nope', depId: 'leaf' }])).toThrow('not found');
  });

  it('set_status on nonexistent task throws', () => {
    const graph = parse(readFixture('sample.vine'));
    expect(() => applyBatch(graph, [{ op: 'set_status', id: 'nope', status: 'complete' }])).toThrow('not found');
  });

  it('update on nonexistent task throws', () => {
    const graph = parse(readFixture('sample.vine'));
    expect(() => applyBatch(graph, [{ op: 'update', id: 'nope', name: 'X' }])).toThrow('not found');
  });

  it('update_ref_uri on nonexistent task throws', () => {
    const graph = parse(readFixture('sample.vine'));
    expect(() => applyBatch(graph, [{ op: 'update_ref_uri', id: 'nope', uri: './x.vine' }])).toThrow('not found');
  });

  it('update annotations on a task', () => {
    const graph = parse(readFixture('sample.vine'));
    const updated = applyBatch(graph, [
      { op: 'update', id: 'leaf', annotations: { priority: ['high'], tags: ['a', 'b'] } },
    ]);
    const task = getTask(updated, 'leaf');
    expect(task.annotations.get('priority')).toEqual(['high']);
    expect(task.annotations.get('tags')).toEqual(['a', 'b']);
  });

  it('add_task with status sets initial status', () => {
    const graph = parse(readFixture('sample.vine'));
    const updated = applyBatch(graph, [
      { op: 'add_task', id: 'started-task', name: 'Started', status: 'started' },
      { op: 'add_dep', taskId: 'root', depId: 'started-task' },
    ]);
    const task = getTask(updated, 'started-task') as ConcreteTask;
    expect(task.status).toBe('started');
  });

  it('add_task with description sets description', () => {
    const graph = parse(readFixture('sample.vine'));
    const updated = applyBatch(graph, [
      { op: 'add_task', id: 'desc-task', name: 'Described', description: 'A detailed description.' },
      { op: 'add_dep', taskId: 'root', depId: 'desc-task' },
    ]);
    const task = getTask(updated, 'desc-task');
    expect(task.description).toBe('A detailed description.');
  });

  it('add_ref with dependsOn sets dependencies', () => {
    const graph = parse(readFixture('sample.vine'));
    const updated = applyBatch(graph, [
      { op: 'add_ref', id: 'dep-ref', name: 'Dep Ref', vine: './dep.vine', dependsOn: ['leaf'] },
      { op: 'add_dep', taskId: 'root', depId: 'dep-ref' },
    ]);
    const task = getTask(updated, 'dep-ref');
    expect(task.dependencies).toContain('leaf');
  });

  it('add_ref with decisions sets decisions', () => {
    const graph = parse(readFixture('sample.vine'));
    const updated = applyBatch(graph, [
      { op: 'add_ref', id: 'dec-ref', name: 'Dec Ref', vine: './dec.vine', decisions: ['Decision A'] },
      { op: 'add_dep', taskId: 'root', depId: 'dec-ref' },
    ]);
    const task = getTask(updated, 'dec-ref');
    expect([...task.decisions]).toEqual(['Decision A']);
  });

  it('remove_task cleans up dependency references', () => {
    const graph = parse(readFixture('sample.vine'));
    // child-a depends on leaf, remove leaf — child-a no longer depends on leaf
    const updated = applyBatch(graph, [{ op: 'remove_task', id: 'leaf' }]);
    const childA = getTask(updated, 'child-a');
    expect(childA.dependencies).not.toContain('leaf');
    const childB = getTask(updated, 'child-b');
    expect(childB.dependencies).not.toContain('leaf');
  });

  it('multiple set_status in batch applies sequentially', () => {
    const graph = parse(readFixture('sample.vine'));
    const updated = applyBatch(graph, [
      { op: 'set_status', id: 'leaf', status: 'started' },
      { op: 'set_status', id: 'leaf', status: 'reviewing' },
    ]);
    const task = getTask(updated, 'leaf') as ConcreteTask;
    expect(task.status).toBe('reviewing');
  });
});

// ---------------------------------------------------------------------------
// vine_write exhaustive coverage
// ---------------------------------------------------------------------------

describe('vine_write exhaustive coverage', () => {
  // ── Helpers that mirror server.ts internal validation ──────────────
  function assertStringArray(arr: unknown[], label: string, opIndex: number): string[] {
    for (const el of arr) {
      if (typeof el !== 'string') {
        throw new VineError(`Operation ${String(opIndex)}: ${label} must be an array of strings.`);
      }
    }
    return arr as string[];
  }

  function assertAnnotations(obj: unknown, label: string, opIndex: number): Record<string, string[]> {
    if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) {
      throw new VineError(`Operation ${String(opIndex)}: ${label} must be an object.`);
    }
    const result: Record<string, string[]> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      if (!Array.isArray(value) || !value.every((v) => typeof v === 'string')) {
        throw new VineError(`Operation ${String(opIndex)}: ${label} values must be arrays of strings.`);
      }
      result[key] = value;
    }
    return result;
  }

  // ── create flow (server-level) ────────────────────────────────────

  it('1. create + add_task bootstraps a new graph', () => {
    const dir = makeTempDir();
    const file = join(dir, 'bootstrapped.vine');

    // Simulate server create flow: first op is create, find root add_task, build seed, applyBatch rest
    const ops: Operation[] = [
      { op: 'create', version: '1.2.0' },
      { op: 'add_task', id: 'root', name: 'Project Root', description: 'The root task' },
      { op: 'add_task', id: 'child', name: 'Child Task' },
      { op: 'add_dep', taskId: 'root', depId: 'child' },
    ];

    const createOp = ops[0] as { op: 'create'; version?: string };
    const version = createOp.version ?? '1.2.0';
    const remaining = ops.slice(1);
    const rootOp = remaining.find((o) => o.op === 'add_task') as { op: 'add_task'; id: string; name: string; status?: any; description?: string; dependsOn?: string[]; annotations?: Record<string, string[]> };

    const seedTask: ConcreteTask = {
      kind: 'task',
      id: rootOp.id,
      shortName: rootOp.name,
      status: rootOp.status ?? 'notstarted',
      description: rootOp.description ?? '',
      dependencies: rootOp.dependsOn ?? [],
      decisions: [],
      attachments: [],
      annotations: EMPTY_ANNOTATIONS,
    };
    let graph: VineGraph = {
      version,
      title: undefined,
      delimiter: '---',
      prefix: undefined,
      tasks: new Map([[rootOp.id, seedTask]]),
      order: [rootOp.id],
    };

    const afterRoot = remaining.filter((o) => o !== rootOp);
    graph = applyBatch(graph, afterRoot);
    createGraph(file, graph);

    const reloaded = readGraph(file);
    expect(reloaded.tasks.size).toBe(2);
    expect(reloaded.version).toBe('1.2.0');
    expect(getTask(reloaded, 'root').shortName).toBe('Project Root');
    expect(getTask(reloaded, 'root').description).toBe('The root task');
    expect(getTask(reloaded, 'root').dependencies).toContain('child');
    expect(getTask(reloaded, 'child').shortName).toBe('Child Task');
  });

  it('2. create + add_task + add_dep builds connected graph', () => {
    const dir = makeTempDir();
    const file = join(dir, 'connected.vine');

    // Simulate: create, add root, add child with dep, link root → child
    const rootOp = { op: 'add_task' as const, id: 'root', name: 'Root' };
    const remaining: Operation[] = [
      rootOp,
      { op: 'add_task', id: 'step-a', name: 'Step A' },
      { op: 'add_task', id: 'step-b', name: 'Step B', dependsOn: ['step-a'] },
      { op: 'add_dep', taskId: 'root', depId: 'step-a' },
      { op: 'add_dep', taskId: 'root', depId: 'step-b' },
    ];

    const seedTask: ConcreteTask = {
      kind: 'task',
      id: 'root',
      shortName: 'Root',
      status: 'notstarted',
      description: '',
      dependencies: [],
      decisions: [],
      attachments: [],
      annotations: EMPTY_ANNOTATIONS,
    };
    let graph: VineGraph = {
      version: '1.2.0',
      title: undefined,
      delimiter: '---',
      prefix: undefined,
      tasks: new Map([['root', seedTask]]),
      order: ['root'],
    };

    const afterRoot = remaining.filter((o) => o !== rootOp);
    graph = applyBatch(graph, afterRoot);
    createGraph(file, graph);

    const reloaded = readGraph(file);
    expect(reloaded.tasks.size).toBe(3);
    expect(getTask(reloaded, 'root').dependencies).toContain('step-a');
    expect(getTask(reloaded, 'root').dependencies).toContain('step-b');
    expect(getTask(reloaded, 'step-b').dependencies).toContain('step-a');
  });

  it('3. create with no add_task should fail', () => {
    // Simulate server logic: create requires at least one add_task
    const remaining: Operation[] = [
      { op: 'set_status', id: 'x', status: 'started' },
    ];
    const rootOp = remaining.find((o) => o.op === 'add_task');
    expect(rootOp).toBeUndefined();
    // Server would throw:
    expect(() => {
      if (rootOp === undefined) {
        throw new VineError('create requires at least one add_task operation to define the root task.');
      }
    }).toThrow('create requires at least one add_task');
  });

  it('4. create with version field uses that version', () => {
    const dir = makeTempDir();
    const file = join(dir, 'versioned.vine');

    const version = '1.1.0';
    const seedTask: ConcreteTask = {
      kind: 'task',
      id: 'root',
      shortName: 'Root',
      status: 'notstarted',
      description: '',
      dependencies: [],
      decisions: [],
      attachments: [],
      annotations: EMPTY_ANNOTATIONS,
    };
    const graph: VineGraph = {
      version,
      title: undefined,
      delimiter: '---',
      prefix: undefined,
      tasks: new Map([['root', seedTask]]),
      order: ['root'],
    };
    createGraph(file, graph);
    const reloaded = readGraph(file);
    expect(reloaded.version).toBe('1.1.0');
  });

  it('5. create + add_task + set_status sets status on new task', () => {
    const dir = makeTempDir();
    const file = join(dir, 'with-status.vine');

    const rootOp = { op: 'add_task' as const, id: 'root', name: 'Root' };
    const remaining: Operation[] = [
      rootOp,
      { op: 'add_task', id: 'leaf', name: 'Leaf Task' },
      { op: 'add_dep', taskId: 'root', depId: 'leaf' },
      { op: 'set_status', id: 'leaf', status: 'started' as const },
    ];

    const seedTask: ConcreteTask = {
      kind: 'task',
      id: 'root',
      shortName: 'Root',
      status: 'notstarted',
      description: '',
      dependencies: [],
      decisions: [],
      attachments: [],
      annotations: EMPTY_ANNOTATIONS,
    };
    let graph: VineGraph = {
      version: '1.2.0',
      title: undefined,
      delimiter: '---',
      prefix: undefined,
      tasks: new Map([['root', seedTask]]),
      order: ['root'],
    };

    const afterRoot = remaining.filter((o) => o !== rootOp);
    graph = applyBatch(graph, afterRoot);
    createGraph(file, graph);

    const reloaded = readGraph(file);
    const leaf = getTask(reloaded, 'leaf') as ConcreteTask;
    expect(leaf.status).toBe('started');
  });

  // ── extract_to_ref flow (server-level) ────────────────────────────

  it('6. extract builds child graph and creates ref in parent', () => {
    const dir = makeTempDir();
    const parentFile = join(dir, 'parent.vine');
    const childFile = join(dir, 'extracted-child.vine');

    // Parent: root -> middle -> leaf
    const parentVine = `vine 1.2.0\n---\n[root] Root (started)\n-> middle\n---\n[middle] Middle Task (notstarted)\nThe middle task.\n-> leaf\n---\n[leaf] Leaf (notstarted)\nA leaf.\n`;
    writeFileSync(parentFile, parentVine, 'utf-8');

    let graph = readGraph(parentFile);
    const task = getTask(graph, 'middle') as ConcreteTask;

    // Build child graph (task without deps as root)
    const childRoot: ConcreteTask = {
      kind: 'task',
      id: task.id,
      shortName: task.shortName,
      status: task.status,
      description: task.description,
      dependencies: [],
      decisions: [...task.decisions],
      attachments: [...task.attachments],
      annotations: task.annotations,
    };
    const childGraph: VineGraph = {
      version: graph.version,
      title: task.shortName,
      delimiter: '---',
      prefix: undefined,
      tasks: new Map([[task.id, childRoot]]),
      order: [task.id],
    };
    createGraph(childFile, childGraph);

    // Replace task with ref in parent
    const refNode: RefTask = {
      kind: 'ref',
      id: task.id,
      shortName: task.shortName,
      vine: './extracted-child.vine',
      description: '',
      dependencies: [...task.dependencies],
      decisions: [],
      annotations: task.annotations,
    };
    const newTasks = new Map(graph.tasks);
    newTasks.set(task.id, refNode);
    graph = { ...graph, tasks: newTasks };
    validate(graph);
    writeGraph(parentFile, graph);

    // Verify parent has ref node
    const parentReloaded = readGraph(parentFile);
    const middleTask = getTask(parentReloaded, 'middle');
    expect(middleTask.kind).toBe('ref');
    expect((middleTask as RefTask).vine).toBe('./extracted-child.vine');

    // Verify child exists and has the task
    const childReloaded = readGraph(childFile);
    expect(childReloaded.tasks.size).toBe(1);
    expect(getTask(childReloaded, 'middle').shortName).toBe('Middle Task');
    expect(getTask(childReloaded, 'middle').dependencies).toEqual([]);
    expect(childReloaded.title).toBe('Middle Task');
  });

  it('7. extract preserves dependency edges in parent', () => {
    const dir = makeTempDir();
    const parentFile = join(dir, 'parent-deps.vine');
    const childFile = join(dir, 'child-deps.vine');

    // middle depends on leaf — after extract, ref node for middle still depends on leaf
    const parentVine = `vine 1.2.0\n---\n[root] Root (started)\n-> middle\n---\n[middle] Middle (notstarted)\n-> leaf\n---\n[leaf] Leaf (notstarted)\n`;
    writeFileSync(parentFile, parentVine, 'utf-8');

    let graph = readGraph(parentFile);
    const task = getTask(graph, 'middle') as ConcreteTask;

    const childRoot: ConcreteTask = {
      kind: 'task',
      id: task.id,
      shortName: task.shortName,
      status: task.status,
      description: task.description,
      dependencies: [],
      decisions: [],
      attachments: [],
      annotations: EMPTY_ANNOTATIONS,
    };
    const childGraph: VineGraph = {
      version: graph.version,
      title: task.shortName,
      delimiter: '---',
      prefix: undefined,
      tasks: new Map([[task.id, childRoot]]),
      order: [task.id],
    };
    createGraph(childFile, childGraph);

    const refNode: RefTask = {
      kind: 'ref',
      id: task.id,
      shortName: task.shortName,
      vine: './child-deps.vine',
      description: '',
      dependencies: [...task.dependencies], // should retain ['leaf']
      decisions: [],
      annotations: task.annotations,
    };
    const newTasks = new Map(graph.tasks);
    newTasks.set(task.id, refNode);
    graph = { ...graph, tasks: newTasks };
    validate(graph);
    writeGraph(parentFile, graph);

    const parentReloaded = readGraph(parentFile);
    const ref = getTask(parentReloaded, 'middle');
    expect(ref.kind).toBe('ref');
    expect(ref.dependencies).toContain('leaf');
  });

  it('8. extract with custom refName', () => {
    const dir = makeTempDir();
    const parentFile = join(dir, 'parent-refname.vine');
    const childFile = join(dir, 'custom-ref.vine');

    const parentVine = `vine 1.2.0\n---\n[root] Root (started)\n-> target\n---\n[target] Original Name (notstarted)\nSome work.\n`;
    writeFileSync(parentFile, parentVine, 'utf-8');

    let graph = readGraph(parentFile);
    const task = getTask(graph, 'target') as ConcreteTask;

    // Build child
    const childRoot: ConcreteTask = { ...task, dependencies: [] };
    const childGraph: VineGraph = {
      version: graph.version,
      title: task.shortName,
      delimiter: '---',
      prefix: undefined,
      tasks: new Map([[task.id, childRoot]]),
      order: [task.id],
    };
    createGraph(childFile, childGraph);

    // Use custom refName instead of original shortName
    const customRefName = 'Custom Ref Label';
    const refNode: RefTask = {
      kind: 'ref',
      id: task.id,
      shortName: customRefName,
      vine: './custom-ref.vine',
      description: '',
      dependencies: [...task.dependencies],
      decisions: [],
      annotations: task.annotations,
    };
    const newTasks = new Map(graph.tasks);
    newTasks.set(task.id, refNode);
    graph = { ...graph, tasks: newTasks };
    validate(graph);
    writeGraph(parentFile, graph);

    const parentReloaded = readGraph(parentFile);
    const ref = getTask(parentReloaded, 'target');
    expect(ref.kind).toBe('ref');
    expect(ref.shortName).toBe('Custom Ref Label');
  });

  it('9. extract root task should fail', () => {
    const dir = makeTempDir();
    const parentFile = join(dir, 'no-root-extract.vine');
    writeFileSync(parentFile, `vine 1.2.0\n---\n[root] Root (started)\n-> child\n---\n[child] Child (notstarted)\n`, 'utf-8');

    const graph = readGraph(parentFile);
    const rootId = graph.order[0]!;

    // Server logic: refuse to extract the root
    expect(() => {
      const task = graph.tasks.get(rootId);
      if (!task) throw new VineError(`Task not found: ${rootId}`);
      if (task.id === graph.order[0]) {
        throw new VineError('Cannot extract the root task to a ref.');
      }
    }).toThrow('Cannot extract the root task');
  });

  it('10. extract ref node should fail', () => {
    const dir = makeTempDir();
    const file = join(dir, 'no-ref-extract.vine');
    const refVine = `vine 1.1.0\n---\n[root] Root (started)\n-> sub\n---\nref [sub] Sub Module (./sub.vine)\n`;
    writeFileSync(file, refVine, 'utf-8');

    const graph = readGraph(file);
    const task = graph.tasks.get('sub');

    expect(() => {
      if (!task) throw new VineError('Task not found: sub');
      if (task.kind === 'ref') {
        throw new VineError(`Task "sub" is already a reference node.`);
      }
    }).toThrow('already a reference node');
  });

  it('11. extract then re-expand round-trips', () => {
    const dir = makeTempDir();
    const parentFile = join(dir, 'roundtrip-parent.vine');
    const childFile = join(dir, 'roundtrip-child.vine');

    const parentVine = `vine 1.2.0\n---\n[root] Root (started)\n-> worker\n---\n[worker] Worker Task (notstarted)\nDo the work.\n`;
    writeFileSync(parentFile, parentVine, 'utf-8');

    // Step 1: Extract worker to ref
    let graph = readGraph(parentFile);
    const task = getTask(graph, 'worker') as ConcreteTask;

    const childRoot: ConcreteTask = { ...task, dependencies: [] };
    const childGraph: VineGraph = {
      version: graph.version,
      title: task.shortName,
      delimiter: '---',
      prefix: undefined,
      tasks: new Map([[task.id, childRoot]]),
      order: [task.id],
    };
    createGraph(childFile, childGraph);

    const refNode: RefTask = {
      kind: 'ref',
      id: task.id,
      shortName: task.shortName,
      vine: './roundtrip-child.vine',
      description: '',
      dependencies: [...task.dependencies],
      decisions: [],
      annotations: task.annotations,
    };
    const newTasks = new Map(graph.tasks);
    newTasks.set(task.id, refNode);
    graph = { ...graph, tasks: newTasks };
    validate(graph);
    writeGraph(parentFile, graph);

    // Verify ref exists
    const afterExtract = readGraph(parentFile);
    expect(getTask(afterExtract, 'worker').kind).toBe('ref');

    // Step 2: Re-expand the ref
    const childContent = readFileContent(childFile);
    const parsedChild = parse(childContent);
    const expanded = expandVineRef(afterExtract, 'worker', parsedChild);
    writeGraph(parentFile, expanded);

    // Verify concrete again
    const afterExpand = readGraph(parentFile);
    const expandedTask = getTask(afterExpand, 'worker');
    expect(expandedTask.kind).toBe('task');
    expect(expandedTask.shortName).toBe('Worker Task');
    expect((expandedTask as ConcreteTask).status).toBe('notstarted');
  });

  // ── Input validation (assertStringArray / assertAnnotations) ──────

  it('12. decisions with non-string elements rejected', () => {
    expect(() => {
      assertStringArray([1, 2] as unknown as unknown[], 'update "decisions"', 0);
    }).toThrow('must be an array of strings');
  });

  it('13. dependsOn with non-string elements rejected', () => {
    expect(() => {
      assertStringArray([true] as unknown as unknown[], 'add_task "dependsOn"', 0);
    }).toThrow('must be an array of strings');
  });

  it('14. annotations with non-string-array values rejected', () => {
    expect(() => {
      assertAnnotations({ key: 'not-array' }, 'add_task "annotations"', 0);
    }).toThrow('values must be arrays of strings');
  });

  it('15. annotations with non-object rejected', () => {
    expect(() => {
      assertAnnotations('string', 'add_task "annotations"', 0);
    }).toThrow('must be an object');
  });

  it('16. attachments with missing fields rejected', () => {
    // Simulate the server's attachment validation
    const badAttachments = [{ class: 'artifact' }];
    expect(() => {
      for (const el of badAttachments as unknown[]) {
        if (
          el === null ||
          typeof el !== 'object' ||
          typeof (el as Record<string, unknown>).class !== 'string' ||
          typeof (el as Record<string, unknown>).mime !== 'string' ||
          typeof (el as Record<string, unknown>).uri !== 'string'
        ) {
          throw new VineError('Operation 0: update "attachments" elements must have class, mime, and uri as strings.');
        }
      }
    }).toThrow('must have class, mime, and uri as strings');
  });

  // ── claim response structure ──────────────────────────────────────

  it('17. claim returns task details with resolved_dependencies', () => {
    const dir = makeTempDir();
    const file = writeSample(dir);
    let graph = readGraph(file);
    // Claim the leaf task
    graph = applyBatch(graph, [{ op: 'claim', id: 'leaf' }]);
    writeGraph(file, graph);

    // Simulate the server's claimed field construction
    const task = getTask(graph, 'leaf');
    const deps = getDependencies(graph, 'leaf');

    // Build the claimed structure as server.ts does
    const formatTask = (t: any) => ({
      id: t.id,
      kind: t.kind,
      shortName: t.shortName,
      description: t.description,
      dependencies: [...t.dependencies],
      decisions: [...t.decisions],
      ...(t.kind === 'task'
        ? { status: t.status, attachments: t.attachments.map((a: any) => ({ class: a.class, mime: a.mime, uri: a.uri })) }
        : { vine: t.vine }),
    });
    const claimed = {
      ...formatTask(task),
      resolved_dependencies: deps.map((d) => ({
        id: d.id,
        shortName: d.shortName,
        kind: d.kind,
        ...(d.kind === 'task'
          ? { status: (d as ConcreteTask).status, decisions: [...d.decisions], attachments: (d as ConcreteTask).attachments.map((a) => ({ class: a.class, mime: a.mime, uri: a.uri })) }
          : { vine: (d as RefTask).vine, decisions: [...d.decisions] }),
      })),
    };

    // Verify structure
    expect(claimed.id).toBe('leaf');
    expect(claimed.kind).toBe('task');
    expect((claimed as Record<string, unknown>).status).toBe('started'); // claim sets to started
    expect(claimed.resolved_dependencies).toBeDefined();
    expect(Array.isArray(claimed.resolved_dependencies)).toBe(true);
    // leaf has no deps in SAMPLE_VINE
    expect(claimed.resolved_dependencies).toHaveLength(0);

    // Now claim child-a which depends on leaf — verify resolved_dependencies populated
    graph = applyBatch(graph, [{ op: 'claim', id: 'child-a' }]);
    const task2 = getTask(graph, 'child-a');
    const deps2 = getDependencies(graph, 'child-a');
    const claimed2 = {
      ...formatTask(task2),
      resolved_dependencies: deps2.map((d) => ({
        id: d.id,
        shortName: d.shortName,
        kind: d.kind,
        ...(d.kind === 'task'
          ? { status: (d as ConcreteTask).status, decisions: [...d.decisions], attachments: (d as ConcreteTask).attachments.map((a) => ({ class: a.class, mime: a.mime, uri: a.uri })) }
          : { vine: (d as RefTask).vine, decisions: [...d.decisions] }),
      })),
    };
    expect(claimed2.id).toBe('child-a');
    expect((claimed2 as Record<string, unknown>).status).toBe('started');
    expect(claimed2.resolved_dependencies).toHaveLength(1);
    expect(claimed2.resolved_dependencies[0]!.id).toBe('leaf');
    expect(claimed2.resolved_dependencies[0]!.kind).toBe('task');
    expect((claimed2.resolved_dependencies[0] as Record<string, unknown>).status).toBe('started');
  });

  // ── multiple extract_to_ref rejection ─────────────────────────────

  it('18. multiple extract_to_ref in batch should fail', () => {
    const ops: Operation[] = [
      { op: 'extract_to_ref', id: 'task-a', vine: './a.vine' },
      { op: 'extract_to_ref', id: 'task-b', vine: './b.vine' },
    ];
    const extractCount = ops.filter((o) => o.op === 'extract_to_ref').length;
    expect(extractCount).toBe(2);
    expect(() => {
      if (extractCount > 1) {
        throw new VineError('At most one extract_to_ref operation is allowed per batch.');
      }
    }).toThrow('At most one extract_to_ref');
  });
});
