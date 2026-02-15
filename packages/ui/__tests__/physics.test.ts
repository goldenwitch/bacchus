import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  PHYSICS_SLIDER_DEFS,
  getDefaults,
  loadOverrides,
  saveOverrides,
  clearOverrides,
  resolveConfig,
} from '../src/lib/physics.js';

// ---------------------------------------------------------------------------
// PHYSICS_SLIDER_DEFS
// ---------------------------------------------------------------------------
describe('PHYSICS_SLIDER_DEFS', () => {
  it('has 10 entries', () => {
    expect(PHYSICS_SLIDER_DEFS).toHaveLength(10);
  });

  it('each key is unique', () => {
    const keys = PHYSICS_SLIDER_DEFS.map((d) => d.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('contains all five groups', () => {
    const groups = new Set(PHYSICS_SLIDER_DEFS.map((d) => d.group));
    expect(groups).toEqual(
      new Set(['Repulsion', 'Links', 'Collisions', 'Layout', 'Damping']),
    );
  });
});

// ---------------------------------------------------------------------------
// getDefaults
// ---------------------------------------------------------------------------
describe('getDefaults', () => {
  it('returns correct small-graph defaults (n <= 8)', () => {
    const cfg = getDefaults(4);
    expect(cfg.chargeStrength).toBe(-350);
    expect(cfg.layerSpacing).toBe(180);
  });

  it('returns correct large-graph defaults (n > 8)', () => {
    const cfg = getDefaults(20);
    expect(cfg.chargeStrength).toBe(-600);
    expect(cfg.layerSpacing).toBe(220);
  });

  it('chargeStrength and layerSpacing differ between small/large', () => {
    const small = getDefaults(5);
    const large = getDefaults(12);
    expect(small.chargeStrength).not.toBe(large.chargeStrength);
    expect(small.layerSpacing).not.toBe(large.layerSpacing);
  });

  it('all values are finite numbers', () => {
    const cfg = getDefaults(4);
    for (const value of Object.values(cfg)) {
      expect(typeof value).toBe('number');
      expect(Number.isFinite(value)).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// loadOverrides
// ---------------------------------------------------------------------------
describe('loadOverrides', () => {
  beforeEach(() => {
    localStorage.removeItem('bacchus-physics');
    vi.restoreAllMocks();
  });

  it('returns empty object when nothing stored', () => {
    expect(loadOverrides()).toEqual({});
  });

  it('returns parsed overrides from localStorage', () => {
    localStorage.setItem(
      'bacchus-physics',
      JSON.stringify({ chargeStrength: -500, linkStrength: 0.3 }),
    );
    expect(loadOverrides()).toEqual({ chargeStrength: -500, linkStrength: 0.3 });
  });

  it('ignores invalid keys', () => {
    localStorage.setItem(
      'bacchus-physics',
      JSON.stringify({ bogusKey: 42, chargeStrength: -400 }),
    );
    const result = loadOverrides();
    expect(result).toEqual({ chargeStrength: -400 });
    expect(result).not.toHaveProperty('bogusKey');
  });

  it('ignores non-numeric values', () => {
    localStorage.setItem(
      'bacchus-physics',
      JSON.stringify({ chargeStrength: 'hello', linkStrength: 0.5 }),
    );
    expect(loadOverrides()).toEqual({ linkStrength: 0.5 });
  });

  it('returns empty on invalid JSON', () => {
    localStorage.setItem('bacchus-physics', '{not valid json!!!');
    expect(loadOverrides()).toEqual({});
  });

  it('returns empty on non-object stored values (array)', () => {
    localStorage.setItem('bacchus-physics', JSON.stringify([1, 2, 3]));
    expect(loadOverrides()).toEqual({});
  });

  it('returns empty on non-object stored values (null)', () => {
    localStorage.setItem('bacchus-physics', 'null');
    expect(loadOverrides()).toEqual({});
  });
});

// ---------------------------------------------------------------------------
// saveOverrides
// ---------------------------------------------------------------------------
describe('saveOverrides', () => {
  beforeEach(() => {
    localStorage.removeItem('bacchus-physics');
    vi.restoreAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('writes to localStorage after debounce', () => {
    saveOverrides({ chargeStrength: -500 });
    // Not written yet
    expect(localStorage.getItem('bacchus-physics')).toBeNull();

    vi.advanceTimersByTime(200);
    expect(JSON.parse(localStorage.getItem('bacchus-physics')!)).toEqual({
      chargeStrength: -500,
    });
  });

  it('removes key when overrides is empty', () => {
    localStorage.setItem('bacchus-physics', JSON.stringify({ linkStrength: 0.5 }));
    saveOverrides({});
    vi.advanceTimersByTime(200);
    expect(localStorage.getItem('bacchus-physics')).toBeNull();
  });

  it('cancels previous pending save when called again', () => {
    saveOverrides({ chargeStrength: -400 });
    vi.advanceTimersByTime(100);
    // Call again before debounce fires
    saveOverrides({ chargeStrength: -600 });
    vi.advanceTimersByTime(200);

    expect(JSON.parse(localStorage.getItem('bacchus-physics')!)).toEqual({
      chargeStrength: -600,
    });
  });
});

// ---------------------------------------------------------------------------
// clearOverrides
// ---------------------------------------------------------------------------
describe('clearOverrides', () => {
  beforeEach(() => {
    localStorage.removeItem('bacchus-physics');
    vi.restoreAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('removes localStorage key', () => {
    localStorage.setItem('bacchus-physics', JSON.stringify({ linkStrength: 0.5 }));
    clearOverrides();
    expect(localStorage.getItem('bacchus-physics')).toBeNull();
  });

  it('cancels pending saves', () => {
    saveOverrides({ chargeStrength: -500 });
    // Clear before debounce fires
    clearOverrides();
    vi.advanceTimersByTime(200);
    expect(localStorage.getItem('bacchus-physics')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// resolveConfig
// ---------------------------------------------------------------------------
describe('resolveConfig', () => {
  it('returns defaults when no overrides', () => {
    const cfg = resolveConfig(4, {});
    expect(cfg).toEqual(getDefaults(4));
  });

  it('overrides take precedence over defaults', () => {
    const cfg = resolveConfig(4, { chargeStrength: -999 });
    expect(cfg.chargeStrength).toBe(-999);
  });

  it('partial overrides keep other defaults', () => {
    const defaults = getDefaults(4);
    const cfg = resolveConfig(4, { linkStrength: 0.1 });
    expect(cfg.linkStrength).toBe(0.1);
    expect(cfg.chargeStrength).toBe(defaults.chargeStrength);
    expect(cfg.layerSpacing).toBe(defaults.layerSpacing);
    expect(cfg.velocityDecay).toBe(defaults.velocityDecay);
  });
});
