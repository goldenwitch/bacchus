import { describe, it, expect } from 'vitest';

import {
  parse,
  getTask,
  getDescendants,
  getSummary,
  filterByStatus,
  searchTasks,
  getRefs,
  getDependencies,
  getDependants,
  applyBatch,
  validate,
} from '@bacchus/core';
import type { ConcreteTask, RefTask } from '@bacchus/core';

import { readGraph } from '../src/io.js';

import { makeTempDir, useTempDir, writeSample, readFixture, writeFixture } from './fixtures/helpers.js';

useTempDir();

describe('vine_read operations', () => {
  it('vine_read validate: parse returns valid graph with correct task count', () => {
    const file = writeSample(makeTempDir());
    const graph = readGraph(file);
    expect(graph.tasks.size).toBe(4);
  });

  it('vine_read summary: getSummary returns correct summary', () => {
    const file = writeSample(makeTempDir());
    const graph = readGraph(file);
    const summary = getSummary(graph);
    expect(summary.total).toBe(4);
    expect(summary.rootId).toBe('root');
    expect(summary.rootName).toBe('Root Task');
    expect(summary.byStatus.complete).toBe(1);
    expect(summary.byStatus.planning).toBe(1);
    expect(summary.byStatus.notstarted).toBe(1);
    expect(summary.byStatus.started).toBe(1);
  });

  it('vine_read list: lists all tasks (4 in sample)', () => {
    const graph = readGraph(writeSample(makeTempDir()));
    expect(graph.order).toHaveLength(4);
  });

  it('vine_read list (status filter): filterByStatus returns only matching', () => {
    const graph = readGraph(writeSample(makeTempDir()));
    const complete = filterByStatus(graph, 'complete');
    expect(complete).toHaveLength(1);
    expect(complete[0]!.id).toBe('child-a');
  });

  it('vine_read list (search): searchTasks matches by text', () => {
    const graph = readGraph(writeSample(makeTempDir()));
    const results = searchTasks(graph, 'leaf');
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results.some((t) => t.id === 'leaf')).toBe(true);
  });

  it('vine_read task: getTask returns correct task details', () => {
    const graph = readGraph(writeSample(makeTempDir()));
    const task = getTask(graph, 'child-b') as ConcreteTask;
    expect(task.shortName).toBe('Child B');
    expect(task.status).toBe('planning');
    expect(task.dependencies).toContain('leaf');
  });

  it('vine_read descendants: getDescendants returns transitive dependants', () => {
    const graph = readGraph(writeSample(makeTempDir()));
    const desc = getDescendants(graph, 'leaf');
    const ids = desc.map((t) => t.id);
    expect(ids).toContain('child-a');
    expect(ids).toContain('child-b');
  });

  it('vine_read search: searchTasks finds tasks by query', () => {
    const graph = readGraph(writeSample(makeTempDir()));
    const results = searchTasks(graph, 'Root');
    expect(results).toHaveLength(1);
    expect(results[0]!.id).toBe('root');
  });

  it('vine_read refs: returns ref nodes from graph', () => {
    const dir = makeTempDir();
    const file = writeFixture(dir, 'ref-parent.vine', 'ref.vine');
    const graph = readGraph(file);
    const refs = getRefs(graph);
    expect(refs).toHaveLength(1);
    expect(refs[0]!.id).toBe('ext-ref');
  });

  it('vine_read refs: returns empty array when no refs', () => {
    const graph = readGraph(writeSample(makeTempDir()));
    const refs = getRefs(graph);
    expect(refs).toHaveLength(0);
  });
});

describe('dependency context', () => {
  it('getDependencies returns resolved dependency objects', () => {
    const dir = makeTempDir();
    const file = writeSample(dir);
    const graph = readGraph(file);
    const deps = getDependencies(graph, 'child-a');
    expect(deps).toHaveLength(1);
    expect(deps[0]!.id).toBe('leaf');
  });

  it('getDependants returns upstream tasks', () => {
    const dir = makeTempDir();
    const file = writeSample(dir);
    const graph = readGraph(file);
    const dependants = getDependants(graph, 'leaf');
    const ids = dependants.map((t) => t.id);
    expect(ids).toContain('child-a');
    expect(ids).toContain('child-b');
  });
});

describe('vine_read context action', () => {
  it('returns task with resolved_dependencies and dependant_tasks', () => {
    const graph = parse(readFixture('sample.vine'));
    getTask(graph, 'child-a');
    const deps = getDependencies(graph, 'child-a');
    const dependants = getDependants(graph, 'child-a');
    expect(deps.length).toBeGreaterThan(0);
    expect(dependants.length).toBeGreaterThan(0);
    for (const dep of deps) {
      expect(dep).toHaveProperty('id');
      expect(dep).toHaveProperty('decisions');
    }
    for (const d of dependants) {
      expect(d).toHaveProperty('id');
      expect(d).toHaveProperty('shortName');
    }
  });

  it('returns empty arrays when task has no deps or dependants', () => {
    const graph = parse(`vine 1.0.0\n---\n[solo] Solo Task (notstarted)\nA solo task.\n`);
    const deps = getDependencies(graph, 'solo');
    const dependants = getDependants(graph, 'solo');
    expect(deps).toEqual([]);
    expect(dependants).toEqual([]);
  });

  it('context includes ref dependency details', () => {
    const vine = `vine 1.1.0\n---\n[root] Root (started)\n-> child\n-> ext\n---\n[child] Child (complete)\n-> ext\n---\nref [ext] External (./ext.vine)\n`;
    const graph = parse(vine);
    const deps = getDependencies(graph, 'child');
    const refDep = deps.find((d) => d.id === 'ext');
    expect(refDep).toBeDefined();
    expect(refDep!.kind).toBe('ref');
    if (refDep!.kind === 'ref') {
      expect((refDep as RefTask).vine).toBe('./ext.vine');
    }
  });
});

describe('graph traversal', () => {
  it('getDescendants on root returns empty (root has no dependants)', () => {
    const graph = parse(readFixture('sample.vine'));
    const desc = getDescendants(graph, 'root');
    expect(desc).toEqual([]);
  });

  it('getDescendants on leaf returns transitive dependants', () => {
    const graph = parse(readFixture('sample.vine'));
    const desc = getDescendants(graph, 'leaf');
    const ids = desc.map((t) => t.id);
    expect(ids).toContain('child-a');
    expect(ids).toContain('child-b');
    expect(ids).toContain('root');
  });

  it('getSummary.leafCount counts leaf tasks', () => {
    const graph = parse(readFixture('sample.vine'));
    const summary = getSummary(graph);
    expect(summary.leafCount).toBe(1);
  });

  it('searchTasks is case-insensitive', () => {
    const graph = parse(readFixture('sample.vine'));
    const results = searchTasks(graph, 'ROOT TASK');
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results.some((t) => t.id === 'root')).toBe(true);
  });

  it('filterByStatus returns empty for unused status', () => {
    const graph = parse(readFixture('sample.vine'));
    const results = filterByStatus(graph, 'blocked');
    expect(results).toEqual([]);
  });
});

describe('vine_read exhaustive coverage', () => {
  it('context: resolved dependencies include decisions and attachments', () => {
    let graph = parse(readFixture('sample.vine'));
    graph = applyBatch(graph, [
      {
        op: 'update', id: 'leaf',
        decisions: ['> Used widget pattern', '> Chose approach B'],
        attachments: [{ class: 'artifact' as const, mime: 'text/plain', uri: './output.txt' }],
      },
    ]);
    const deps = getDependencies(graph, 'child-a');
    const leafDep = deps.find((d) => d.id === 'leaf');
    expect(leafDep).toBeDefined();
    expect(leafDep!.decisions).toEqual(['> Used widget pattern', '> Chose approach B']);
    expect(leafDep!.kind).toBe('task');
    const concrete = leafDep as ConcreteTask;
    expect(concrete.attachments).toHaveLength(1);
    expect(concrete.attachments[0]!.class).toBe('artifact');
    expect(concrete.attachments[0]!.uri).toBe('./output.txt');
  });

  it('context: task with multiple dependencies resolves all deps', () => {
    const graph = parse(readFixture('sample.vine'));
    const deps = getDependencies(graph, 'root');
    expect(deps).toHaveLength(2);
    const depIds = deps.map((d) => d.id);
    expect(depIds).toContain('child-a');
    expect(depIds).toContain('child-b');
    for (const dep of deps) {
      expect(dep).toHaveProperty('id');
      expect(dep).toHaveProperty('shortName');
      expect(dep).toHaveProperty('decisions');
      expect(dep).toHaveProperty('kind');
    }
  });

  it('context: root task has no dependants', () => {
    const graph = parse(readFixture('sample.vine'));
    const dependants = getDependants(graph, 'root');
    expect(dependants).toEqual([]);
  });

  it('context: leaf task has dependants but no dependencies', () => {
    const graph = parse(readFixture('sample.vine'));
    const deps = getDependencies(graph, 'leaf');
    const dependants = getDependants(graph, 'leaf');
    expect(deps).toEqual([]);
    expect(dependants.length).toBeGreaterThan(0);
    const dependantIds = dependants.map((d) => d.id);
    expect(dependantIds).toContain('child-a');
    expect(dependantIds).toContain('child-b');
  });

  it('list: filterByStatus with non-matching status returns empty', () => {
    const graph = parse(readFixture('sample.vine'));
    const reviewing = filterByStatus(graph, 'reviewing');
    expect(reviewing).toEqual([]);
    const blocked = filterByStatus(graph, 'blocked');
    expect(blocked).toEqual([]);
  });

  it('list: graph order includes both concrete and ref nodes', () => {
    const graph = parse(readFixture('ref-parent.vine'));
    expect(graph.order).toHaveLength(4);
    expect(graph.order).toContain('ext-ref');
    const refTask = getTask(graph, 'ext-ref');
    expect(refTask.kind).toBe('ref');
    const rootTask = getTask(graph, 'root');
    expect(rootTask.kind).toBe('task');
  });

  it('task: getTask on ref node returns kind=ref with vine field', () => {
    const graph = parse(readFixture('ref-parent.vine'));
    const task = getTask(graph, 'ext-ref');
    expect(task.kind).toBe('ref');
    expect(task.shortName).toBe('External Module');
    expect(task.description).toBe('A reference to an external vine file.');
    const ref = task as RefTask;
    expect(ref.vine).toBe('./child.vine');
    expect(ref.dependencies).toContain('leaf');
  });

  it('task: getTask returns attachments and decisions after update', () => {
    let graph = parse(readFixture('sample.vine'));
    graph = applyBatch(graph, [
      {
        op: 'update', id: 'child-b',
        decisions: ['> Switched to plan C', '> Reviewed with team'],
        attachments: [
          { class: 'guidance' as const, mime: 'text/markdown', uri: './plan.md' },
          { class: 'file' as const, mime: 'application/json', uri: './data.json' },
        ],
      },
    ]);
    const task = getTask(graph, 'child-b') as ConcreteTask;
    expect(task.decisions).toHaveLength(2);
    expect(task.decisions[0]).toBe('> Switched to plan C');
    expect(task.decisions[1]).toBe('> Reviewed with team');
    expect(task.attachments).toHaveLength(2);
    expect(task.attachments[0]!.class).toBe('guidance');
    expect(task.attachments[0]!.mime).toBe('text/markdown');
    expect(task.attachments[0]!.uri).toBe('./plan.md');
    expect(task.attachments[1]!.class).toBe('file');
    expect(task.attachments[1]!.uri).toBe('./data.json');
  });

  it('task: getTask preserves annotations', () => {
    const vine = `vine 1.2.0\n---\n[root] Root Task (started) @sprite(./sprites/hero.svg) @priority(high)\nThe root task.\n`;
    const graph = parse(vine);
    const task = getTask(graph, 'root');
    expect(task.annotations.get('sprite')).toEqual(['./sprites/hero.svg']);
    expect(task.annotations.get('priority')).toEqual(['high']);
  });

  it('descendants: mid-level task returns partial tree', () => {
    const graph = parse(readFixture('sample.vine'));
    const desc = getDescendants(graph, 'child-a');
    const ids = desc.map((t) => t.id);
    expect(ids).toContain('root');
    expect(ids).not.toContain('leaf');
    expect(ids).not.toContain('child-b');
  });

  it('descendants: root task (no dependants) returns empty', () => {
    const graph = parse(readFixture('sample.vine'));
    const desc = getDescendants(graph, 'root');
    expect(desc).toEqual([]);
  });

  it('search: searchTasks matches description text', () => {
    const graph = parse(readFixture('sample.vine'));
    const results = searchTasks(graph, 'leaf task');
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results.some((t) => t.id === 'leaf')).toBe(true);
  });

  it('search: searchTasks matches by shortName', () => {
    const graph = parse(readFixture('sample.vine'));
    const results = searchTasks(graph, 'Child B');
    expect(results).toHaveLength(1);
    expect(results[0]!.id).toBe('child-b');
  });

  it('search: searchTasks with no matches returns empty array', () => {
    const graph = parse(readFixture('sample.vine'));
    const results = searchTasks(graph, 'xyzzy-nonexistent-query');
    expect(results).toEqual([]);
  });

  it('refs: getRefs returns refs with populated dependencies', () => {
    const graph = parse(readFixture('ref-parent.vine'));
    const refs = getRefs(graph);
    expect(refs).toHaveLength(1);
    const ref = refs[0]!;
    expect(ref.id).toBe('ext-ref');
    expect(ref.kind).toBe('ref');
    expect(ref.vine).toBe('./child.vine');
    expect(ref.dependencies).toContain('leaf');
    expect(ref.dependencies).toHaveLength(1);
  });

  it('refs: getRefs returns all ref nodes from graph with multiple refs', () => {
    const multiRefVine = `vine 1.1.0\ntitle: Multi Ref\n---\n[root] Root (started)\n-> ref-a\n-> ref-b\n---\nref [ref-a] Module A (./a.vine)\nFirst ref.\n---\nref [ref-b] Module B (./b.vine)\nSecond ref.\n-> ref-a\n`;
    const graph = parse(multiRefVine);
    const refs = getRefs(graph);
    expect(refs).toHaveLength(2);
    const refIds = refs.map((r) => r.id);
    expect(refIds).toContain('ref-a');
    expect(refIds).toContain('ref-b');
    const refA = refs.find((r) => r.id === 'ref-a')!;
    const refB = refs.find((r) => r.id === 'ref-b')!;
    expect(refA.vine).toBe('./a.vine');
    expect(refB.vine).toBe('./b.vine');
    expect(refB.dependencies).toContain('ref-a');
  });

  it('validate: v1.1.0 graph passes validation', () => {
    const graph = parse(readFixture('ref-parent.vine'));
    expect(graph.version).toBe('1.1.0');
    expect(() => validate(graph)).not.toThrow();
    const summary = getSummary(graph);
    expect(summary.total).toBe(4);
    expect(summary.rootId).toBe('root');
  });

  it('validate: v1.2.0 graph with annotations passes validation', () => {
    const annotatedVine = `vine 1.2.0\ntitle: Annotated Project\n---\n[root] Root Task (started) @sprite(./sprites/root.svg) @priority(high)\nThe annotated root.\n-> child\n---\n[child] Child Task (notstarted) @sprite(./sprites/child.png)\nAnnotated child.\n`;
    const graph = parse(annotatedVine);
    expect(graph.version).toBe('1.2.0');
    expect(() => validate(graph)).not.toThrow();
    const root = getTask(graph, 'root');
    expect(root.annotations.get('sprite')).toEqual(['./sprites/root.svg']);
    expect(root.annotations.get('priority')).toEqual(['high']);
    const child = getTask(graph, 'child');
    expect(child.annotations.get('sprite')).toEqual(['./sprites/child.png']);
    const summary = getSummary(graph);
    expect(summary.total).toBe(2);
    expect(summary.rootId).toBe('root');
  });
});
