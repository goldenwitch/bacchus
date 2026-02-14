import { describe, it, expect } from 'vitest';
import type { Status } from '@bacchus/core';
import {
  STATUS_MAP,
  getStatusColor,
  getStatusDarkColor,
  getStatusEmoji,
  getStatusClass,
} from '../src/lib/status.js';

const ALL_STATUSES: Status[] = [
  'complete',
  'started',
  'notstarted',
  'planning',
  'blocked',
];

describe('STATUS_MAP', () => {
  it('has an entry for every Status value', () => {
    for (const s of ALL_STATUSES) {
      expect(STATUS_MAP[s]).toBeDefined();
    }
  });

  it('has exactly 5 entries (no extras, no missing)', () => {
    expect(Object.keys(STATUS_MAP)).toHaveLength(5);
    expect(new Set(Object.keys(STATUS_MAP))).toEqual(new Set(ALL_STATUSES));
  });

  it.each(ALL_STATUSES)(
    '%s has color (hex), darkColor, emoji, and cssClass (.status-*)',
    (status) => {
      const info = STATUS_MAP[status];
      expect(info.color).toMatch(/^#[0-9a-fA-F]{6}$/);
      expect(info.darkColor).toMatch(/^#[0-9a-fA-F]{6}$/);
      // emoji is a single visible character (may be multi-codepoint)
      expect(info.emoji.length).toBeGreaterThanOrEqual(1);
      expect(info.cssClass).toMatch(/^status-/);
    },
  );

  it('colors match the spec values', () => {
    expect(STATUS_MAP.complete.color).toBe('#4ade80');
    expect(STATUS_MAP.started.color).toBe('#facc15');
    expect(STATUS_MAP.notstarted.color).toBe('#94a3b8');
    expect(STATUS_MAP.planning.color).toBe('#a78bfa');
    expect(STATUS_MAP.blocked.color).toBe('#f87171');
  });
});

describe('getStatusColor', () => {
  it.each(ALL_STATUSES)('returns the correct color for %s', (status) => {
    expect(getStatusColor(status)).toBe(STATUS_MAP[status].color);
  });
});

describe('getStatusEmoji', () => {
  it.each(ALL_STATUSES)('returns the correct emoji for %s', (status) => {
    expect(getStatusEmoji(status)).toBe(STATUS_MAP[status].emoji);
  });
});

describe('getStatusClass', () => {
  it.each(ALL_STATUSES)('returns the correct CSS class for %s', (status) => {
    expect(getStatusClass(status)).toBe(STATUS_MAP[status].cssClass);
  });
});

describe('getStatusDarkColor', () => {
  it.each(ALL_STATUSES)('returns the correct dark color for %s', (status) => {
    expect(getStatusDarkColor(status)).toBe(STATUS_MAP[status].darkColor);
  });
});
