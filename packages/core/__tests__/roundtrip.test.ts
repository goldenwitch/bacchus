import { describe, it, expect } from 'vitest';
import { parse } from '../src/parser.js';
import { serialize } from '../src/serializer.js';
import type { VineGraph } from '../src/types.js';
import { VINE_EXAMPLE } from './fixtures/vine-example.js';

function graphToPlain(graph: VineGraph) {
  return {
    order: [...graph.order],
    tasks: Object.fromEntries(
      [...graph.tasks.entries()].map(([id, task]) => [
        id,
        {
          ...task,
          dependencies: [...task.dependencies],
          decisions: [...task.decisions],
        },
      ]),
    ),
  };
}

describe('round-trip', () => {
  it('round-trips the VINE.md example', () => {
    const graph1 = parse(VINE_EXAMPLE);
    const serialized = serialize(graph1);
    const graph2 = parse(serialized);

    expect(graphToPlain(graph2)).toEqual(graphToPlain(graph1));
  });

  it('round-trips a minimal single-task graph', () => {
    const input = '[root] Root Task (complete)\n';
    const graph1 = parse(input);
    const serialized = serialize(graph1);
    const graph2 = parse(serialized);

    expect(graphToPlain(graph2)).toEqual(graphToPlain(graph1));
  });

  it('round-trips graph with decisions and multi-line descriptions', () => {
    // The VINE.md example has decisions on vine-format and descriptions on all tasks.
    const graph1 = parse(VINE_EXAMPLE);
    const serialized = serialize(graph1);
    const graph2 = parse(serialized);

    expect(graphToPlain(graph2)).toEqual(graphToPlain(graph1));

    // Verify the decision survived the round-trip.
    const vineFormat = graph2.tasks.get('vine-format');
    expect(vineFormat).toBeDefined();
    expect(vineFormat!.decisions).toEqual([
      'Keep it line-oriented, no nesting.',
    ]);
  });

  it('serialize(parse(input)) is idempotent', () => {
    const firstPass = serialize(parse(VINE_EXAMPLE));
    const secondPass = serialize(parse(firstPass));

    expect(secondPass).toBe(firstPass);
  });
});
