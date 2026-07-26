import { describe, it, expect } from 'vitest';
import { parse } from '../src/parser.js';
import { serialize } from '../src/serializer.js';
import { setStatus, applyBatch } from '../src/mutations.js';
import {
  getActionableTasks,
  buildSatisfaction,
  getSummary,
} from '../src/search.js';
import { isConnective } from '../src/types.js';
import type { ConnectiveNode } from '../src/types.js';
import { VineParseError, VineValidationError } from '../src/errors.js';

// ---------------------------------------------------------------------------
// The canonical #22 deferral graph:
//
//   gap-memory becomes actionable when the FIRST of two external triggers
//   lands (disjunction), expressed with an `anyof` connective — no polling
//   judgment task, and `blocked` keeps its "needs intervention" meaning.
// ---------------------------------------------------------------------------
const DEFERRAL = [
  'vine 1.3.0',
  'title: Long-horizon research graph',
  '---',
  '[root] Dog build graph (started)',
  '-> gap-memory',
  '---',
  '[gap-memory] Belief beyond the 7-frame window (notstarted)',
  'The sized capability gap.',
  '-> memory-trigger',
  '---',
  'anyof [memory-trigger] First relevant regime signal',
  'Fires on whichever upstream lands first.',
  '-> r4-scoping',
  '-> spirit-2-intake',
  '---',
  '[r4-scoping] r4 stable-noise scoping (notstarted)',
  '---',
  '[spirit-2-intake] Second spirit intake (notstarted)',
].join('\n');

describe('parsing connective nodes', () => {
  it('parses an anyof node with dependencies and description', () => {
    const graph = parse(DEFERRAL);
    const trigger = graph.tasks.get('memory-trigger');
    expect(trigger).toBeDefined();
    expect(trigger?.kind).toBe('anyof');
    expect(isConnective(trigger!)).toBe(true);
    expect(trigger?.dependencies).toEqual(['r4-scoping', 'spirit-2-intake']);
    expect(trigger?.description).toBe('Fires on whichever upstream lands first.');
    // Connectives carry no status field.
    expect('status' in (trigger as object)).toBe(false);
  });

  it('parses an allof node', () => {
    const graph = parse(
      [
        'vine 1.3.0',
        '---',
        '[root] Root (started)',
        '-> gate',
        '---',
        'allof [gate] Everything ready',
        '-> a',
        '-> b',
        '---',
        '[a] A (complete)',
        '---',
        '[b] B (complete)',
      ].join('\n'),
    );
    expect(graph.tasks.get('gate')?.kind).toBe('allof');
  });

  it('rejects attachments on a connective node', () => {
    const text = [
      'vine 1.3.0',
      '---',
      '[root] Root (started)',
      '-> c',
      '---',
      'anyof [c] Signal',
      '-> a',
      '@file text/plain https://example.com/x.txt',
      '---',
      '[a] A (complete)',
    ].join('\n');
    expect(() => parse(text)).toThrow(VineParseError);
    expect(() => parse(text)).toThrow(/Attachments are not allowed on connective/);
  });
});

describe('serializing connective nodes', () => {
  it('round-trips a graph containing connectives', () => {
    const graph = parse(DEFERRAL);
    const reparsed = parse(serialize(graph));
    expect(serialize(reparsed)).toBe(serialize(graph));
  });

  it('emits the `anyof`/`allof` keyword header with no status paren', () => {
    const out = serialize(parse(DEFERRAL));
    expect(out).toContain('anyof [memory-trigger] First relevant regime signal');
    expect(out).not.toMatch(/memory-trigger.*\(/);
  });
});

describe('validating connective nodes', () => {
  it('rejects a connective with zero dependencies', () => {
    const text = [
      'vine 1.3.0',
      '---',
      '[root] Root (started)',
      '-> c',
      '---',
      'anyof [c] Empty connective',
    ].join('\n');
    try {
      parse(text);
      expect.fail('expected validation to throw');
    } catch (err) {
      expect(err).toBeInstanceOf(VineValidationError);
      expect((err as VineValidationError).constraint).toBe('connective-has-deps');
    }
  });

  it('rejects a connective as the root node', () => {
    const text = [
      'vine 1.3.0',
      '---',
      'anyof [root] Root connective',
      '-> a',
      '---',
      '[a] A (complete)',
    ].join('\n');
    try {
      parse(text);
      expect.fail('expected validation to throw');
    } catch (err) {
      expect(err).toBeInstanceOf(VineValidationError);
      expect((err as VineValidationError).constraint).toBe('root-not-connective');
    }
  });
});

describe('buildSatisfaction', () => {
  it('anyof is satisfied when any dependency is satisfied', () => {
    const graph = setStatus(parse(DEFERRAL), 'r4-scoping', 'complete');
    const satisfied = buildSatisfaction(graph);
    expect(satisfied('memory-trigger')).toBe(true);
  });

  it('anyof is unsatisfied while all dependencies are unsatisfied', () => {
    const satisfied = buildSatisfaction(parse(DEFERRAL));
    expect(satisfied('memory-trigger')).toBe(false);
  });

  it('allof requires every dependency to be satisfied', () => {
    const base = [
      'vine 1.3.0',
      '---',
      '[root] Root (started)',
      '-> gate',
      '---',
      'allof [gate] All inputs',
      '-> a',
      '-> b',
      '---',
      '[a] A (notstarted)',
      '---',
      '[b] B (notstarted)',
    ].join('\n');
    const oneDone = setStatus(parse(base), 'a', 'complete');
    expect(buildSatisfaction(oneDone)('gate')).toBe(false);
    const bothDone = setStatus(oneDone, 'b', 'complete');
    expect(buildSatisfaction(bothDone)('gate')).toBe(true);
  });
});

describe('execution frontier with connectives', () => {
  it('keeps a connective-gated node out of the frontier until the anyof fires', () => {
    const graph = parse(DEFERRAL);
    const frontier = getActionableTasks(graph);

    // The two leaf triggers are ready; the gated node is NOT; nothing blocked.
    expect(frontier.ready.map((t) => t.id).sort()).toEqual([
      'r4-scoping',
      'spirit-2-intake',
    ]);
    expect(frontier.ready.map((t) => t.id)).not.toContain('gap-memory');
    expect(frontier.blocked).toHaveLength(0);
  });

  it('promotes the gated node once one upstream completes', () => {
    const graph = setStatus(parse(DEFERRAL), 'r4-scoping', 'complete');
    const frontier = getActionableTasks(graph);
    expect(frontier.ready.map((t) => t.id)).toContain('gap-memory');
  });

  it('never lists a connective in any frontier bucket', () => {
    const graph = setStatus(parse(DEFERRAL), 'r4-scoping', 'complete');
    const frontier = getActionableTasks(graph);
    const all = [
      ...frontier.ready,
      ...frontier.completable,
      ...frontier.blocked,
      ...frontier.expandable,
    ].map((t) => t.id);
    expect(all).not.toContain('memory-trigger');
  });

  it('excludes connectives from the progress denominator', () => {
    const graph = parse(DEFERRAL);
    const { progress } = getActionableTasks(graph);
    // 5 nodes total, but memory-trigger (connective) is not work.
    expect(graph.tasks.size).toBe(5);
    expect(progress.total).toBe(4);
  });

  it('getSummary.total excludes connectives, matching vine_next', () => {
    const graph = parse(DEFERRAL);
    const summary = getSummary(graph);
    const { progress } = getActionableTasks(graph);
    // Both surfaces must agree — connectives are not deliverable work.
    expect(summary.total).toBe(4);
    expect(summary.total).toBe(progress.total);
  });
});

describe('mutations on connective nodes', () => {
  it('creates a connective via the add_connective batch op', () => {
    const base = parse(
      [
        'vine 1.3.0',
        '---',
        '[root] Root (started)',
        '-> a',
        '-> b',
        '---',
        '[a] A (complete)',
        '---',
        '[b] B (complete)',
      ].join('\n'),
    );
    const next = applyBatch(base, [
      { op: 'add_connective', id: 'gate', name: 'Any input', kind: 'anyof', dependsOn: ['a', 'b'] },
      { op: 'add_dep', taskId: 'root', depId: 'gate' },
    ]);
    const gate = next.tasks.get('gate') as ConnectiveNode;
    expect(gate.kind).toBe('anyof');
    expect(gate.dependencies).toEqual(['a', 'b']);
  });

  it('refuses to set a status on a connective', () => {
    const graph = parse(DEFERRAL);
    expect(() => setStatus(graph, 'memory-trigger', 'complete')).toThrow(
      /Cannot set status on anyof node/,
    );
  });
});
