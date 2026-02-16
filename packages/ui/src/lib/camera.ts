import type { ViewportTransform } from './types';

/** Minimum bounding-box dimension to prevent extreme zoom-in on single nodes. */
const MIN_BOX_SIZE = 200;

/** Padding added to each side of the bounding box (px). */
const DEFAULT_PADDING = 80;

/** Zoom scale extent matching d3-zoom configuration. */
const MIN_SCALE = 0.25;
const MAX_SCALE = 4.0;

/**
 * Compute the axis-aligned bounding box for an array of positions,
 * expanded by `padding` on each side. Guarantees a minimum dimension
 * of {@link MIN_BOX_SIZE} so a single point doesn't cause extreme zoom.
 *
 * If `positions` is empty, returns a default box centered at the origin.
 */
export function computeBoundingBox(
  positions: { x: number; y: number }[],
  padding: number = DEFAULT_PADDING,
): {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
  cx: number;
  cy: number;
} {
  if (positions.length === 0) {
    const half = MIN_BOX_SIZE / 2 + padding;
    return {
      minX: -half,
      minY: -half,
      maxX: half,
      maxY: half,
      width: half * 2,
      height: half * 2,
      cx: 0,
      cy: 0,
    };
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const p of positions) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }

  // Ensure minimum box size before padding
  const rawW = maxX - minX;
  const rawH = maxY - minY;

  if (rawW < MIN_BOX_SIZE) {
    const expand = (MIN_BOX_SIZE - rawW) / 2;
    minX -= expand;
    maxX += expand;
  }
  if (rawH < MIN_BOX_SIZE) {
    const expand = (MIN_BOX_SIZE - rawH) / 2;
    minY -= expand;
    maxY += expand;
  }

  // Apply padding
  minX -= padding;
  minY -= padding;
  maxX += padding;
  maxY += padding;

  const width = maxX - minX;
  const height = maxY - minY;

  return {
    minX,
    minY,
    maxX,
    maxY,
    width,
    height,
    cx: (minX + maxX) / 2,
    cy: (minY + maxY) / 2,
  };
}

/**
 * Compute the camera {@link ViewportTransform} that frames a focused task
 * together with its dependants and dependencies inside the viewport.
 *
 * The returned transform follows the SVG convention:
 * `transform="translate(x, y) scale(k)"`
 *
 * To center a world-space point (cx, cy) in the viewport:
 * - x = vw/2 - cx * k
 * - y = vh/2 - cy * k
 */
export function computeFocusFrame(
  focusedPos: { x: number; y: number },
  dependantPositions: { x: number; y: number }[],
  dependencyPositions: { x: number; y: number }[],
  viewportWidth: number,
  viewportHeight: number,
): ViewportTransform {
  // 1. Collect all relevant positions
  const allPositions = [
    focusedPos,
    ...dependantPositions,
    ...dependencyPositions,
  ];

  // 2. Compute bounding box with 80px padding
  const box = computeBoundingBox(allPositions, DEFAULT_PADDING);

  // 3. Scale to fit the bounding box within the viewport, clamped to zoom extent
  const k = Math.min(
    Math.max(
      Math.min(viewportWidth / box.width, viewportHeight / box.height),
      MIN_SCALE,
    ),
    MAX_SCALE,
  );

  // 4. Translate so the bounding-box center maps to the viewport center
  const x = viewportWidth / 2 - box.cx * k;
  const y = viewportHeight / 2 - box.cy * k;

  return { x, y, k };
}
