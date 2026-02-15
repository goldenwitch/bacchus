import {
  forceSimulation,
  forceLink,
  forceManyBody,
  forceCenter,
  forceCollide,
  forceX,
  forceY,
  type Simulation,
} from 'd3-force';
import type { VineGraph } from '@bacchus/core';
import { computeNodeRadius, type SimNode, type SimLink } from './types.js';
import type { PhysicsConfig } from './physics.js';
import { getDefaults } from './physics.js';

// Re-export for backward compatibility (tests import from layout.ts)
export { computeNodeRadius };

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
 * Build a reverse-dependency lookup: for each node, which nodes depend on it?
 * In the visual layout, dependants sit in the layer above (lower depth),
 * so this map tells each node where its "parents" are.
 */
export function buildDependantsMap(links: SimLink[]): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const link of links) {
    // link.source depends on link.target (source → target means "source needs target")
    // So target's dependant is source.
    const sourceId = typeof link.source === 'string' ? link.source : (link.source as SimNode).id;
    const targetId = typeof link.target === 'string' ? link.target : (link.target as SimNode).id;
    let arr = map.get(targetId);
    if (!arr) {
      arr = [];
      map.set(targetId, arr);
    }
    arr.push(sourceId);
  }
  return map;
}

/**
 * Custom D3-compatible force that pulls each node horizontally
 * toward the mean x-position of its dependants (parents in the layer above).
 * This clusters sibling dependencies under their shared parent.
 */
export function forceCluster(dependantsMap: Map<string, string[]>, strength: number) {
  let nodes: SimNode[] = [];
  let _strength = strength;

  function force(alpha: number) {
    const nodeById = new Map<string, SimNode>();
    for (const n of nodes) {
      nodeById.set(n.id, n);
    }

    for (const node of nodes) {
      const depIds = dependantsMap.get(node.id);
      if (!depIds || depIds.length === 0) continue;

      // Compute mean x of dependants (parents)
      let sumX = 0;
      let count = 0;
      for (const id of depIds) {
        const parent = nodeById.get(id);
        if (parent && parent.x != null) {
          sumX += parent.x;
          count++;
        }
      }
      if (count === 0) continue;

      const meanX = sumX / count;
      node.vx = (node.vx ?? 0) + (meanX - (node.x ?? 0)) * _strength * alpha;
    }
  }

  force.initialize = function (n: SimNode[]) {
    nodes = n;
  };

  force.strength = function (s?: number) {
    if (s === undefined) return _strength;
    _strength = s;
    return force;
  };

  return force;
}

/**
 * Create and configure a D3-force simulation per the BacchusUI spec.
 */
export function createSimulation(
  nodes: SimNode[],
  links: SimLink[],
  width: number,
  height: number,
  config?: PhysicsConfig,
): Simulation<SimNode, SimLink> {
  const cx = width / 2;
  const cy = height / 2;

  // Resolve config: use caller-supplied values or fall back to defaults.
  const cfg = config ?? getDefaults(nodes.length);

  // Identify the root node (last in order → depth 0).
  const rootId = nodes.find((n) => n.depth === 0)?.id;

  const sim = forceSimulation<SimNode, SimLink>(nodes)
    // ── Simulation tuning ──
    .alpha(1)
    .alphaDecay(0.015)
    .alphaMin(0.001)
    .velocityDecay(cfg.velocityDecay)

    // ── Link force (rigid rods) ──
    // Each edge targets a rod length of r_source + r_target + gap.
    // Moderate strength lets charge repulsion stretch links
    // beyond the target — the rod sets a *floor*, not a ceiling.
    // Two iterations keep the floor firm without violent snapping.
    .force(
      'link',
      forceLink<SimNode, SimLink>(links)
        .id((d) => d.id)
        .distance((link) => {
          const s = link.source as SimNode;
          const t = link.target as SimNode;
          return computeNodeRadius(s.task.shortName.length)
               + computeNodeRadius(t.task.shortName.length)
               + cfg.minEdgeGap;
        })
        .strength(cfg.linkStrength)
        .iterations(2),
    )

    // ── Charge force ──
    // Strong repulsion spreads nodes apart.  distanceMax limits
    // the range so distant clusters don't repel each other.
    .force(
      'charge',
      forceManyBody<SimNode>().strength(cfg.chargeStrength).distanceMax(cfg.chargeDistanceMax),
    )

    // ── Center force ──
    .force('center', forceCenter<SimNode>(cx, cy))

    // ── Collide force ──
    .force(
      'collide',
      forceCollide<SimNode>()
        .radius((d) => computeNodeRadius(d.task.shortName.length) + cfg.collidePadding)
        .strength(cfg.collideStrength)
        .iterations(2),
    )

    // ── Layer force (vertical stratification) ──
    // Spring-like attractor pulls each node toward its depth layer.
    // topMargin keeps the root away from the viewport edge.
    .force(
      'layer',
      forceY<SimNode>(
        (d) => height * 0.1 + d.depth * cfg.layerSpacing,
      ).strength(cfg.layerStrength),
    )

    // ── Cluster force (horizontal subgraph grouping) ──
    // Pulls nodes toward the mean x of their dependants so
    // siblings cluster under their shared parent.
    .force(
      'cluster',
      forceCluster(buildDependantsMap(links), cfg.clusterStrength),
    )

    // ── Root positioning forces ──
    .force(
      'rootX',
      forceX<SimNode>(cx).strength((d) => (d.id === rootId ? 0.3 : 0)),
    )
    .force(
      'rootY',
      forceY<SimNode>(height * 0.1).strength((d) => (d.id === rootId ? 0.3 : 0)),
    );

  return sim;
}

/**
 * Patch a running simulation with updated physics parameters and reheat it.
 * Called when the user adjusts a slider in the physics panel.
 */
export function applyPhysicsConfig(
  sim: Simulation<SimNode, SimLink>,
  config: PhysicsConfig,
  width: number,
  height: number,
): void {
  const cx = width / 2;
  const cy = height / 2;

  sim.velocityDecay(config.velocityDecay);

  // Patch link force
  const linkForce = sim.force('link') as ReturnType<typeof forceLink<SimNode, SimLink>> | null;
  if (linkForce) {
    linkForce
      .distance((link) => {
        const s = link.source as SimNode;
        const t = link.target as SimNode;
        return computeNodeRadius(s.task.shortName.length)
             + computeNodeRadius(t.task.shortName.length)
             + config.minEdgeGap;
      })
      .strength(config.linkStrength);
  }

  // Patch charge force
  const chargeForce = sim.force('charge') as ReturnType<typeof forceManyBody<SimNode>> | null;
  if (chargeForce) {
    chargeForce.strength(config.chargeStrength).distanceMax(config.chargeDistanceMax);
  }

  // Patch collide force
  const collideForce = sim.force('collide') as ReturnType<typeof forceCollide<SimNode>> | null;
  if (collideForce) {
    collideForce
      .radius((d: SimNode) => computeNodeRadius(d.task.shortName.length) + config.collidePadding)
      .strength(config.collideStrength);
  }

  // Patch layer force
  const layerForce = sim.force('layer') as ReturnType<typeof forceY<SimNode>> | null;
  if (layerForce) {
    layerForce
      .y((d: SimNode) => height * 0.1 + d.depth * config.layerSpacing)
      .strength(config.layerStrength);
  }

  // Patch cluster force
  const clusterForce = sim.force('cluster') as ReturnType<typeof forceCluster> | null;
  if (clusterForce) {
    clusterForce.strength(config.clusterStrength);
  }

  // Reheat simulation so changes are immediately visible
  sim.alpha(0.3).restart();
}

/**
 * Band position for a single node during focus-mode layout.
 */
export interface BandPosition {
  id: string;
  x: number;
  y: number;
  /** Which band this node belongs to */
  band: 'dependants' | 'focused' | 'dependencies' | 'periphery';
}

/**
 * Compute target positions for focus-mode band layout.
 *
 * Layout:
 *   Top band = dependants (tasks that depend ON the focused task)
 *   Middle   = the focused task
 *   Bottom   = dependencies (tasks the focused task depends on)
 *   Periphery = everything else, pushed outside the band area
 */
export function computeFocusBandPositions(
  focusedId: string,
  nodes: { id: string; x: number; y: number }[],
  dependantIds: string[],
  dependencyIds: string[],
  width: number,
  height: number,
): BandPosition[] {
  const cx = width / 2;
  const connectedSet = new Set([focusedId, ...dependantIds, ...dependencyIds]);

  // Band Y positions: dependants at top ~25%, focused at center ~50%, deps at bottom ~75%
  const topY = height * 0.25;
  const midY = height * 0.50;
  const botY = height * 0.75;

  const result: BandPosition[] = [];

  // Layout the focused node at center
  result.push({ id: focusedId, x: cx, y: midY, band: 'focused' });

  // Layout dependants evenly across the top band
  if (dependantIds.length > 0) {
    const spacing = Math.min(180, (width * 0.6) / dependantIds.length);
    const startX = cx - ((dependantIds.length - 1) * spacing) / 2;
    for (let i = 0; i < dependantIds.length; i++) {
      result.push({
        id: dependantIds[i]!,
        x: startX + i * spacing,
        y: topY,
        band: 'dependants',
      });
    }
  }

  // Layout dependencies evenly across the bottom band
  if (dependencyIds.length > 0) {
    const spacing = Math.min(180, (width * 0.6) / dependencyIds.length);
    const startX = cx - ((dependencyIds.length - 1) * spacing) / 2;
    for (let i = 0; i < dependencyIds.length; i++) {
      result.push({
        id: dependencyIds[i]!,
        x: startX + i * spacing,
        y: botY,
        band: 'dependencies',
      });
    }
  }

  // Push peripheral nodes to the outer edges
  const peripheralNodes = nodes.filter((n) => !connectedSet.has(n.id));
  if (peripheralNodes.length > 0) {
    const margin = width * 0.1;
    const vertSpacing = height / (peripheralNodes.length + 1);
    for (let i = 0; i < peripheralNodes.length; i++) {
      const side = i % 2 === 0 ? margin : width - margin;
      const pNode = peripheralNodes[i]!;
      result.push({
        id: pNode.id,
        x: side,
        y: vertSpacing * (i + 1),
        band: 'periphery',
      });
    }
  }

  return result;
}
