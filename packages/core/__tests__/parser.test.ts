import { describe, it, expect } from 'vitest';
import { parse } from '../src/parser.js';
import { VineParseError, VineValidationError } from '../src/errors.js';
import { VINE_EXAMPLE } from './fixtures/vine-example.js';

describe('parse', () => {
  // ── Integration / fixture-based ─────────────────────────────────

  describe('integration', () => {
    it('parses the VINE.md example correctly', () => {
      const graph = parse(VINE_EXAMPLE);

      expect(graph.version).toBe('1.1.0');
      expect(graph.title).toBe('Project Bacchus');
      expect(graph.delimiter).toBe('---');
      expect(graph.tasks.size).toBe(6);
      expect(graph.order).toEqual([
        'root',
        'graph-cli',
        'build-ui',
        'vine-ts',
        'vine-format',
        'docs-site',
      ]);

      const vineFormat = graph.tasks.get('vine-format');
      expect(vineFormat).toBeDefined();
      expect(vineFormat!.id).toBe('vine-format');
      expect(vineFormat!.shortName).toBe('Define VINE Format');
      expect(vineFormat!.status).toBe('complete');
      expect(vineFormat!.description).toBe('Specify the .vine file format.');
      expect(vineFormat!.decisions).toEqual([
        'Keep it line-oriented, no nesting.',
      ]);
      expect(vineFormat!.dependencies).toEqual([]);
      expect(vineFormat!.attachments).toEqual([]);

      const vineTs = graph.tasks.get('vine-ts');
      expect(vineTs).toBeDefined();
      expect(vineTs!.dependencies).toEqual(['vine-format']);

      const root = graph.tasks.get('root');
      expect(root).toBeDefined();
      expect(root!.dependencies).toEqual([
        'build-ui',
        'docs-site',
        'graph-cli',
        'vine-format',
        'vine-ts',
      ]);
    });

    it('parses mixed graph with tasks and refs', () => {
      const input = [
        'vine 1.1.0',
        '---',
        '[root] Root (started)',
        '-> setup',
        '-> ext',
        '---',
        '[setup] Setup (complete)',
        '---',
        'ref [ext] External (./other.vine)',
        '-> setup',
      ].join('\n');

      const graph = parse(input);
      expect(graph.tasks.size).toBe(3);
      expect(graph.tasks.get('setup')!.status).toBe('complete');
      expect(graph.tasks.get('ext')!.vine).toBe('./other.vine');
      expect(graph.tasks.get('ext')!.status).toBeUndefined();
    });

    it('v1.0.0 file parses identically (backward compat)', () => {
      // v1.0.0 files have no refs; parsing them should work the same
      const input = [
        'vine 1.0.0',
        '---',
        '[root] Root (complete)',
        'My description.',
        '-> child',
        '---',
        '[child] Child (started)',
      ].join('\n');

      const graph = parse(input);
      expect(graph.version).toBe('1.0.0');
      expect(graph.tasks.size).toBe(2);
      expect(graph.tasks.get('root')!.vine).toBeUndefined();
    });

    it('throws VineParseError on duplicate ids', () => {
      const input = [
        'vine 1.0.0',
        '---',
        '[task-1] First (complete)',
        '---',
        '[task-1] Duplicate (started)',
      ].join('\n');
      expect(() => parse(input)).toThrow(VineParseError);
    });

    it('throws VineValidationError for missing dependency ref', () => {
      const input = [
        'vine 1.0.0',
        '---',
        '[task-1] Task (started)',
        '-> nonexistent',
      ].join('\n');

      try {
        parse(input);
        expect.unreachable('should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(VineValidationError);
        expect((e as VineValidationError).constraint).toBe(
          'valid-dependency-refs',
        );
      }
    });
  });

  // ── Magic line ──────────────────────────────────────────────────

  describe('magic line', () => {
    it('throws VineParseError on missing magic line', () => {
      try {
        parse('');
        expect.unreachable('should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(VineParseError);
        expect((e as VineParseError).line).toBe(1);
      }
    });

    it('throws VineParseError on invalid magic line', () => {
      const input = 'not a magic line\n---\n[t] T (complete)';
      expect(() => parse(input)).toThrow(VineParseError);
    });

    it('throws VineParseError on whitespace-only input', () => {
      expect(() => parse('   \n  \n   ')).toThrow(VineParseError);
    });
  });

  // ── Preamble ────────────────────────────────────────────────────

  describe('preamble', () => {
    it('throws VineParseError when preamble terminator is missing', () => {
      const input = 'vine 1.0.0\ntitle: Test\n[t] T (complete)';
      expect(() => parse(input)).toThrow(VineParseError);
    });

    it('parses preamble metadata', () => {
      const input = [
        'vine 1.0.0',
        'title: My Project',
        '---',
        '[root] Root (complete)',
      ].join('\n');
      const graph = parse(input);

      expect(graph.version).toBe('1.0.0');
      expect(graph.title).toBe('My Project');
      expect(graph.delimiter).toBe('---');
    });

    it('parses custom delimiter from metadata', () => {
      const input = [
        'vine 1.0.0',
        'delimiter: ===',
        '---',
        '[root] Root (complete)',
        'Root task.',
        '-> child',
        '===',
        '[child] Child (complete)',
      ].join('\n');
      const graph = parse(input);

      expect(graph.delimiter).toBe('===');
      expect(graph.tasks.size).toBe(2);
    });

    it('ignores unknown metadata keys', () => {
      const input = [
        'vine 1.0.0',
        'title: Test',
        'unknown: ignored',
        '---',
        '[root] Root (complete)',
      ].join('\n');
      const graph = parse(input);

      expect(graph.title).toBe('Test');
      expect(graph.tasks.size).toBe(1);
    });

    it('defaults title to undefined when not in preamble', () => {
      const input = 'vine 1.0.0\n---\n[root] Root (complete)';
      const graph = parse(input);

      expect(graph.title).toBeUndefined();
    });

    it('parses prefix metadata', () => {
      const input = [
        'vine 1.1.0',
        'prefix: ds',
        '---',
        '[root] Root (complete)',
      ].join('\n');

      const graph = parse(input);
      expect(graph.prefix).toBe('ds');
    });
  });

  // ── Block splitting ─────────────────────────────────────────────

  describe('block splitting', () => {
    it('splits blocks on --- delimiter (not blank lines)', () => {
      const input = [
        'vine 1.0.0',
        '---',
        '[task-a] Task A (started)',
        '-> task-b',
        '---',
        '[task-b] Task B (complete)',
      ].join('\n');

      const graph = parse(input);
      expect(graph.tasks.size).toBe(2);
    });

    it('discards empty trailing segments from trailing delimiter', () => {
      const input = [
        'vine 1.0.0',
        '---',
        '[root] Root (complete)',
        '---',
      ].join('\n');

      const graph = parse(input);
      expect(graph.tasks.size).toBe(1);
    });

    it('throws VineParseError when no task blocks found', () => {
      const input = 'vine 1.0.0\n---\n';
      expect(() => parse(input)).toThrow(VineParseError);
    });
  });

  // ── Block parsing (task headers, body lines) ────────────────────

  describe('block parsing', () => {
    it('throws VineParseError on malformed header', () => {
      const input = 'vine 1.0.0\n---\n[bad header line\nsome body';

      try {
        parse(input);
        expect.unreachable('should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(VineParseError);
      }
    });

    it('throws VineParseError on unknown status keyword', () => {
      const input = 'vine 1.0.0\n---\n[task-1] My Task (unknown)';
      expect(() => parse(input)).toThrow(VineParseError);
    });

    it('parses the reviewing status', () => {
      const input = 'vine 1.0.0\n---\n[task-1] Task (reviewing)';
      const graph = parse(input);

      expect(graph.tasks.get('task-1')!.status).toBe('reviewing');
    });

    it('parses slash-separated IDs', () => {
      const input = [
        'vine 1.1.0',
        '---',
        '[root] Root (started)',
        '-> ds/components',
        '---',
        '[ds/components] Components (complete)',
      ].join('\n');

      const graph = parse(input);
      expect(graph.tasks.has('ds/components')).toBe(true);
      expect(graph.tasks.get('ds/components')!.shortName).toBe('Components');
    });

    it('joins multi-line descriptions with newline', () => {
      const input = [
        'vine 1.0.0',
        '---',
        '[task-1] Task (complete)',
        'Line one of description.',
        'Line two of description.',
      ].join('\n');

      const graph = parse(input);
      const task = graph.tasks.get('task-1');

      expect(task).toBeDefined();
      expect(task!.description).toBe(
        'Line one of description.\nLine two of description.',
      );
    });

    it('preserves blank lines within a task block as empty description lines', () => {
      const input = [
        'vine 1.0.0',
        '---',
        '[task-1] Task (complete)',
        'First paragraph.',
        '',
        'Second paragraph.',
      ].join('\n');

      const graph = parse(input);
      const task = graph.tasks.get('task-1');

      expect(task).toBeDefined();
      expect(task!.description).toBe('First paragraph.\n\nSecond paragraph.');
    });

    it('parses attachment lines', () => {
      const input = [
        'vine 1.0.0',
        '---',
        '[task-1] Task (complete)',
        'Description.',
        '@artifact application/pdf https://example.com/report.pdf',
        '@guidance text/markdown https://example.com/guide.md',
        '@file image/png https://example.com/sketch.png',
      ].join('\n');

      const graph = parse(input);
      const task = graph.tasks.get('task-1');

      expect(task).toBeDefined();
      expect(task!.attachments).toEqual([
        { class: 'artifact', mime: 'application/pdf', uri: 'https://example.com/report.pdf' },
        { class: 'guidance', mime: 'text/markdown', uri: 'https://example.com/guide.md' },
        { class: 'file', mime: 'image/png', uri: 'https://example.com/sketch.png' },
      ]);
    });

    it('treats unrecognized @ prefix as description text', () => {
      const input = [
        'vine 1.0.0',
        '---',
        '[task-1] Task (complete)',
        '@unknown this is just description text',
      ].join('\n');

      const graph = parse(input);
      const task = graph.tasks.get('task-1');

      expect(task!.description).toBe('@unknown this is just description text');
      expect(task!.attachments).toEqual([]);
    });
  });

  // ── Reference nodes ─────────────────────────────────────────────

  describe('reference nodes', () => {
    it('parses ref [id] Name (URI) as a reference node', () => {
      const input = [
        'vine 1.1.0',
        '---',
        '[root] Root (started)',
        '-> ext',
        '---',
        'ref [ext] External (./other.vine)',
      ].join('\n');

      const graph = parse(input);
      const ext = graph.tasks.get('ext');
      expect(ext).toBeDefined();
      expect(ext!.vine).toBe('./other.vine');
      expect(ext!.status).toBeUndefined();
      expect(ext!.shortName).toBe('External');
      expect(ext!.attachments).toEqual([]);
    });

    it('parses ref block with deps, decisions, and description', () => {
      const input = [
        'vine 1.1.0',
        '---',
        '[root] Root (started)',
        '-> ext',
        '---',
        '[dep] Dep (complete)',
        '---',
        'ref [ext] External Lib (./lib.vine)',
        'Some description of the reference.',
        '-> dep',
        '> Should we use v2?',
      ].join('\n');

      const graph = parse(input);
      const ext = graph.tasks.get('ext');
      expect(ext!.description).toBe('Some description of the reference.');
      expect(ext!.dependencies).toEqual(['dep']);
      expect(ext!.decisions).toEqual(['Should we use v2?']);
    });

    it('rejects attachments on ref blocks', () => {
      const input = [
        'vine 1.1.0',
        '---',
        '[root] Root (started)',
        '-> ext',
        '---',
        'ref [ext] External (./other.vine)',
        '@artifact text/plain readme.txt',
      ].join('\n');

      expect(() => parse(input)).toThrow(VineParseError);
    });
  });
});
