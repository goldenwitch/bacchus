import {
  forceSimulation,
  forceLink,
  forceManyBody,
  forceCenter,
  forceCollide,
  forceRadial,
  forceX,
  forceY,
  type Simulation,
} from 'd3-force';
import type { Task, VineGraph } from '@bacchus/core';
import type { SimNode, SimLink } from './types.js';

/**
 * Compute the display radius for a task bubble.
 * Same formula used in GraphNode.svelte — exported here for reuse.
 */
export function computeNodeRadius(task: Task): number {
  return Math.min(60, Math.max(30, 20 + task.shortName.length * 2.5));
}

/**
 * BFS from the root task (last in graph.order) outward.
 * Root = depth 0, root's direct dependencies = depth 1, etc.
 */
export function computeDepths(graph: VineGraph): Map<string, number> {
  const depths = new Map<string, number>();

  // Root is the last task in file order.
  const rootId = graph.order[graph.order.length - 1];
  if (rootId === undefined) return depths;

  depths.set(rootId, 0);
  const queue: string[] = [rootId];

  while (queue.length > 0) {
    const currentId = queue.shift()!;
    const currentDepth = depths.get(currentId)!;
    const task = graph.tasks.get(currentId);
    if (!task) continue;

    for (const depId of task.dependencies) {
      if (!depths.has(depId)) {
        depths.set(depId, currentDepth + 1);
        queue.push(depId);
      }
    }
  }

  return depths;
}

/**
 * Create and configure a D3-force simulation per the BacchusUI spec.
 */
export function createSimulation(
  nodes: SimNode[],
  links: SimLink[],
  width: number,
  height: number,
): Simulation<SimNode, SimLink> {
  const cx = width / 2;
  const cy = height / 2;

  // Identify the root node (last in order → depth 0).
  const rootId = nodes.find((n) => n.depth === 0)?.id;

  const sim = forceSimulation<SimNode, SimLink>(nodes)
    // ── Simulation tuning ──
    .alpha(1)
    .alphaDecay(0.015)
    .alphaMin(0.001)
    .velocityDecay(0.3)

    // ── Link force ──
    .force(
      'link',
      forceLink<SimNode, SimLink>(links)
        .id((d) => d.id)
        .distance(120)
        .strength(0.8),
    )

    // ── Charge force ──
    .force(
      'charge',
      forceManyBody<SimNode>().strength(-300).distanceMax(500),
    )

    // ── Center force ──
    .force('center', forceCenter<SimNode>(cx, cy))

    // ── Collide force ──
    .force(
      'collide',
      forceCollide<SimNode>()
        .radius((d) => computeNodeRadius(d.task) + 16)
        .strength(0.9),
    )

    // ── Radial force (depth rings) ──
    .force(
      'radial',
      forceRadial<SimNode>(
        (d) => d.depth * 150,
        cx,
        cy,
      ).strength(0.05),
    )

    // ── Root positioning forces ──
    .force(
      'rootX',
      forceX<SimNode>(cx).strength((d) => (d.id === rootId ? 0.3 : 0)),
    )
    .force(
      'rootY',
      forceY<SimNode>(cy).strength((d) => (d.id === rootId ? 0.3 : 0)),
    );

  return sim;
}
