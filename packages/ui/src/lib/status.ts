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
}

/**
 * Maps every Status value to its visual representation.
 */
export const STATUS_MAP: Record<Status, StatusInfo> = {
  complete: {
    color: '#4ade80',
    darkColor: '#38b266',
    emoji: '🌿',
    cssClass: 'status-complete',
  },
  started: {
    color: '#facc15',
    darkColor: '#c8a311',
    emoji: '🔨',
    cssClass: 'status-started',
  },
  notstarted: {
    color: '#94a3b8',
    darkColor: '#768293',
    emoji: '📋',
    cssClass: 'status-notstarted',
  },
  planning: {
    color: '#a78bfa',
    darkColor: '#856fc8',
    emoji: '💭',
    cssClass: 'status-planning',
  },
  blocked: {
    color: '#f87171',
    darkColor: '#c65a5a',
    emoji: '🚧',
    cssClass: 'status-blocked',
  },
};

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
