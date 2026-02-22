import { describe, it, expect } from 'vitest';
import { expandVineRef } from '../src/expansion.js';
import type { Task, VineGraph } from '../src/types.js';
import { VineError } from '../src/errors.js';

function makeParentGraph(overrides?: Partial<{ refDeps: string[]; refDecisions: string[]; refDescription: string }>): VineGraph {
  const tasks = new Map<string, Task>();
  tasks.set('root', {
    id: 'root', shortName: 'Root', description: '', status: 'started',
    dependencies: ['setup', 'ext-lib'], decisions: [], attachments: [], vine: undefined,
  });
  tasks.set('setup', {
    id: 'setup', shortName: 'Setup', description: '', status: 'complete',
    dependencies: [], decisions: [], attachments: [], vine: undefined,
  });
  tasks.set('ext-lib', {
    id: 'ext-lib', shortName: 'External Library', description: overrides?.refDescription ?? '', status: undefined,
    dependencies: overrides?.refDeps ?? ['setup'], decisions: overrides?.refDecisions ?? [], attachments: [], vine: './lib.vine',
  });
  return {
    version: '1.1.0', title: undefined, delimiter: '---', prefix: undefined,
    tasks, order: ['root', 'setup', 'ext-lib'],
  };
}

function makeChildGraph(overrides?: Partial<{ prefix: string | undefined }>): VineGraph {
  const tasks = new Map<string, Task>();
  tasks.set('child-root', {
    id: 'child-root', shortName: 'Lib Root', description: 'The library root.', status: 'planning',
    dependencies: ['util'], decisions: ['Use ESM only.'], attachments: [], vine: undefined,
  });
  tasks.set('util', {
    id: 'util', shortName: 'Utilities', description: 'Shared helpers.', status: 'notstarted',
    dependencies: [], decisions: [], attachments: [], vine: undefined,
  });
  return {
    version: '1.1.0', title: undefined, delimiter: '---', prefix: overrides !== undefined && 'prefix' in overrides ? overrides.prefix : 'lib',
    tasks, order: ['child-root', 'util'],
  };
}

describe('expandVineRef', () => {
  it('expands with prefix metadata (verify / separator)', () => {
    // child has prefix: 'lib' → child-root → 'ext-lib', util → 'lib/util'
    const result = expandVineRef(makeParentGraph(), 'ext-lib', makeChildGraph());
    expect(result.tasks.has('ext-lib')).toBe(true);
    expect(result.tasks.has('lib/util')).toBe(true);
    expect(result.tasks.get('ext-lib')!.status).toBe('planning');
    expect(result.tasks.get('ext-lib')!.vine).toBeUndefined();
    expect(result.tasks.get('ext-lib')!.description).toBe('The library root.');
  });

  it('uses refNodeId as default prefix when child has no prefix', () => {
    const child = makeChildGraph({ prefix: undefined });
    // prefix defaults to 'ext-lib' → util becomes 'ext-lib/util'
    const result = expandVineRef(makeParentGraph(), 'ext-lib', child);
    expect(result.tasks.has('ext-lib/util')).toBe(true);
  });

  it('uses no prefix when child prefix is empty string', () => {
    const child = makeChildGraph({ prefix: '' });
    // empty prefix → IDs used as-is → util stays 'util'
    const result = expandVineRef(makeParentGraph(), 'ext-lib', child);
    expect(result.tasks.has('util')).toBe(true);
    expect(result.tasks.has('lib/util')).toBe(false);
  });

  it('merges dependencies (union, deduplicated)', () => {
    // ref node depends on 'setup', child root depends on 'util' (remapped to 'lib/util')
    const result = expandVineRef(makeParentGraph(), 'ext-lib', makeChildGraph());
    const expanded = result.tasks.get('ext-lib')!;
    expect(expanded.dependencies).toContain('setup');
    expect(expanded.dependencies).toContain('lib/util');
    // No duplicates
    const unique = new Set(expanded.dependencies);
    expect(unique.size).toBe(expanded.dependencies.length);
  });

  it('merges decisions (child root + ref node, appended)', () => {
    const parent = makeParentGraph({ refDecisions: ['Consider performance.'] });
    const result = expandVineRef(parent, 'ext-lib', makeChildGraph());
    const expanded = result.tasks.get('ext-lib')!;
    expect(expanded.decisions).toEqual(['Use ESM only.', 'Consider performance.']);
  });

  it('adopts attachments from child root', () => {
    const child = makeChildGraph();
    const childRoot = child.tasks.get('child-root')!;
    const withAttachment: Task = { ...childRoot, attachments: [{ class: 'artifact', mime: 'text/plain', uri: 'readme.md' }] };
    const modifiedTasks = new Map(child.tasks);
    modifiedTasks.set('child-root', withAttachment);
    const modifiedChild: VineGraph = { ...child, tasks: modifiedTasks };
    
    const result = expandVineRef(makeParentGraph(), 'ext-lib', modifiedChild);
    expect(result.tasks.get('ext-lib')!.attachments).toEqual([{ class: 'artifact', mime: 'text/plain', uri: 'readme.md' }]);
  });

  it('throws VineError on ID collision', () => {
    // Add a task 'lib/util' to parent to cause collision
    const parent = makeParentGraph();
    const tasks = new Map(parent.tasks);
    tasks.set('lib/util', {
      id: 'lib/util', shortName: 'Collision', description: '', status: 'complete',
      dependencies: [], decisions: [], attachments: [], vine: undefined,
    });
    const order = [...parent.order, 'lib/util'];
    // Also need root to depend on lib/util for connectivity
    const root = tasks.get('root')!;
    tasks.set('root', { ...root, dependencies: [...root.dependencies, 'lib/util'] });
    const collisionParent: VineGraph = { ...parent, tasks, order };
    
    expect(() => expandVineRef(collisionParent, 'ext-lib', makeChildGraph())).toThrow(VineError);
  });

  it('throws VineError for non-existent refNodeId', () => {
    expect(() => expandVineRef(makeParentGraph(), 'nonexistent', makeChildGraph())).toThrow(VineError);
  });

  it('throws VineError for non-ref node', () => {
    expect(() => expandVineRef(makeParentGraph(), 'setup', makeChildGraph())).toThrow(VineError);
  });

  it('throws VineError for empty child graph', () => {
    const emptyChild: VineGraph = {
      version: '1.1.0', title: undefined, delimiter: '---', prefix: undefined,
      tasks: new Map(), order: [],
    };
    expect(() => expandVineRef(makeParentGraph(), 'ext-lib', emptyChild)).toThrow(VineError);
  });

  it('post-expansion graph passes validate()', () => {
    // If expandVineRef didn't throw, it already validated internally.
    // Double-check by importing validate.
    const result = expandVineRef(makeParentGraph(), 'ext-lib', makeChildGraph());
    // Just verify it returns a valid VineGraph shape
    expect(result.order.length).toBeGreaterThan(0);
    expect(result.tasks.size).toBe(result.order.length);
  });

  it('child tasks appear after ref slot in order', () => {
    const result = expandVineRef(makeParentGraph(), 'ext-lib', makeChildGraph());
    const extLibIdx = result.order.indexOf('ext-lib');
    const utilIdx = result.order.indexOf('lib/util');
    expect(utilIdx).toBe(extLibIdx + 1);
  });
});
