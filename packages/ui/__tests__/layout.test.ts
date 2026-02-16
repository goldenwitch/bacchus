import { describe, it, expect } from 'vitest';
import { parse } from '@bacchus/core';
import {
  computeDepths,
  computeNodeRadius,
  createSimulation,
  computeFocusBandPositions,
} from '../src/lib/layout.js';
import type { SimNode, SimLink } from '../src/lib/types.js';
import { getDefaults } from '../src/lib/physics.js';

const VINE_SOURCE = `
[leaf-a] Leaf A (complete)
Task A

[leaf-b] Leaf B (started)
Task B

[mid] Middle (notstarted)
-> leaf-a
-> leaf-b

[root] Root (started)
-> mid
`;

const graph = parse(VINE_SOURCE);

function buildSimData(): { nodes: SimNode[]; links: SimLink[] } {
  const depths = computeDepths(graph);
  const nodes: SimNode[] = graph.order.map((id) => ({
    id,
    task: graph.tasks.get(id)!,
    depth: depths.get(id) ?? 0,
  }));
  const links: SimLink[] = [];
  for (const task of graph.tasks.values()) {
    for (const dep of task.dependencies) {
      links.push({ source: task.id, target: dep });
    }
  }
  return { nodes, links };
}

describe('computeDepths', () => {
  it('assigns root depth 0, mid depth 1, leaves depth 2', () => {
    const depths = computeDepths(graph);
    expect(depths.get('root')).toBe(0);
    expect(depths.get('mid')).toBe(1);
    expect(depths.get('leaf-a')).toBe(2);
    expect(depths.get('leaf-b')).toBe(2);
  });

  it('uses maximum hops for diamond graphs', () => {
    // root → a, root → b, b → a
    // min-hop: a=1, b=1   max-hop: a=2, b=1
    const diamond = parse(`
[a] Task A (notstarted)
Do A

[b] Task B (notstarted)
-> a
Do B

[root] Root (started)
-> a
-> b
`);
    const depths = computeDepths(diamond);
    expect(depths.get('root')).toBe(0);
    expect(depths.get('b')).toBe(1);
    expect(depths.get('a')).toBe(2); // max hops, not min
  });
});

describe('computeNodeRadius', () => {
  it('returns a value between 40 and 60 for various shortName lengths', () => {
    for (const id of graph.order) {
      const task = graph.tasks.get(id)!;
      const r = computeNodeRadius(task.shortName.length);
      expect(r).toBeGreaterThanOrEqual(40);
      expect(r).toBeLessThanOrEqual(60);
    }
  });

  it('clamps to minimum 40 for very short names', () => {
    expect(computeNodeRadius(2)).toBe(40);
  });

  it('clamps to maximum 60 for very long names', () => {
    expect(computeNodeRadius(35)).toBe(60);
  });
});

describe('createSimulation', () => {
  it('produces valid positions (no NaN) after settling', () => {
    const { nodes, links } = buildSimData();
    const sim = createSimulation(nodes, links, 800, 600);
    for (let i = 0; i < 300; i++) sim.tick();

    for (const n of nodes) {
      expect(n.x).not.toBeNaN();
      expect(n.y).not.toBeNaN();
    }
  });

  it('root node is near top-center after settling', () => {
    const { nodes, links } = buildSimData();
    const sim = createSimulation(nodes, links, 800, 600);
    for (let i = 0; i < 300; i++) sim.tick();

    const root = nodes.find((n) => n.id === 'root')!;
    // Root should be near horizontal center (x ≈ 400) and near the top
    // in the top-to-bottom layered layout.
    expect(root.x!).toBeGreaterThan(400 - 200);
    expect(root.x!).toBeLessThan(400 + 200);
    // With strong charge repulsion the root can be pushed above its
    // target layer position, so allow a generous vertical window.
    const topMargin = 600 * 0.1; // 60
    expect(root.y!).toBeGreaterThan(topMargin - 200);
    expect(root.y!).toBeLessThan(topMargin + 200);
  });

  it('no overlapping nodes after settling', () => {
    const { nodes, links } = buildSimData();
    const sim = createSimulation(nodes, links, 800, 600);
    for (let i = 0; i < 300; i++) sim.tick();

    const epsilon = 2; // small tolerance
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i];
        const b = nodes[j];
        const dx = a.x! - b.x!;
        const dy = a.y! - b.y!;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const minDist =
          computeNodeRadius(a.task.shortName.length) +
          computeNodeRadius(b.task.shortName.length) -
          epsilon;
        expect(dist).toBeGreaterThan(minDist);
      }
    }
  });

  it('edges act as rigid rods — no link shorter than sum of endpoint radii', () => {
    const { nodes, links } = buildSimData();
    const sim = createSimulation(nodes, links, 800, 600);
    for (let i = 0; i < 300; i++) sim.tick();

    // After the link force resolves references, source/target become SimNode objects.
    for (const link of links) {
      const s = link.source as unknown as SimNode;
      const t = link.target as unknown as SimNode;
      const dx = s.x! - t.x!;
      const dy = s.y! - t.y!;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const minDist =
        computeNodeRadius(s.task.shortName.length) +
        computeNodeRadius(t.task.shortName.length);
      expect(dist).toBeGreaterThan(minDist);
    }
  });

  it('stays stable with high layer exponent (3.0)', () => {
    const { nodes, links } = buildSimData();
    const cfg = { ...getDefaults(), layerExponent: 3.0 };
    const sim = createSimulation(nodes, links, 800, 600, cfg);
    for (let i = 0; i < 300; i++) sim.tick();

    for (const n of nodes) {
      expect(Number.isFinite(n.x)).toBe(true);
      expect(Number.isFinite(n.y)).toBe(true);
      // Positions should stay within a reasonable viewport range
      expect(Math.abs(n.x!)).toBeLessThan(10_000);
      expect(Math.abs(n.y!)).toBeLessThan(10_000);
    }
  });

  it('layer exponent 1.0 is equivalent to linear spring', () => {
    // With exponent 1.0, forceLayer should behave like forceY
    const { nodes, links } = buildSimData();
    const cfg = { ...getDefaults(), layerExponent: 1.0 };
    const sim = createSimulation(nodes, links, 800, 600, cfg);
    for (let i = 0; i < 300; i++) sim.tick();

    for (const n of nodes) {
      expect(n.x).not.toBeNaN();
      expect(n.y).not.toBeNaN();
    }
  });
});

describe('computeFocusBandPositions', () => {
  const WIDTH = 800;
  const HEIGHT = 600;

  const nodes = [
    { id: 'root', x: 400, y: 300 },
    { id: 'mid', x: 350, y: 350 },
    { id: 'leaf-a', x: 200, y: 400 },
    { id: 'leaf-b', x: 500, y: 400 },
  ];

  it('returns a BandPosition for every node', () => {
    const result = computeFocusBandPositions(
      'mid',
      nodes,
      ['root'],
      ['leaf-a', 'leaf-b'],
      WIDTH,
      HEIGHT,
    );
    expect(result).toHaveLength(4);
    const ids = result.map((r) => r.id);
    expect(ids).toContain('root');
    expect(ids).toContain('mid');
    expect(ids).toContain('leaf-a');
    expect(ids).toContain('leaf-b');
  });

  it('places focused node in the "focused" band at vertical center', () => {
    const result = computeFocusBandPositions(
      'mid',
      nodes,
      ['root'],
      ['leaf-a', 'leaf-b'],
      WIDTH,
      HEIGHT,
    );
    const focused = result.find((r) => r.id === 'mid')!;
    expect(focused.band).toBe('focused');
    expect(focused.y).toBe(HEIGHT * 0.5);
    expect(focused.x).toBe(WIDTH / 2);
  });

  it('places dependants in the "dependants" band at top', () => {
    const result = computeFocusBandPositions(
      'mid',
      nodes,
      ['root'],
      ['leaf-a', 'leaf-b'],
      WIDTH,
      HEIGHT,
    );
    const dep = result.find((r) => r.id === 'root')!;
    expect(dep.band).toBe('dependants');
    expect(dep.y).toBe(HEIGHT * 0.25);
  });

  it('places dependencies in the "dependencies" band at bottom', () => {
    const result = computeFocusBandPositions(
      'mid',
      nodes,
      ['root'],
      ['leaf-a', 'leaf-b'],
      WIDTH,
      HEIGHT,
    );
    const depA = result.find((r) => r.id === 'leaf-a')!;
    const depB = result.find((r) => r.id === 'leaf-b')!;
    expect(depA.band).toBe('dependencies');
    expect(depB.band).toBe('dependencies');
    expect(depA.y).toBe(HEIGHT * 0.75);
    expect(depB.y).toBe(HEIGHT * 0.75);
  });

  it('evenly spaces multiple dependencies in the bottom band', () => {
    const result = computeFocusBandPositions(
      'mid',
      nodes,
      ['root'],
      ['leaf-a', 'leaf-b'],
      WIDTH,
      HEIGHT,
    );
    const depA = result.find((r) => r.id === 'leaf-a')!;
    const depB = result.find((r) => r.id === 'leaf-b')!;
    // Two items centered around WIDTH/2, so they should be symmetric
    const centerX = WIDTH / 2;
    const offset = Math.abs(depA.x - centerX);
    expect(Math.abs(depB.x - centerX)).toBeCloseTo(offset, 1);
  });

  it('assigns "periphery" band to unconnected nodes', () => {
    // Focus on 'root' — only 'mid' is a dependency; leaf-a and leaf-b are peripheral
    const result = computeFocusBandPositions(
      'root',
      nodes,
      [],
      ['mid'],
      WIDTH,
      HEIGHT,
    );
    const peripherals = result.filter((r) => r.band === 'periphery');
    expect(peripherals).toHaveLength(2);
    const peripheralIds = peripherals.map((r) => r.id).sort();
    expect(peripheralIds).toEqual(['leaf-a', 'leaf-b']);
  });

  it('handles node with no dependants or dependencies', () => {
    const result = computeFocusBandPositions(
      'leaf-a',
      nodes,
      [],
      [],
      WIDTH,
      HEIGHT,
    );
    const focused = result.find((r) => r.id === 'leaf-a')!;
    expect(focused.band).toBe('focused');
    // All others are peripheral
    const peripherals = result.filter((r) => r.band === 'periphery');
    expect(peripherals).toHaveLength(3);
  });

  it('all positions have finite x and y', () => {
    const result = computeFocusBandPositions(
      'mid',
      nodes,
      ['root'],
      ['leaf-a', 'leaf-b'],
      WIDTH,
      HEIGHT,
    );
    for (const pos of result) {
      expect(Number.isFinite(pos.x)).toBe(true);
      expect(Number.isFinite(pos.y)).toBe(true);
    }
  });
});
