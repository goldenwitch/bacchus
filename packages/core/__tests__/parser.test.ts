import { describe, it, expect } from 'vitest';
import { parse } from '../src/parser.js';
import { VineParseError, VineValidationError } from '../src/errors.js';
import { VINE_EXAMPLE } from './fixtures/vine-example.js';

describe('parse', () => {
  // ── Fixture-based tests ───────────────────────────────────────────

  it('parses the VINE.md example correctly', () => {
    const graph = parse(VINE_EXAMPLE);

    expect(graph.version).toBe('1.0.0');
    expect(graph.title).toBe('Project Bacchus');
    expect(graph.delimiter).toBe('---');
    expect(graph.tasks.size).toBe(5);
    expect(graph.order).toEqual([
      'root',
      'graph-cli',
      'build-ui',
      'vine-ts',
      'vine-format',
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
      'graph-cli',
      'vine-format',
      'vine-ts',
    ]);
  });

  // ── Magic line & preamble ─────────────────────────────────────────

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
      'Root task.',      '-> child',      '===',
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

  // ── Error cases ───────────────────────────────────────────────────

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

  it('throws VineParseError on whitespace-only input', () => {
    expect(() => parse('   \n  \n   ')).toThrow(VineParseError);
  });

  it('throws VineParseError when no task blocks found', () => {
    const input = 'vine 1.0.0\n---\n';
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

  // ── Description handling ──────────────────────────────────────────

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

  // ── Delimiter handling ────────────────────────────────────────────

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

  // ── Attachment parsing ────────────────────────────────────────────

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

  // ── Status keywords ───────────────────────────────────────────────

  it('parses the reviewing status', () => {
    const input = 'vine 1.0.0\n---\n[task-1] Task (reviewing)';
    const graph = parse(input);

    expect(graph.tasks.get('task-1')!.status).toBe('reviewing');
  });
});
