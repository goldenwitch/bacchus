import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  PHYSICS_SLIDER_DEFS,
  getDefaults,
  loadOverrides,
  saveOverrides,
  clearOverrides,
  resolveConfig,
  DEFAULT_STRATA_LINES,
  loadStrataOverride,
  saveStrataOverride,
} from '../src/lib/physics.js';

// ---------------------------------------------------------------------------
// PHYSICS_SLIDER_DEFS
// ---------------------------------------------------------------------------
describe('PHYSICS_SLIDER_DEFS', () => {
  it('has 12 entries', () => {
    expect(PHYSICS_SLIDER_DEFS).toHaveLength(12);
  });

  it('each key is unique', () => {
    const keys = PHYSICS_SLIDER_DEFS.map((d) => d.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('contains all six groups', () => {
    const groups = new Set(PHYSICS_SLIDER_DEFS.map((d) => d.group));
    expect(groups).toEqual(
      new Set([
        'Repulsion',
        'Links',
        'Collisions',
        'Layout',
        'Centering',
        'Damping',
      ]),
    );
  });
});

// ---------------------------------------------------------------------------
// getDefaults
// ---------------------------------------------------------------------------
describe('getDefaults', () => {
  it('returns correct defaults', () => {
    const cfg = getDefaults(4);
    expect(cfg.chargeStrength).toBe(-10);
    expect(cfg.chargeDistanceMax).toBe(10);
    expect(cfg.linkStrength).toBe(0.01);
    expect(cfg.minEdgeGap).toBe(2);
    expect(cfg.collidePadding).toBe(40);
    expect(cfg.collideStrength).toBe(1.0);
    expect(cfg.layerSpacing).toBe(118);
    expect(cfg.layerStrength).toBe(5.0);
    expect(cfg.layerExponent).toBe(0.9);
    expect(cfg.clusterStrength).toBe(0.0);
    expect(cfg.velocityDecay).toBe(0.25);
  });

  it('returns same defaults regardless of node count', () => {
    const small = getDefaults(4);
    const large = getDefaults(20);
    expect(small).toEqual(large);
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
    expect(loadOverrides()).toEqual({
      chargeStrength: -500,
      linkStrength: 0.3,
    });
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
    localStorage.setItem(
      'bacchus-physics',
      JSON.stringify({ linkStrength: 0.5 }),
    );
    saveOverrides({});
    vi.advanceTimersByTime(200);
    expect(localStorage.getItem('bacchus-physics')).toBeNull();
  });

  it('preserves non-physics keys when saving overrides', () => {
    localStorage.setItem(
      'bacchus-physics',
      JSON.stringify({ showStrataLines: false }),
    );
    saveOverrides({ chargeStrength: -500 });
    vi.advanceTimersByTime(200);
    const stored = JSON.parse(localStorage.getItem('bacchus-physics')!);
    expect(stored).toEqual({ showStrataLines: false, chargeStrength: -500 });
  });

  it('removes key when overrides empty and no non-physics keys', () => {
    localStorage.setItem(
      'bacchus-physics',
      JSON.stringify({ linkStrength: 0.5 }),
    );
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
    localStorage.setItem(
      'bacchus-physics',
      JSON.stringify({ linkStrength: 0.5 }),
    );
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

// ---------------------------------------------------------------------------
// DEFAULT_STRATA_LINES
// ---------------------------------------------------------------------------
describe('DEFAULT_STRATA_LINES', () => {
  it('is true', () => {
    expect(DEFAULT_STRATA_LINES).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// loadStrataOverride
// ---------------------------------------------------------------------------
describe('loadStrataOverride', () => {
  beforeEach(() => {
    localStorage.removeItem('bacchus-physics');
  });

  it('returns default when nothing stored', () => {
    expect(loadStrataOverride()).toBe(DEFAULT_STRATA_LINES);
  });

  it('returns stored boolean value', () => {
    localStorage.setItem(
      'bacchus-physics',
      JSON.stringify({ showStrataLines: false }),
    );
    expect(loadStrataOverride()).toBe(false);
  });

  it('returns default when stored value is not a boolean', () => {
    localStorage.setItem(
      'bacchus-physics',
      JSON.stringify({ showStrataLines: 42 }),
    );
    expect(loadStrataOverride()).toBe(DEFAULT_STRATA_LINES);
  });

  it('returns default when stored JSON is invalid', () => {
    localStorage.setItem('bacchus-physics', '{bad json');
    expect(loadStrataOverride()).toBe(DEFAULT_STRATA_LINES);
  });

  it('coexists with physics overrides', () => {
    localStorage.setItem(
      'bacchus-physics',
      JSON.stringify({ chargeStrength: -500, showStrataLines: false }),
    );
    expect(loadStrataOverride()).toBe(false);
    expect(loadOverrides()).toEqual({ chargeStrength: -500 });
  });
});

// ---------------------------------------------------------------------------
// saveStrataOverride
// ---------------------------------------------------------------------------
describe('saveStrataOverride', () => {
  beforeEach(() => {
    localStorage.removeItem('bacchus-physics');
  });

  it('stores non-default value', () => {
    saveStrataOverride(false);
    const stored = JSON.parse(localStorage.getItem('bacchus-physics')!);
    expect(stored.showStrataLines).toBe(false);
  });

  it('removes key when value matches default and no other data exists', () => {
    localStorage.setItem(
      'bacchus-physics',
      JSON.stringify({ showStrataLines: false }),
    );
    saveStrataOverride(DEFAULT_STRATA_LINES);
    expect(localStorage.getItem('bacchus-physics')).toBeNull();
  });

  it('preserves physics overrides when saving strata', () => {
    localStorage.setItem(
      'bacchus-physics',
      JSON.stringify({ chargeStrength: -500 }),
    );
    saveStrataOverride(false);
    const stored = JSON.parse(localStorage.getItem('bacchus-physics')!);
    expect(stored).toEqual({ chargeStrength: -500, showStrataLines: false });
  });

  it('removes only strata key when resetting to default', () => {
    localStorage.setItem(
      'bacchus-physics',
      JSON.stringify({ chargeStrength: -500, showStrataLines: false }),
    );
    saveStrataOverride(DEFAULT_STRATA_LINES);
    const stored = JSON.parse(localStorage.getItem('bacchus-physics')!);
    expect(stored).toEqual({ chargeStrength: -500 });
  });
});
