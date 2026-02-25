import { describe, it, expect } from 'vitest';

import {
  parse,
  getTask,
  expandVineRef,
  validate,
} from '@bacchus/core';
import type { ConcreteTask } from '@bacchus/core';

import { readGraph, readFileContent } from '../src/io.js';

import { makeTempDir, useTempDir, readFixture, writeFixture } from './fixtures/helpers.js';

useTempDir();

describe('expansion edge cases', () => {
  it('expandVineRef on non-ref node throws', () => {
    const graph = parse(readFixture('sample.vine'));
    const childGraph = parse(`vine 1.0.0\n---\n[child-root] Child (notstarted)\n`);
    expect(() => expandVineRef(graph, 'leaf', childGraph)).toThrow();
  });

  it('expandVineRef on nonexistent ref throws', () => {
    const graph = parse(readFixture('sample.vine'));
    const childGraph = parse(`vine 1.0.0\n---\n[child-root] Child (notstarted)\n`);
    expect(() => expandVineRef(graph, 'no-such-ref', childGraph)).toThrow();
  });

  it('expanded ref replaces ref node with concrete tasks', () => {
    const dir = makeTempDir();
    const parentFile = writeFixture(dir, 'ref-parent.vine', 'parent.vine');
    const childFile = writeFixture(dir, 'ref-child.vine', 'child.vine');

    const parentGraph = readGraph(parentFile);
    const childContent = readFileContent(childFile);
    const childGraph = parse(childContent);
    const expanded = expandVineRef(parentGraph, 'ext-ref', childGraph);

    const task = getTask(expanded, 'ext-ref');
    expect(task.kind).toBe('task');
    expect(expanded.tasks.has('ext-ref/child-leaf')).toBe(true);
    expect(expanded.tasks.has('child-a')).toBe(true);
    expect(expanded.tasks.has('leaf')).toBe(true);
  });
});

describe('vine_expand exhaustive coverage', () => {
  it('expand preserves parent other tasks unchanged', () => {
    const parentVine = `vine 1.1.0\n---\n[root] Root (started)\n-> sibling\n-> ext\n---\n[sibling] Sibling (notstarted)\nSibling description.\n---\nref [ext] Ext (./child.vine)\n`;
    const childVine = `vine 1.0.0\n---\n[cr] Child Root (notstarted)\n`;
    const parentGraph = parse(parentVine);
    const childGraph = parse(childVine);
    const expanded = expandVineRef(parentGraph, 'ext', childGraph);

    const sibling = getTask(expanded, 'sibling') as ConcreteTask;
    expect(sibling.kind).toBe('task');
    expect(sibling.shortName).toBe('Sibling');
    expect(sibling.status).toBe('notstarted');
    expect(sibling.description).toBe('Sibling description.');
    const root = getTask(expanded, 'root') as ConcreteTask;
    expect(root.status).toBe('started');
  });

  it('expand with child that has its own dependency chain', () => {
    const parentVine = `vine 1.1.0\n---\n[root] Root (started)\n-> ext\n---\nref [ext] Ext (./child.vine)\n`;
    const childVine = `vine 1.0.0\n---\n[cr] CRoot (notstarted)\n-> cm\n---\n[cm] CMid (notstarted)\n-> cl\n---\n[cl] CLeaf (notstarted)\n`;
    const parentGraph = parse(parentVine);
    const childGraph = parse(childVine);
    const expanded = expandVineRef(parentGraph, 'ext', childGraph);

    expect(expanded.tasks.has('ext')).toBe(true);
    expect(expanded.tasks.has('ext/cm')).toBe(true);
    expect(expanded.tasks.has('ext/cl')).toBe(true);
    const extTask = getTask(expanded, 'ext');
    expect(extTask.dependencies).toContain('ext/cm');
    const midTask = getTask(expanded, 'ext/cm');
    expect(midTask.dependencies).toContain('ext/cl');
  });

  it('expand sets child root to child root status (not parent ref status)', () => {
    const parentVine = `vine 1.1.0\n---\n[root] Root (started)\n-> ext\n---\nref [ext] Ext (./child.vine)\n`;
    const childVine = `vine 1.0.0\n---\n[cr] Child Root (notstarted)\n`;
    const parentGraph = parse(parentVine);
    const childGraph = parse(childVine);
    const expanded = expandVineRef(parentGraph, 'ext', childGraph);

    const extTask = getTask(expanded, 'ext') as ConcreteTask;
    expect(extTask.kind).toBe('task');
    expect(extTask.status).toBe('notstarted');
  });

  it('expanded child tasks get prefixed IDs', () => {
    const parentVine = `vine 1.1.0\n---\n[root] Root (started)\n-> my-ref\n---\nref [my-ref] My Ref (./child.vine)\n`;
    const childVine = `vine 1.0.0\n---\n[child-root] Child Root (notstarted)\n-> child-leaf\n---\n[child-leaf] Child Leaf (notstarted)\n`;
    const parentGraph = parse(parentVine);
    const childGraph = parse(childVine);
    const expanded = expandVineRef(parentGraph, 'my-ref', childGraph);

    expect(expanded.tasks.has('my-ref')).toBe(true);
    expect(expanded.tasks.has('my-ref/child-leaf')).toBe(true);
    expect(expanded.tasks.has('child-root')).toBe(false);
    expect(expanded.tasks.has('child-leaf')).toBe(false);
  });

  it('expand transfers ref node dependencies to expanded root', () => {
    const parentVine = `vine 1.1.0\n---\n[root] Root (started)\n-> ext\n---\nref [ext] Ext (./child.vine)\n-> dep\n---\n[dep] Dep (complete)\n`;
    const childVine = `vine 1.0.0\n---\n[cr] CRoot (notstarted)\n-> cl\n---\n[cl] CLeaf (notstarted)\n`;
    const parentGraph = parse(parentVine);
    const childGraph = parse(childVine);
    const expanded = expandVineRef(parentGraph, 'ext', childGraph);

    const extTask = getTask(expanded, 'ext');
    expect(extTask.dependencies).toContain('ext/cl');
    expect(extTask.dependencies).toContain('dep');
  });

  it('double expansion (two refs, expand both)', () => {
    const parentVine = `vine 1.1.0\n---\n[root] Root (started)\n-> ref-a\n-> ref-b\n---\nref [ref-a] Ref A (./a.vine)\n---\nref [ref-b] Ref B (./b.vine)\n`;
    const childA = `vine 1.0.0\n---\n[ar] A Root (notstarted)\n-> al\n---\n[al] A Leaf (notstarted)\n`;
    const childB = `vine 1.0.0\n---\n[br] B Root (notstarted)\n`;
    const parentGraph = parse(parentVine);

    const afterFirst = expandVineRef(parentGraph, 'ref-a', parse(childA));
    expect(afterFirst.tasks.has('ref-a')).toBe(true);
    expect(afterFirst.tasks.has('ref-a/al')).toBe(true);
    expect(getTask(afterFirst, 'ref-b').kind).toBe('ref');

    const afterBoth = expandVineRef(afterFirst, 'ref-b', parse(childB));
    expect(getTask(afterBoth, 'ref-b').kind).toBe('task');
    expect(afterBoth.tasks.has('root')).toBe(true);
    expect(afterBoth.tasks.has('ref-a')).toBe(true);
    expect(afterBoth.tasks.has('ref-a/al')).toBe(true);
    expect(afterBoth.tasks.has('ref-b')).toBe(true);
    expect(afterBoth.tasks.size).toBe(4);
  });

  it('expand then validate', () => {
    const parentVine = `vine 1.1.0\n---\n[root] Root (started)\n-> ext\n---\nref [ext] Ext (./child.vine)\n`;
    const childVine = `vine 1.0.0\n---\n[cr] Child Root (notstarted)\n-> cl\n---\n[cl] Child Leaf (notstarted)\n`;
    const parentGraph = parse(parentVine);
    const childGraph = parse(childVine);
    const expanded = expandVineRef(parentGraph, 'ext', childGraph);

    expect(() => validate(expanded)).not.toThrow();
    expect(expanded.order.length).toBe(3);
  });

  it('expand where child graph has decisions', () => {
    const childVine = `vine 1.0.0\n---\n[cr] Child Root (notstarted)\nChild description.\n> Decision one\n> Decision two\n-> cl\n---\n[cl] Child Leaf (notstarted)\n> Leaf decision\n`;
    const parentVine = `vine 1.1.0\n---\n[root] Root (started)\n-> ext\n---\nref [ext] Ext (./child.vine)\n`;
    const parentGraph = parse(parentVine);
    const childGraph = parse(childVine);
    const expanded = expandVineRef(parentGraph, 'ext', childGraph);

    const extTask = getTask(expanded, 'ext') as ConcreteTask;
    expect(extTask.decisions).toContain('Decision one');
    expect(extTask.decisions).toContain('Decision two');

    const leafTask = getTask(expanded, 'ext/cl') as ConcreteTask;
    expect(leafTask.decisions).toContain('Leaf decision');
  });
});
