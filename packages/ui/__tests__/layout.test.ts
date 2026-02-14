import { describe, it, expect } from 'vitest';
import { parse } from '@bacchus/core';
import { computeDepths, computeNodeRadius, createSimulation } from '../src/lib/layout.js';
import type { SimNode, SimLink } from '../src/lib/types.js';

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
});

describe('computeNodeRadius', () => {
  it('returns a value between 30 and 60 for various shortName lengths', () => {
    for (const id of graph.order) {
      const task = graph.tasks.get(id)!;
      const r = computeNodeRadius(task);
      expect(r).toBeGreaterThanOrEqual(30);
      expect(r).toBeLessThanOrEqual(60);
    }
  });

  it('clamps to minimum 30 for very short names', () => {
    const task = { shortName: 'Hi' } as any;
    expect(computeNodeRadius(task)).toBe(30);
  });

  it('clamps to maximum 60 for very long names', () => {
    const task = { shortName: 'This Is A Very Long Task Name Indeed' } as any;
    expect(computeNodeRadius(task)).toBe(60);
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

  it('root node is near center after settling', () => {
    const { nodes, links } = buildSimData();
    const sim = createSimulation(nodes, links, 800, 600);
    for (let i = 0; i < 300; i++) sim.tick();

    const root = nodes.find((n) => n.id === 'root')!;
    // Root should be within 100px of viewport center (400, 300)
    expect(root.x!).toBeGreaterThan(400 - 100);
    expect(root.x!).toBeLessThan(400 + 100);
    expect(root.y!).toBeGreaterThan(300 - 100);
    expect(root.y!).toBeLessThan(300 + 100);
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
          computeNodeRadius(a.task) + computeNodeRadius(b.task) - epsilon;
        expect(dist).toBeGreaterThan(minDist);
      }
    }
  });
});
