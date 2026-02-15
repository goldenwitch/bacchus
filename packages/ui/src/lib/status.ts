import type { Status } from '@bacchus/core';

/**
 * Visual metadata for a task status.
 */
export interface StatusInfo {
  /** Primary status color (hex) */
  color: string;
  /** Darker variant (~20% luminance reduction) for inner fills */
  darkColor: string;
  /** Status emoji */
  emoji: string;
  /** CSS class name applied to the node group */
  cssClass: string;
  /** Human-friendly display label */
  label: string;
  /** CSS custom property name for the primary color */
  cssColorVar: string;
  /** CSS custom property name for the dark variant */
  cssDarkColorVar: string;
}

/**
 * Maps every Status value to its visual representation.
 * Default hex values match the :root (dark theme) CSS custom properties.
 * Call refreshStatusColors() after theme changes to sync from CSS.
 */
export const STATUS_MAP: Record<Status, StatusInfo> = {
  complete: {
    color: '#4ade80',
    darkColor: '#2d8f53',
    emoji: '🌿',
    cssClass: 'status-complete',
    label: 'Complete',
    cssColorVar: '--color-complete',
    cssDarkColorVar: '--color-complete-dark',
  },
  started: {
    color: '#facc15',
    darkColor: '#b8930e',
    emoji: '🔨',
    cssClass: 'status-started',
    label: 'Started',
    cssColorVar: '--color-started',
    cssDarkColorVar: '--color-started-dark',
  },
  notstarted: {
    color: '#94a3b8',
    darkColor: '#556270',
    emoji: '📋',
    cssClass: 'status-notstarted',
    label: 'Not Started',
    cssColorVar: '--color-notstarted',
    cssDarkColorVar: '--color-notstarted-dark',
  },
  planning: {
    color: '#a78bfa',
    darkColor: '#856fc8',
    emoji: '💭',
    cssClass: 'status-planning',
    label: 'Planning',
    cssColorVar: '--color-planning',
    cssDarkColorVar: '--color-planning-dark',
  },
  blocked: {
    color: '#f87171',
    darkColor: '#c65a5a',
    emoji: '🚧',
    cssClass: 'status-blocked',
    label: 'Blocked',
    cssColorVar: '--color-blocked',
    cssDarkColorVar: '--color-blocked-dark',
  },
};

/** Read a CSS custom property value from the document root. */
function getCssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/**
 * Re-read status colors from CSS custom properties.
 * Call after changing the data-theme attribute on <html>.
 */
export function refreshStatusColors(): void {
  for (const entry of Object.values(STATUS_MAP)) {
    const color = getCssVar(entry.cssColorVar);
    const darkColor = getCssVar(entry.cssDarkColorVar);
    if (color) entry.color = color;
    if (darkColor) entry.darkColor = darkColor;
  }
}

/** Get the primary color for a status. */
export function getStatusColor(status: Status): string {
  return STATUS_MAP[status]!.color;
}

/** Get the dark (fill) color for a status. */
export function getStatusDarkColor(status: Status): string {
  return STATUS_MAP[status]!.darkColor;
}

/** Get the emoji for a status. */
export function getStatusEmoji(status: Status): string {
  return STATUS_MAP[status]!.emoji;
}

/** Get the CSS class name for a status. */
export function getStatusClass(status: Status): string {
  return STATUS_MAP[status]!.cssClass;
}
