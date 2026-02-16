import {
  forceSimulation,
  forceLink,
  forceManyBody,
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
 * Longest-path traversal from the root task (last in graph.order) outward.
 * Root = depth 0; each dependency is at least depth + 1.  When a node is
 * reachable via multiple paths the **maximum** hop count wins, pushing
 * shared dependencies to the lowest visual stratum.
 */
export function computeDepths(graph: VineGraph): Map<string, number> {
  const depths = new Map<string, number>();

  // Root is the last task in file order.
  const rootId = graph.order[graph.order.length - 1];
  if (rootId === undefined) return depths;

  depths.set(rootId, 0);
  const queue: string[] = [rootId];

  while (queue.length > 0) {
    const currentId = queue.shift();
    if (!currentId) continue;
    const currentDepth = depths.get(currentId) ?? 0;
    const task = graph.tasks.get(currentId);
    if (!task) continue;

    for (const depId of task.dependencies) {
      const newDepth = currentDepth + 1;
      if (!depths.has(depId) || newDepth > (depths.get(depId) ?? 0)) {
        depths.set(depId, newDepth);
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
  let nodeById = new Map<string, SimNode>();

  function force(alpha: number) {

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
    nodeById = new Map<string, SimNode>();
    for (const nd of n) {
      nodeById.set(nd.id, nd);
    }
  };

  force.strength = function (s?: number) {
    if (s === undefined) return _strength;
    _strength = s;
    return force;
  };

  return force;
}

/**
 * Custom D3-compatible force that pulls each node vertically toward its
 * target depth-layer position with a non-linear spring.
 *
 * The displacement `dy` is normalised by `layerSpacing` before the exponent
 * is applied, keeping forces bounded regardless of pixel distance:
 *
 *   normDy  = dy / layerSpacing
 *   force   = sign(normDy) * |normDy|^exponent * layerSpacing * strength * alpha
 *
 * At exponent = 1.0 this simplifies to `dy * strength * alpha`, identical to
 * d3's built-in `forceY`.  Values < 1 give sub-linear (softened) pull at
 * large distance; values > 1 give super-linear (aggressive snap).
 *
 * A per-tick velocity cap (`maxVelocity`) prevents numerical blow-up at
 * extreme exponents or large displacements.
 */
export function forceLayer(
  targetY: (d: SimNode) => number,
  strength: number,
  exponent: number,
  layerSpacing: number,
) {
  let nodes: SimNode[] = [];
  let _targetY = targetY;
  let _strength = strength;
  let _exponent = exponent;
  let _layerSpacing = layerSpacing;

  // Hard velocity cap — prevents numerical blow-up.
  const maxVelocity = 200;

  function force(alpha: number) {
    // Reference distance for normalisation.  Falls back to 1 to avoid
    // division by zero if the caller ever passes 0.
    const ref = Math.max(_layerSpacing, 1);

    for (const node of nodes) {
      const ty = _targetY(node);
      const dy = ty - (node.y ?? 0);

      // Normalise into "layer-spacing units", apply exponent, scale back.
      const normDy = dy / ref;
      const absNorm = Math.abs(normDy);
      const scaledDy =
        absNorm === 0
          ? 0
          : Math.sign(normDy) * Math.pow(absNorm, _exponent) * ref;

      let dv = scaledDy * _strength * alpha;

      // Clamp to avoid simulation blow-up at high exponents.
      if (dv > maxVelocity) dv = maxVelocity;
      else if (dv < -maxVelocity) dv = -maxVelocity;

      node.vy = (node.vy ?? 0) + dv;
    }
  }

  force.initialize = function (n: SimNode[]) {
    nodes = n;
  };

  force.y = function (fn?: (d: SimNode) => number) {
    if (fn === undefined) return _targetY;
    _targetY = fn;
    return force;
  };

  force.strength = function (s?: number) {
    if (s === undefined) return _strength;
    _strength = s;
    return force;
  };

  force.exponent = function (e?: number) {
    if (e === undefined) return _exponent;
    _exponent = e;
    return force;
  };

  force.layerSpacing = function (ls?: number) {
    if (ls === undefined) return _layerSpacing;
    _layerSpacing = ls;
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

  // Resolve config: use caller-supplied values or fall back to defaults.
  const cfg = config ?? getDefaults();

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

    // ── Horizontal centering force ──
    // Gentle X-only centering so nodes don't drift sideways.
    // Unlike forceCenter (which shifts positions directly on both axes),
    // this only nudges velocity on X, leaving Y entirely to the layer force.
    .force('centerX', forceX<SimNode>(cx).strength(cfg.centerStrength))

    // ── Collide force ──
    .force(
      'collide',
      forceCollide<SimNode>()
        .radius((d) => computeNodeRadius(d.task.shortName.length) + cfg.collidePadding)
        .strength(cfg.collideStrength)
        .iterations(2),
    )

    // ── Layer force (vertical stratification) ──
    // Non-linear spring attractor pulls each node toward its depth layer.
    // topMargin keeps the root away from the viewport edge.
    .force(
      'layer',
      forceLayer(
        (d) => height * 0.1 + d.depth * cfg.layerSpacing,
        cfg.layerStrength,
        cfg.layerExponent,
        cfg.layerSpacing,
      ),
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
  const layerForce = sim.force('layer') as ReturnType<typeof forceLayer> | null;
  if (layerForce) {
    /* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */
    layerForce
      .y((d: SimNode) => height * 0.1 + d.depth * config.layerSpacing)
      .strength(config.layerStrength)
      .exponent(config.layerExponent)
      .layerSpacing(config.layerSpacing);
    /* eslint-enable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */
  }

  // Patch cluster force
  const clusterForce = sim.force('cluster') as ReturnType<typeof forceCluster> | null;
  if (clusterForce) {
    clusterForce.strength(config.clusterStrength);
  }

  // Patch horizontal centering force
  const centerXForce = sim.force('centerX') as ReturnType<typeof forceX<SimNode>> | null;
  if (centerXForce) {
    centerXForce.x(cx).strength(config.centerStrength);
  }

  // Patch root positioning forces
  const rootXForce = sim.force('rootX') as ReturnType<typeof forceX<SimNode>> | null;
  if (rootXForce) {
    rootXForce.x(cx);
  }
  const rootYForce = sim.force('rootY') as ReturnType<typeof forceY<SimNode>> | null;
  if (rootYForce) {
    rootYForce.y(height * 0.1);
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
      const id = dependantIds[i];
      if (id) {
        result.push({
          id,
          x: startX + i * spacing,
          y: topY,
          band: 'dependants',
        });
      }
    }
  }

  // Layout dependencies evenly across the bottom band
  if (dependencyIds.length > 0) {
    const spacing = Math.min(180, (width * 0.6) / dependencyIds.length);
    const startX = cx - ((dependencyIds.length - 1) * spacing) / 2;
    for (let i = 0; i < dependencyIds.length; i++) {
      const id = dependencyIds[i];
      if (id) {
        result.push({
          id,
          x: startX + i * spacing,
          y: botY,
          band: 'dependencies',
        });
      }
    }
  }

  // Push peripheral nodes to the outer edges
  const peripheralNodes = nodes.filter((n) => !connectedSet.has(n.id));
  if (peripheralNodes.length > 0) {
    const margin = width * 0.1;
    const vertSpacing = height / (peripheralNodes.length + 1);
    for (let i = 0; i < peripheralNodes.length; i++) {
      const side = i % 2 === 0 ? margin : width - margin;
      const pNode = peripheralNodes[i];
      if (pNode) {
        result.push({
          id: pNode.id,
          x: side,
          y: vertSpacing * (i + 1),
          band: 'periphery',
        });
      }
    }
  }

  return result;
}
