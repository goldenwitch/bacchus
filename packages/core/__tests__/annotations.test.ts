import { describe, it, expect } from 'vitest';
import { parse } from '../src/parser.js';
import { serialize } from '../src/serializer.js';
import { VineParseError } from '../src/errors.js';
import { getSpriteUri, EMPTY_ANNOTATIONS } from '../src/types.js';
import type { ConcreteTask, RefTask } from '../src/types.js';

describe('annotations', () => {
  describe('parsing', () => {
    it('parses a single annotation on a task header', () => {
      const input = [
        'vine 1.2.0',
        '---',
        '[root] Root Task (started) @sprite(./sprites/root.svg)',
      ].join('\n');

      const graph = parse(input);
      const root = graph.tasks.get('root')!;
      expect(root.annotations.size).toBe(1);
      expect(root.annotations.get('sprite')).toEqual(['./sprites/root.svg']);
    });

    it('parses multiple annotations on a task header', () => {
      const input = [
        'vine 1.2.0',
        '---',
        '[root] Root Task (planning) @sprite(./s.svg) @priority(high)',
      ].join('\n');

      const graph = parse(input);
      const root = graph.tasks.get('root')!;
      expect(root.annotations.size).toBe(2);
      expect(root.annotations.get('sprite')).toEqual(['./s.svg']);
      expect(root.annotations.get('priority')).toEqual(['high']);
    });

    it('parses annotation with multiple comma-separated values', () => {
      const input = [
        'vine 1.2.0',
        '---',
        '[root] Root Task (started) @tags(ui,frontend,v2)',
      ].join('\n');

      const graph = parse(input);
      const root = graph.tasks.get('root')!;
      expect(root.annotations.get('tags')).toEqual(['ui', 'frontend', 'v2']);
    });

    it('parses annotation on a ref header', () => {
      const input = [
        'vine 1.2.0',
        '---',
        '[root] Root Task (started)',
        '-> ext',
        '---',
        'ref [ext] External (./other.vine) @sprite(./sprites/ext.svg)',
      ].join('\n');

      const graph = parse(input);
      const ext = graph.tasks.get('ext')! as RefTask;
      expect(ext.kind).toBe('ref');
      expect(ext.annotations.get('sprite')).toEqual(['./sprites/ext.svg']);
    });

    it('empty parentheses yields empty array (boolean flag)', () => {
      // @key() with no values should produce key → []
      // This is distinct from @key(val) which produces key → ['val']
      const input = [
        'vine 1.2.0',
        '---',
        '[root] Root Task (started) @flag()',
      ].join('\n');

      const graph = parse(input);
      const root = graph.tasks.get('root')!;
      expect(root.annotations.get('flag')).toEqual([]);
    });

    it('returns empty annotations when header has none', () => {
      const input = 'vine 1.1.0\n---\n[root] Root Task (started)';
      const graph = parse(input);
      const root = graph.tasks.get('root')!;
      expect(root.annotations.size).toBe(0);
    });

    it('parses headers without annotations in v1.0.0 files', () => {
      const input = 'vine 1.0.0\n---\n[root] Root Task (complete)';
      const graph = parse(input);
      const root = graph.tasks.get('root')!;
      expect(root.annotations.size).toBe(0);
    });
  });

  describe('serialization', () => {
    it('serializes a single annotation on a task header', () => {
      const input = [
        'vine 1.2.0',
        '---',
        '[root] Root Task (started) @sprite(./sprites/root.svg)',
      ].join('\n');

      const graph = parse(input);
      const output = serialize(graph);
      expect(output).toContain(
        '[root] Root Task (started) @sprite(./sprites/root.svg)',
      );
    });

    it('serializes annotations in alphabetical key order', () => {
      const input = [
        'vine 1.2.0',
        '---',
        '[root] Root Task (started) @zeta(z) @alpha(a)',
      ].join('\n');

      const graph = parse(input);
      const output = serialize(graph);
      // Alphabetical: @alpha before @zeta
      expect(output).toContain('[root] Root Task (started) @alpha(a) @zeta(z)');
    });

    it('serializes annotation on a ref header', () => {
      const input = [
        'vine 1.2.0',
        '---',
        '[root] Root Task (started)',
        '-> ext',
        '---',
        'ref [ext] External (./other.vine) @sprite(./sprites/ext.svg)',
      ].join('\n');

      const graph = parse(input);
      const output = serialize(graph);
      expect(output).toContain(
        'ref [ext] External (./other.vine) @sprite(./sprites/ext.svg)',
      );
    });

    it('omits annotations when map is empty', () => {
      const input = 'vine 1.0.0\n---\n[root] Root Task (complete)';
      const graph = parse(input);
      const output = serialize(graph);
      expect(output).toContain('[root] Root Task (complete)\n');
      // No trailing space or annotation text
      expect(output).not.toContain('@');
    });
  });

  describe('round-trip', () => {
    it('round-trips annotations on task header', () => {
      const input = [
        'vine 1.2.0',
        '---',
        '[root] Root Task (started) @sprite(./sprites/root.svg)',
      ].join('\n');

      const graph1 = parse(input);
      const serialized = serialize(graph1);
      const graph2 = parse(serialized);

      const root1 = graph1.tasks.get('root')!;
      const root2 = graph2.tasks.get('root')!;
      expect([...root2.annotations.entries()]).toEqual([
        ...root1.annotations.entries(),
      ]);
    });

    it('round-trips multiple annotations with multiple values', () => {
      const input = [
        'vine 1.2.0',
        '---',
        '[root] Root Task (planning) @priority(high) @tags(ui,v2)',
      ].join('\n');

      const graph1 = parse(input);
      const serialized = serialize(graph1);
      const graph2 = parse(serialized);

      const root = graph2.tasks.get('root')!;
      expect(root.annotations.get('priority')).toEqual(['high']);
      expect(root.annotations.get('tags')).toEqual(['ui', 'v2']);
    });

    it('round-trips annotation on ref header', () => {
      const input = [
        'vine 1.2.0',
        '---',
        '[root] Root (started)',
        '-> ext',
        '---',
        'ref [ext] External (./other.vine) @sprite(./sprites/ext.svg)',
      ].join('\n');

      const graph1 = parse(input);
      const serialized = serialize(graph1);
      const graph2 = parse(serialized);

      const ext = graph2.tasks.get('ext')! as RefTask;
      expect(ext.annotations.get('sprite')).toEqual(['./sprites/ext.svg']);
    });
  });

  describe('getSpriteUri', () => {
    it('returns the sprite URI from annotations', () => {
      const input = [
        'vine 1.2.0',
        '---',
        '[root] Root Task (started) @sprite(./sprites/root.svg)',
      ].join('\n');

      const graph = parse(input);
      const root = graph.tasks.get('root')!;
      expect(getSpriteUri(root)).toBe('./sprites/root.svg');
    });

    it('returns undefined when no sprite annotation', () => {
      const input = 'vine 1.1.0\n---\n[root] Root Task (started)';
      const graph = parse(input);
      const root = graph.tasks.get('root')!;
      expect(getSpriteUri(root)).toBeUndefined();
    });

    it('returns sprite URI from a ref node', () => {
      const input = [
        'vine 1.2.0',
        '---',
        '[root] Root (started)',
        '-> ext',
        '---',
        'ref [ext] External (./other.vine) @sprite(./sprites/ext.svg)',
      ].join('\n');

      const graph = parse(input);
      expect(getSpriteUri(graph.tasks.get('ext')!)).toBe('./sprites/ext.svg');
    });
  });
});
