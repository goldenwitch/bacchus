import type { Status } from '@bacchus/core';
import { STATUS_MAP, themeVersion } from '../status.js';

/**
 * Convert a hex color string to normalized RGB components (0-1).
 */
function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  return { r, g, b };
}

/**
 * Get the SVG filter ID for tinting a sprite to match a given status.
 */
export function getTintFilterId(status: Status): string {
  return `sprite-tint-${status}`;
}

/**
 * Get the SVG filter ID for tinting a ref node (distinct from any status).
 */
export function getRefTintFilterId(): string {
  return 'sprite-tint-ref';
}

/**
 * Generate SVG filter definitions for all status tints + ref tint.
 *
 * Each filter uses feColorMatrix to recolor the grayscale base sprite
 * to match the status color. The matrix maps grayscale luminance to
 * the target hue while preserving alpha.
 *
 * The approach: use a "luminanceToAlpha" + feFlood + feComposite pipeline
 * that preserves the sprite's light/dark detail while shifting the hue.
 *
 * Actually, a simpler approach: use feColorMatrix type="matrix" where we
 * map R/G/B channels to produce the target color, scaled by the input
 * luminance. This preserves the gradient/shading detail.
 *
 * For a grayscale input where R≈G≈B≈L (luminance):
 * Output R = L * targetR * scale
 * Output G = L * targetG * scale
 * Output B = L * targetB * scale
 *
 * We use the darkColor (the fill variant) as the target so the sprite
 * body matches the existing bubble fill aesthetic.
 *
 * @returns SVG filter element strings to inject into <defs>
 */
export function generateTintFilters(): string[] {
  // Touch themeVersion to make this reactive
  void themeVersion();

  const filters: string[] = [];

  // Generate a tint filter for each status
  const statuses: Status[] = [
    'complete',
    'started',
    'reviewing',
    'planning',
    'notstarted',
    'blocked',
  ];

  for (const status of statuses) {
    const info = STATUS_MAP[status];
    const { r, g, b } = hexToRgb(info.darkColor);

    // Scale factor to brighten the result (grayscale midpoint ~0.63 from our sprite)
    // We want the middle tone to hit roughly the target color
    const scale = 1.6;

    // feColorMatrix: multiply each channel by the target color component
    // Matrix: [R_scale 0 0 0 0]  <- R output = R_in * R_scale
    //         [0 G_scale 0 0 0]  <- G output = G_in * G_scale
    //         [0 0 B_scale 0 0]  <- B output = B_in * B_scale
    //         [0 0 0 1 0]        <- A output = A_in (unchanged)
    const matrix = [
      (r * scale).toFixed(3),
      0,
      0,
      0,
      0,
      0,
      (g * scale).toFixed(3),
      0,
      0,
      0,
      0,
      0,
      (b * scale).toFixed(3),
      0,
      0,
      0,
      0,
      0,
      1,
      0,
    ].join(' ');

    filters.push(
      `<filter id="${getTintFilterId(status)}" color-interpolation-filters="sRGB">` +
        `<feColorMatrix type="matrix" values="${matrix}" />` +
        `</filter>`,
    );
  }

  // Ref node tint — a cool slate blue-gray (#5A6A7A)
  const refColor = hexToRgb('#5A6A7A');
  const refScale = 1.6;
  const refMatrix = [
    (refColor.r * refScale).toFixed(3),
    0,
    0,
    0,
    0,
    0,
    (refColor.g * refScale).toFixed(3),
    0,
    0,
    0,
    0,
    0,
    (refColor.b * refScale).toFixed(3),
    0,
    0,
    0,
    0,
    0,
    1,
    0,
  ].join(' ');

  filters.push(
    `<filter id="${getRefTintFilterId()}" color-interpolation-filters="sRGB">` +
      `<feColorMatrix type="matrix" values="${refMatrix}" />` +
      `</filter>`,
  );

  return filters;
}
