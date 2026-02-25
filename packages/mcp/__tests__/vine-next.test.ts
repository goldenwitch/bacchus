import { describe, it, expect } from 'vitest';

import {
  parse,
  getActionableTasks,
  setStatus,
  removeTask,
  applyBatch,
  expandVineRef,
} from '@bacchus/core';

import { readGraph, writeGraph } from '../src/io.js';

import { makeTempDir, useTempDir, writeSample, readFixture, writeFixture } from './fixtures/helpers.js';

useTempDir();

// ---------------------------------------------------------------------------
// vine_next
// ---------------------------------------------------------------------------

describe('vine_next', () => {
  it('vine_next: returns leaves as ready on a fresh graph', () => {
    const dir = makeTempDir();
    const file = writeSample(dir);
    const graph = readGraph(file);
    const result = getActionableTasks(graph);
    expect(result.ready.map((t) => t.id)).toEqual(['leaf']);
    expect(result.completable).toEqual([]);
    expect(result.expandable).toEqual([]);
  });

  it('vine_next: unblocks dependants when a leaf is set to complete', () => {
    const dir = makeTempDir();
    const file = writeSample(dir);
    let graph = readGraph(file);
    graph = setStatus(graph, 'leaf', 'complete');
    writeGraph(file, graph);
    const reloaded = readGraph(file);
    const result = getActionableTasks(reloaded);
    expect(result.ready.map((t) => t.id)).toEqual(['child-b']);
  });

  it('vine_next: reviewing task appears in completable when dependant starts', () => {
    const dir = makeTempDir();
    const file = writeSample(dir);
    let graph = readGraph(file);
    graph = setStatus(graph, 'leaf', 'reviewing');
    graph = setStatus(graph, 'child-a', 'started');
    writeGraph(file, graph);
    const reloaded = readGraph(file);
    const result = getActionableTasks(reloaded);
    expect(result.completable.map((t) => t.id)).toEqual(['leaf']);
  });

  it('vine_next: ref nodes on frontier appear in needs_expansion', () => {
    const dir = makeTempDir();
    const file = writeFixture(dir, 'ref-parent.vine', 'ref.vine');
    const graph = readGraph(file);
    const result = getActionableTasks(graph);
    expect(result.ready.map((t) => t.id)).toEqual(['leaf']);
    expect(result.expandable).toEqual([]);
    const updated = setStatus(graph, 'leaf', 'complete');
    writeGraph(file, updated);
    const reloaded = readGraph(file);
    const result2 = getActionableTasks(reloaded);
    expect(result2.expandable.map((t) => t.id)).toEqual(['ext-ref']);
  });

  it('vine_next: progress reflects file state after mutations', () => {
    const dir = makeTempDir();
    const file = writeSample(dir);
    const g = readGraph(file);
    const result = getActionableTasks(g);
    expect(result.progress.total).toBe(4);
    expect(result.progress.complete).toBe(1);
    expect(result.progress.percentage).toBe(25);
    expect(result.progress.rootStatus).toBe('started');
  });
});

// ---------------------------------------------------------------------------
// vine_next enhancements
// ---------------------------------------------------------------------------

describe('vine_next enhancements', () => {
  it('blocked tasks with satisfied deps appear in blocked list', () => {
    const dir = makeTempDir();
    const file = writeSample(dir);
    let graph = readGraph(file);
    graph = applyBatch(graph, [
      { op: 'set_status', id: 'leaf', status: 'complete' },
      { op: 'set_status', id: 'child-b', status: 'blocked' },
    ]);
    writeGraph(file, graph);
    const reloaded = readGraph(file);
    const result = getActionableTasks(reloaded);
    expect(result.blocked.map((t) => t.id)).toContain('child-b');
  });

  it('readyCount is set in progress', () => {
    const dir = makeTempDir();
    const file = writeSample(dir);
    const graph = readGraph(file);
    const result = getActionableTasks(graph);
    expect(result.progress.readyCount).toBe(result.ready.length);
  });
});

// ---------------------------------------------------------------------------
// vine_next root completion
// ---------------------------------------------------------------------------

describe('vine_next root completion', () => {
  it('reviewing root with all others complete appears in completable', () => {
    const dir = makeTempDir();
    const file = writeSample(dir);
    let graph = readGraph(file);
    graph = applyBatch(graph, [
      { op: 'set_status', id: 'leaf', status: 'complete' },
      { op: 'set_status', id: 'child-a', status: 'complete' },
      { op: 'set_status', id: 'child-b', status: 'complete' },
      { op: 'set_status', id: 'root', status: 'reviewing' },
    ]);
    writeGraph(file, graph);
    const reloaded = readGraph(file);
    const result = getActionableTasks(reloaded);
    expect(result.completable.map((t) => t.id)).toContain('root');
  });

  it('reviewing root with incomplete tasks does NOT appear in completable', () => {
    const dir = makeTempDir();
    const file = writeSample(dir);
    let graph = readGraph(file);
    graph = applyBatch(graph, [
      { op: 'set_status', id: 'leaf', status: 'complete' },
      { op: 'set_status', id: 'child-b', status: 'started' },
      { op: 'set_status', id: 'root', status: 'reviewing' },
    ]);
    writeGraph(file, graph);
    const reloaded = readGraph(file);
    const result = getActionableTasks(reloaded);
    expect(result.completable.map((t) => t.id)).not.toContain('root');
  });

  it('reviewing root with unexpanded ref does NOT appear in completable', () => {
    const vine = `vine 1.1.0\n---\n[root] Root Task (reviewing)\n-> leaf\n-> sub\n---\n[leaf] Leaf Task (complete)\n---\nref [sub] Sub Ref (./sub.vine)\n`;
    const graph = parse(vine);
    const updated = applyBatch(graph, []);
    const result = getActionableTasks(updated);
    expect(result.completable.map((t) => t.id)).not.toContain('root');
  });
});

// ---------------------------------------------------------------------------
// vine_next edge cases
// ---------------------------------------------------------------------------

describe('vine_next edge cases', () => {
  it('all tasks complete: ready/completable/blocked are empty', () => {
    const vine = `vine 1.0.0\n---\n[root] Root (complete)\nDone.\n-> leaf\n---\n[leaf] Leaf (complete)\nDone.\n`;
    const graph = parse(vine);
    const result = getActionableTasks(graph);
    expect(result.ready).toEqual([]);
    expect(result.completable).toEqual([]);
    expect(result.blocked).toEqual([]);
    expect(result.progress.percentage).toBe(100);
    expect(result.progress.rootStatus).toBe('complete');
  });

  it('single notstarted task is ready', () => {
    const vine = `vine 1.0.0\n---\n[root] Root (notstarted)\nA task.\n`;
    const graph = parse(vine);
    const result = getActionableTasks(graph);
    expect(result.ready.length).toBe(1);
    expect(result.ready[0]!.id).toBe('root');
  });

  it('started task is not in ready or completable', () => {
    const vine = `vine 1.0.0\n---\n[root] Root (started)\nWorking.\n-> leaf\n---\n[leaf] Leaf (complete)\nDone.\n`;
    const graph = parse(vine);
    const result = getActionableTasks(graph);
    expect(result.ready).toEqual([]);
    expect(result.completable).toEqual([]);
  });

  it('planning task with satisfied deps is ready', () => {
    const vine = `vine 1.0.0\n---\n[root] Root (planning)\nPlanning.\n`;
    const graph = parse(vine);
    const result = getActionableTasks(graph);
    expect(result.ready.length).toBe(1);
  });

  it('blocked task with unsatisfied deps is NOT in blocked list', () => {
    const vine = `vine 1.0.0\n---\n[root] Root (started)\n-> blocker\n---\n[blocker] Blocker (blocked)\n-> dep\n---\n[dep] Dep (notstarted)\nNot done yet.\n`;
    const graph = parse(vine);
    const result = getActionableTasks(graph);
    expect(result.blocked.map((t) => t.id)).not.toContain('blocker');
  });

  it('multiple ref nodes on frontier all appear in expandable', () => {
    const vine = `vine 1.1.0\n---\n[root] Root (notstarted)\n-> ref1\n-> ref2\n---\nref [ref1] Ref One (./one.vine)\n---\nref [ref2] Ref Two (./two.vine)\n`;
    const graph = parse(vine);
    const result = getActionableTasks(graph);
    expect(result.expandable.length).toBe(2);
    expect(result.expandable.map((r) => r.id).sort()).toEqual(['ref1', 'ref2']);
  });

  it('reviewing leaf without started dependant is NOT completable', () => {
    const vine = `vine 1.0.0\n---\n[root] Root (notstarted)\n-> leaf\n---\n[leaf] Leaf (reviewing)\nDone.\n`;
    const graph = parse(vine);
    const result = getActionableTasks(graph);
    expect(result.completable.map((t) => t.id)).not.toContain('leaf');
    expect(result.ready.map((t) => t.id)).toContain('root');
  });

  it('blocked task with all deps satisfied appears in blocked list', () => {
    const vine = `vine 1.0.0\n---\n[root] Root (started)\n-> blocker\n---\n[blocker] Blocker (blocked)\nStuck.\n`;
    const graph = parse(vine);
    const result = getActionableTasks(graph);
    expect(result.blocked.map((t) => t.id)).toContain('blocker');
  });

  it('progress.readyCount matches ready array length', () => {
    const vine = `vine 1.0.0\n---\n[root] Root (notstarted)\n-> a\n-> b\n---\n[a] A (notstarted)\n---\n[b] B (notstarted)\n`;
    const graph = parse(vine);
    const result = getActionableTasks(graph);
    expect(result.progress.readyCount).toBe(result.ready.length);
    expect(result.ready.length).toBe(2);
  });

  it('progress.byStatus counts all statuses', () => {
    const graph = parse(readFixture('sample.vine'));
    const result = getActionableTasks(graph);
    expect(result.progress.byStatus).toBeDefined();
    const total = Object.values(result.progress.byStatus).reduce((a, b) => a + b, 0);
    expect(total).toBe(result.progress.total);
  });
});

// ---------------------------------------------------------------------------
// vine_next and vine_expand exhaustive coverage (vine_next portion)
// ---------------------------------------------------------------------------

describe('vine_next and vine_expand exhaustive coverage', () => {
  // =========================================================================
  // vine_next — deeper frontier scenarios
  // =========================================================================

  it('1. diamond dependency: task ready only when ALL deps satisfied', () => {
    const vine = `vine 1.0.0\n---\n[root] Root (notstarted)\n-> left\n-> right\n---\n[left] Left (notstarted)\n-> leaf\n---\n[right] Right (notstarted)\n-> leaf\n---\n[leaf] Leaf (notstarted)\n`;
    const graph = parse(vine);
    const result = getActionableTasks(graph);
    // Only leaf has no deps — it's ready
    expect(result.ready.map((t) => t.id)).toEqual(['leaf']);

    // Complete leaf — left and right become ready, but root needs both
    const g2 = setStatus(graph, 'leaf', 'complete');
    const r2 = getActionableTasks(g2);
    expect(r2.ready.map((t) => t.id).sort()).toEqual(['left', 'right']);
    expect(r2.ready.map((t) => t.id)).not.toContain('root');

    // Complete only left — root still NOT ready (right not satisfied)
    const g3 = setStatus(g2, 'left', 'complete');
    const r3 = getActionableTasks(g3);
    expect(r3.ready.map((t) => t.id)).toEqual(['right']);
    expect(r3.ready.map((t) => t.id)).not.toContain('root');

    // Complete both — root now ready
    const g4 = setStatus(g3, 'right', 'complete');
    const r4 = getActionableTasks(g4);
    expect(r4.ready.map((t) => t.id)).toContain('root');
  });

  it('2. chain: only leaf is ready in a long chain', () => {
    const vine = `vine 1.0.0\n---\n[t1] T1 (notstarted)\n-> t2\n---\n[t2] T2 (notstarted)\n-> t3\n---\n[t3] T3 (notstarted)\n-> t4\n---\n[t4] T4 (notstarted)\n-> t5\n---\n[t5] T5 (notstarted)\n`;
    const graph = parse(vine);
    const result = getActionableTasks(graph);
    expect(result.ready.length).toBe(1);
    expect(result.ready[0]!.id).toBe('t5');
  });

  it('3. partial completion: mix of ready and blocked', () => {
    // Two branches from root: left branch completes, right branch blocked
    const vine = `vine 1.0.0\n---\n[root] Root (notstarted)\n-> left\n-> right\n---\n[left] Left (complete)\n---\n[right] Right (blocked)\n`;
    const graph = parse(vine);
    const result = getActionableTasks(graph);
    // root can't be ready because right is blocked (not satisfied)
    expect(result.ready.map((t) => t.id)).not.toContain('root');
    // right has no deps of its own so it's in blocked with satisfied deps
    expect(result.blocked.map((t) => t.id)).toContain('right');
  });

  it('4. reviewing task with multiple dependants: completable when ANY dependant started', () => {
    const vine = `vine 1.0.0\n---\n[root] Root (notstarted)\n-> mid-a\n-> mid-b\n---\n[mid-a] MidA (notstarted)\n-> leaf\n---\n[mid-b] MidB (started)\n-> leaf\n---\n[leaf] Leaf (reviewing)\n`;
    const graph = parse(vine);
    const result = getActionableTasks(graph);
    // leaf is reviewing, mid-b is started (consuming) → leaf completable
    expect(result.completable.map((t) => t.id)).toContain('leaf');
  });

  it('5. reviewing task: NOT completable when dependant is only planning', () => {
    const vine = `vine 1.0.0\n---\n[root] Root (notstarted)\n-> mid\n---\n[mid] Mid (planning)\n-> leaf\n---\n[leaf] Leaf (reviewing)\n`;
    const graph = parse(vine);
    const result = getActionableTasks(graph);
    // mid is 'planning' which is not a consuming status → leaf NOT completable
    expect(result.completable.map((t) => t.id)).not.toContain('leaf');
    // mid should be ready since leaf is reviewing (satisfies deps)
    expect(result.ready.map((t) => t.id)).toContain('mid');
  });

  it('6. all tasks reviewing except root: root becomes ready', () => {
    const vine = `vine 1.0.0\n---\n[root] Root (notstarted)\n-> a\n-> b\n---\n[a] A (reviewing)\n---\n[b] B (reviewing)\n`;
    const graph = parse(vine);
    const result = getActionableTasks(graph);
    // reviewing satisfies deps, so root is ready
    expect(result.ready.map((t) => t.id)).toContain('root');
    expect(result.ready.length).toBe(1);
  });

  it('7. progress percentage rounds correctly', () => {
    // 1 of 3 complete → 33% (Math.round(1/3 * 100) = 33)
    const vine = `vine 1.0.0\n---\n[root] Root (notstarted)\n-> mid\n---\n[mid] Mid (notstarted)\n-> leaf\n---\n[leaf] Leaf (complete)\n`;
    const graph = parse(vine);
    const result = getActionableTasks(graph);
    expect(result.progress.total).toBe(3);
    expect(result.progress.complete).toBe(1);
    expect(result.progress.percentage).toBe(33);

    // 2 of 3 complete → 67% (Math.round(2/3 * 100) = 67)
    const g2 = setStatus(graph, 'mid', 'complete');
    const r2 = getActionableTasks(g2);
    expect(r2.progress.percentage).toBe(67);
  });

  it('8. progress.rootId and rootStatus reflect actual root', () => {
    const vine = `vine 1.0.0\n---\n[my-root] My Root (planning)\n-> child\n---\n[child] Child (notstarted)\n`;
    const graph = parse(vine);
    const result = getActionableTasks(graph);
    expect(result.progress.rootId).toBe('my-root');
    expect(result.progress.rootStatus).toBe('planning');
  });

  // =========================================================================
  // vine_next — ref node frontier interactions
  // =========================================================================

  it('9. ref node with unsatisfied deps NOT in expandable', () => {
    const vine = `vine 1.1.0\n---\n[root] Root (notstarted)\n-> ext\n---\nref [ext] Ext (./ext.vine)\n-> dep\n---\n[dep] Dep (notstarted)\n`;
    const graph = parse(vine);
    const result = getActionableTasks(graph);
    expect(result.expandable.map((r) => r.id)).not.toContain('ext');
    // dep is the leaf, should be ready
    expect(result.ready.map((t) => t.id)).toContain('dep');
  });

  it('10. ref node with satisfied deps IS in expandable', () => {
    const vine = `vine 1.1.0\n---\n[root] Root (notstarted)\n-> ext\n---\nref [ext] Ext (./ext.vine)\n-> dep\n---\n[dep] Dep (complete)\n`;
    const graph = parse(vine);
    const result = getActionableTasks(graph);
    expect(result.expandable.map((r) => r.id)).toContain('ext');
  });

  it('11. after expansion, newly inlined tasks appear in ready', () => {
    const parentVine = `vine 1.1.0\n---\n[root] Root (notstarted)\n-> ext\n---\nref [ext] Ext (./child.vine)\n`;
    const childVine = `vine 1.0.0\n---\n[cr] Child Root (notstarted)\n-> cl\n---\n[cl] Child Leaf (notstarted)\n`;
    const parentGraph = parse(parentVine);
    const childGraph = parse(childVine);
    const expanded = expandVineRef(parentGraph, 'ext', childGraph);
    const result = getActionableTasks(expanded);
    expect(result.ready.map((t) => t.id)).toContain('ext/cl');
  });

  it('12. expandable count matches needs_expansion length', () => {
    const vine = `vine 1.1.0\n---\n[root] Root (notstarted)\n-> r1\n-> r2\n-> r3\n---\nref [r1] R1 (./a.vine)\n---\nref [r2] R2 (./b.vine)\n---\nref [r3] R3 (./c.vine)\n`;
    const graph = parse(vine);
    const result = getActionableTasks(graph);
    expect(result.expandable.length).toBe(3);
    expect(result.expandable.map((r) => r.id).sort()).toEqual(['r1', 'r2', 'r3']);
  });

  // =========================================================================
  // vine_next — frontier after mutations
  // =========================================================================

  it('21. frontier updates after set_status', () => {
    const vine = `vine 1.0.0\n---\n[root] Root (notstarted)\n-> mid\n---\n[mid] Mid (notstarted)\n-> leaf\n---\n[leaf] Leaf (notstarted)\n`;
    const graph = parse(vine);

    // Initially only leaf is ready
    const r1 = getActionableTasks(graph);
    expect(r1.ready.map((t) => t.id)).toEqual(['leaf']);

    // Set leaf complete → mid becomes ready
    const g2 = setStatus(graph, 'leaf', 'complete');
    const r2 = getActionableTasks(g2);
    expect(r2.ready.map((t) => t.id)).toEqual(['mid']);
    expect(r2.progress.complete).toBe(1);

    // Set mid complete → root becomes ready
    const g3 = setStatus(g2, 'mid', 'complete');
    const r3 = getActionableTasks(g3);
    expect(r3.ready.map((t) => t.id)).toEqual(['root']);
    expect(r3.progress.complete).toBe(2);
  });

  it('22. frontier after task removal', () => {
    // root -> mid -> leaf; remove mid → root now depends on nothing mid provided
    const vine = `vine 1.0.0\n---\n[root] Root (notstarted)\n-> a\n-> b\n---\n[a] A (notstarted)\n---\n[b] B (complete)\n`;
    const graph = parse(vine);

    // Initially: a is ready (no deps), b is complete, root needs both
    const r1 = getActionableTasks(graph);
    expect(r1.ready.map((t) => t.id)).toEqual(['a']);

    // Remove a → root only depends on b which is complete → root becomes ready
    const g2 = removeTask(graph, 'a');
    const r2 = getActionableTasks(g2);
    expect(r2.ready.map((t) => t.id)).toContain('root');
  });

  it('23. frontier with all tasks blocked', () => {
    const vine = `vine 1.0.0\n---\n[root] Root (blocked)\n-> a\n---\n[a] A (blocked)\n-> b\n---\n[b] B (blocked)\n`;
    const graph = parse(vine);
    const result = getActionableTasks(graph);
    // Nothing is ready
    expect(result.ready).toEqual([]);
    expect(result.completable).toEqual([]);
    // Only b has satisfied deps (no deps), so b is in blocked
    // a depends on b (blocked, not satisfied) → a NOT in blocked list
    // root depends on a (blocked, not satisfied) → root NOT in blocked list
    expect(result.blocked.map((t) => t.id)).toEqual(['b']);
  });
});
