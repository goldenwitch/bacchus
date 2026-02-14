import { describe, it, expect } from 'vitest';
import { parse } from '../src/parser.js';
import { VineParseError, VineValidationError } from '../src/errors.js';

describe('parse', () => {
  it('parses the VINE.md example correctly', () => {
    const input = [
      '[vine-format] Define VINE Format (complete)',
      'Specify the .vine file format.',
      '> Keep it line-oriented, no nesting.',
      '',
      '[vine-ts] VINE TypeScript Library (started)',
      'Parse and validate .vine files.',
      '-> vine-format',
      '',
      '[build-ui] Build Graph Visualizer (notstarted)',
      'Render the task graph with d3-force.',
      '-> vine-ts',
      '',
      '[graph-cli] Graph Interface (planning)',
      'CLI for pulling, creating, and updating work.',
      '-> vine-ts',
      '-> build-ui',
      '',
      '[root] Project Bacchus (started)',
      'Build a graph of tasks and visualize them as a vine.',
      '-> vine-format',
      '-> vine-ts',
      '-> build-ui',
      '-> graph-cli',
    ].join('\n');

    const graph = parse(input);

    expect(graph.tasks.size).toBe(5);
    expect(graph.order).toEqual([
      'vine-format',
      'vine-ts',
      'build-ui',
      'graph-cli',
      'root',
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

    const vineTs = graph.tasks.get('vine-ts');
    expect(vineTs).toBeDefined();
    expect(vineTs!.dependencies).toEqual(['vine-format']);

    const root = graph.tasks.get('root');
    expect(root).toBeDefined();
    expect(root!.dependencies).toEqual([
      'vine-format',
      'vine-ts',
      'build-ui',
      'graph-cli',
    ]);
  });

  it('throws VineParseError on malformed header', () => {
    const input = '[bad header line\nsome body';

    try {
      parse(input);
      expect.unreachable('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(VineParseError);
      expect((e as VineParseError).line).toBe(1);
    }
  });

  it('throws VineParseError on unknown status keyword', () => {
    const input = '[task-1] My Task (unknown)';

    expect(() => parse(input)).toThrow(VineParseError);
  });

  it('throws VineParseError on duplicate ids', () => {
    const input = [
      '[task-1] First (complete)',
      '',
      '[task-1] Duplicate (started)',
      '-> First',
    ].join('\n');

    expect(() => parse(input)).toThrow(VineParseError);
  });

  it('throws VineParseError on empty input', () => {
    try {
      parse('');
      expect.unreachable('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(VineParseError);
      expect((e as VineParseError).line).toBe(1);
    }
  });

  it('throws VineParseError on whitespace-only input', () => {
    expect(() => parse('   \n  \n   ')).toThrow(VineParseError);
  });

  it('handles leading and trailing whitespace', () => {
    const input = '\n\n[only-task] Only Task (complete)\n\n';

    const graph = parse(input);

    expect(graph.tasks.size).toBe(1);
  });

  it('handles multiple consecutive blank lines', () => {
    const input = [
      '[task-a] Task A (complete)',
      '',
      '',
      '',
      '[task-b] Task B (started)',
      '-> task-a',
    ].join('\n');

    const graph = parse(input);

    expect(graph.tasks.size).toBe(2);
  });

  it('concatenates multi-line descriptions', () => {
    const input = [
      '[task-1] Task (complete)',
      'Line one of description.',
      'Line two of description.',
    ].join('\n');

    const graph = parse(input);
    const task = graph.tasks.get('task-1');

    expect(task).toBeDefined();
    expect(task!.description).toBe(
      'Line one of description. Line two of description.',
    );
  });

  it('treats whitespace-only body lines as block separators', () => {
    const input =
      '[task-a] Task A (complete)\n   \n[task-b] Task B (started)\n-> task-a';

    const graph = parse(input);

    expect(graph.tasks.size).toBe(2);
  });

  it('throws VineValidationError for missing dependency ref', () => {
    const input = ['[task-1] Task (started)', '-> nonexistent'].join('\n');

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
