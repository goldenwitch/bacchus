import { describe, it, expect } from 'vitest';
import { serialize } from '../src/serializer.js';
import { parse } from '../src/parser.js';
import { VineError } from '../src/errors.js';
import type { VineGraph } from '../src/types.js';
import { VINE_EXAMPLE } from './fixtures/vine-example.js';

describe('serialize', () => {
  it('serializes the VINE.md example graph', () => {
    const graph = parse(VINE_EXAMPLE);
    const output = serialize(graph);

    const expected = VINE_EXAMPLE + '\n';
    expect(output).toBe(expected);
  });

  it('field ordering: description before deps before decisions', () => {
    const input = [
      '[leaf] Leaf Task (complete)',
      '',
      '[task-a] Task A (started)',
      'Some description text.',
      '-> leaf',
      '> Decision one.',
      '> Decision two.',
    ].join('\n');

    const graph = parse(input);
    const output = serialize(graph);

    const lines = output.split('\n');
    const descIdx = lines.indexOf('Some description text.');
    const depIdx = lines.indexOf('-> leaf');
    const decIdx = lines.indexOf('> Decision one.');

    expect(descIdx).toBeGreaterThan(-1);
    expect(depIdx).toBeGreaterThan(descIdx);
    expect(decIdx).toBeGreaterThan(depIdx);
  });

  it('separates blocks with a single blank line', () => {
    const graph = parse(VINE_EXAMPLE);
    const output = serialize(graph);

    // Blocks are separated by exactly one blank line (\n\n between blocks).
    expect(output).toContain('\n\n');
    // No triple newlines (which would mean double blank lines).
    expect(output).not.toContain('\n\n\n');
  });

  it('ends with trailing newline', () => {
    const graph = parse(VINE_EXAMPLE);
    const output = serialize(graph);

    expect(output.endsWith('\n')).toBe(true);
    expect(output.endsWith('\n\n')).toBe(false);
  });

  it('omits description line when empty', () => {
    const input = '[root] Root Task (complete)';
    const graph = parse(input);
    const output = serialize(graph);

    // Should be just the header + trailing newline, no blank description line.
    expect(output).toBe('[root] Root Task (complete)\n');
  });

  it('throws VineError when order references a missing task', () => {
    const graph: VineGraph = {
      tasks: new Map(),
      order: ['ghost'],
    };

    expect(() => serialize(graph)).toThrow(VineError);
  });
});
