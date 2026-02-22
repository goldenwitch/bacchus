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

  it('field ordering: description before deps before decisions before attachments', () => {
    const input = [
      'vine 1.0.0',
      '---',
      '[task-a] Task A (started)',
      'Some description text.',
      '-> leaf',
      '> Decision one.',
      '> Decision two.',
      '@artifact text/html https://example.com/demo.html',
      '---',
      '[leaf] Leaf Task (complete)',
    ].join('\n');

    const graph = parse(input);
    const output = serialize(graph);

    const lines = output.split('\n');
    const descIdx = lines.indexOf('Some description text.');
    const depIdx = lines.indexOf('-> leaf');
    const decIdx = lines.indexOf('> Decision one.');
    const attIdx = lines.indexOf('@artifact text/html https://example.com/demo.html');

    expect(descIdx).toBeGreaterThan(-1);
    expect(depIdx).toBeGreaterThan(descIdx);
    expect(decIdx).toBeGreaterThan(depIdx);
    expect(attIdx).toBeGreaterThan(decIdx);
  });

  it('separates blocks with delimiter line', () => {
    const graph = parse(VINE_EXAMPLE);
    const output = serialize(graph);

    // Blocks separated by the delimiter (---), not blank lines
    expect(output).toContain('\n---\n');
  });

  it('emits preamble with magic line and terminator', () => {
    const graph = parse(VINE_EXAMPLE);
    const output = serialize(graph);

    expect(output.startsWith('vine 1.1.0\n')).toBe(true);
    // Preamble includes title metadata
    expect(output).toContain('title: Project Bacchus\n');
  });

  it('ends with trailing newline', () => {
    const graph = parse(VINE_EXAMPLE);
    const output = serialize(graph);

    expect(output.endsWith('\n')).toBe(true);
    // No trailing delimiter — last line ends the final task block
    expect(output.endsWith('---\n')).toBe(false);
  });

  it('omits description line when empty', () => {
    const input = 'vine 1.0.0\n---\n[root] Root Task (complete)';
    const graph = parse(input);
    const output = serialize(graph);

    expect(output).toBe('vine 1.0.0\n---\n[root] Root Task (complete)\n');
  });

  it('sorts dependencies alphabetically', () => {
    const input = [
      'vine 1.0.0',
      '---',
      '[root] Root (started)',
      '-> charlie',
      '-> alpha',
      '-> bravo',
      '---',
      '[alpha] Alpha (complete)',
      '---',
      '[bravo] Bravo (complete)',
      '---',
      '[charlie] Charlie (complete)',
    ].join('\n');

    const graph = parse(input);
    const output = serialize(graph);
    const lines = output.split('\n');

    const alphaIdx = lines.indexOf('-> alpha');
    const bravoIdx = lines.indexOf('-> bravo');
    const charlieIdx = lines.indexOf('-> charlie');

    expect(alphaIdx).toBeGreaterThan(-1);
    expect(bravoIdx).toBeGreaterThan(alphaIdx);
    expect(charlieIdx).toBeGreaterThan(bravoIdx);
  });

  it('groups attachments by class: artifact → guidance → file', () => {
    const input = [
      'vine 1.0.0',
      '---',
      '[root] Root (complete)',
      '@file image/png https://example.com/a.png',
      '@artifact text/html https://example.com/b.html',
      '@guidance text/markdown https://example.com/c.md',
    ].join('\n');

    const graph = parse(input);
    const output = serialize(graph);
    const lines = output.split('\n');

    const artifactIdx = lines.findIndex((l) => l.startsWith('@artifact'));
    const guidanceIdx = lines.findIndex((l) => l.startsWith('@guidance'));
    const fileIdx = lines.findIndex((l) => l.startsWith('@file'));

    expect(artifactIdx).toBeGreaterThan(-1);
    expect(guidanceIdx).toBeGreaterThan(artifactIdx);
    expect(fileIdx).toBeGreaterThan(guidanceIdx);
  });

  it('emits multi-line descriptions as separate lines', () => {
    const input = [
      'vine 1.0.0',
      '---',
      '[root] Root (complete)',
      'First line.',
      '',
      'Third line.',
    ].join('\n');

    const graph = parse(input);
    const output = serialize(graph);

    expect(output).toContain('First line.\n\nThird line.');
  });

  it('emits custom delimiter in metadata and between blocks', () => {
    const input = [
      'vine 1.0.0',
      'delimiter: ===',
      '---',
      '[root] Root (started)',
      '-> child',
      '===',
      '[child] Child (complete)',
    ].join('\n');

    const graph = parse(input);
    const output = serialize(graph);

    expect(output).toContain('delimiter: ===\n');
    expect(output).toContain('\n===\n');
  });

  it('omits delimiter metadata when it is the default ---', () => {
    const input = 'vine 1.0.0\n---\n[root] Root (complete)';
    const graph = parse(input);
    const output = serialize(graph);

    expect(output).not.toContain('delimiter:');
  });

  it('serializes ref node with header format: ref [id] Name (URI)', () => {
    const input = [
      'vine 1.1.0',
      '---',
      '[root] Root (started)',
      '-> ext',
      '---',
      'ref [ext] External (./other.vine)',
    ].join('\n');

    const graph = parse(input);
    const output = serialize(graph);

    expect(output).toContain('ref [ext] External (./other.vine)');
    // URI should NOT appear as a separate body line
    const lines = output.split('\n');
    const headerIdx = lines.findIndex((l) => l.startsWith('ref ['));
    expect(lines[headerIdx + 1] ?? '').not.toBe('./other.vine');
  });

  it('emits prefix in preamble metadata', () => {
    const input = [
      'vine 1.1.0',
      'prefix: ds',
      '---',
      '[root] Root (complete)',
    ].join('\n');

    const graph = parse(input);
    const output = serialize(graph);

    expect(output).toContain('prefix: ds\n');
  });

  it('round-trips ref node with deps and decisions', () => {
    const input = [
      'vine 1.1.0',
      '---',
      '[root] Root (started)',
      '-> ext',
      '---',
      '[dep] Dep (complete)',
      '---',
      'ref [ext] External (./lib.vine)',
      'A reference to the library.',
      '-> dep',
      '> Use v2 or v3?',
    ].join('\n');

    const graph = parse(input);
    const output = serialize(graph);
    const reparsed = parse(output);

    const ext = reparsed.tasks.get('ext');
    expect(ext!.vine).toBe('./lib.vine');
    expect(ext!.description).toBe('A reference to the library.');
    expect(ext!.dependencies).toEqual(['dep']);
    expect(ext!.decisions).toEqual(['Use v2 or v3?']);
  });

  it('throws VineError when order references a missing task', () => {
    const graph: VineGraph = {
      version: '1.0.0',
      title: undefined,
      delimiter: '---',
      prefix: undefined,
      tasks: new Map(),
      order: ['ghost'],
    };

    expect(() => serialize(graph)).toThrow(VineError);
  });
});
