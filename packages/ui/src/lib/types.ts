import type { SimulationNodeDatum } from 'd3-force';
import type { Task } from '@bacchus/core';

/**
 * A graph node enriched with D3-force simulation properties.
 * Extends SimulationNodeDatum so it can be used directly in d3-force.
 */
export interface SimNode extends SimulationNodeDatum {
  /** Task identifier — matches Task.id */
  id: string;
  /** The full task object from the core graph */
  task: Task;
  /** BFS depth from root (root = 0) */
  depth: number;
}

/**
 * An edge between two tasks, expressed as ID pairs for D3 force links.
 */
export interface SimLink {
  source: string;
  target: string;
}

/**
 * Pan / zoom state applied to the SVG viewport.
 * Matches the d3-zoom transform shape: translate(x, y) scale(k).
 */
export interface ViewportTransform {
  x: number;
  y: number;
  k: number;
}

/**
 * Compute the display radius for a task bubble.
 * Shared by GraphNode.svelte and layout.ts to keep sizing consistent.
 */
export function computeNodeRadius(nameLength: number): number {
  return Math.min(60, Math.max(40, 20 + nameLength * 2.5));
}
