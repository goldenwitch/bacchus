import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  VISUALS_SLIDER_DEFS,
  getDefaults,
  loadOverrides,
  saveOverrides,
  clearOverrides,
  resolveConfig,
  injectVisualsCSS,
} from '../src/lib/visuals.js';

// ---------------------------------------------------------------------------
// VISUALS_SLIDER_DEFS
// ---------------------------------------------------------------------------
describe('VISUALS_SLIDER_DEFS', () => {
  it('has 26 entries', () => {
    expect(VISUALS_SLIDER_DEFS).toHaveLength(26);
  });

  it('each key is unique', () => {
    const keys = VISUALS_SLIDER_DEFS.map((d) => d.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('contains all five groups', () => {
    const groups = new Set(VISUALS_SLIDER_DEFS.map((d) => d.group));
    expect(groups).toEqual(
      new Set(['Glow', 'Dimming', 'Edges', 'Animations', 'Sizing']),
    );
  });

  it('each slider has valid min < max', () => {
    for (const def of VISUALS_SLIDER_DEFS) {
      expect(def.min).toBeLessThan(def.max);
    }
  });

  it('each slider step is positive', () => {
    for (const def of VISUALS_SLIDER_DEFS) {
      expect(def.step).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// getDefaults
// ---------------------------------------------------------------------------
describe('getDefaults', () => {
  it('returns a complete config object', () => {
    const cfg = getDefaults();
    expect(cfg.glowBlurRadius).toBe(3.5);
    expect(cfg.glowStrokeWidth).toBe(2.5);
    expect(cfg.glowBaseOpacity).toBe(0.6);
    expect(cfg.glowPulseMin).toBe(0.4);
    expect(cfg.glowPulseMax).toBe(0.8);
    expect(cfg.glowPulseDuration).toBe(2);
    expect(cfg.glowRadiusOffset).toBe(6);

    expect(cfg.dimmedNodeOpacity).toBe(0.45);
    expect(cfg.dimmedEdgeOpacity).toBe(0.15);
    expect(cfg.defaultEdgeOpacity).toBe(0.6);
    expect(cfg.highlightedEdgeOpacity).toBe(1.0);

    expect(cfg.vineStrokeWidth).toBe(2.5);
    expect(cfg.vineWaveAmplitude).toBe(5);
    expect(cfg.vineWaveFrequency).toBe(3);
    expect(cfg.vineSegments).toBe(8);
    expect(cfg.leafScale).toBe(2.2);
    expect(cfg.leafOpacity).toBe(0.4);
    expect(cfg.edgeFlowDuration).toBe(2);

    expect(cfg.shimmerDuration).toBe(6);
    expect(cfg.leafSwayAngle).toBe(3);
    expect(cfg.leafSwayDuration).toBe(4);
    expect(cfg.entryStaggerDelay).toBe(80);

    expect(cfg.nodeRadiusMin).toBe(40);
    expect(cfg.nodeRadiusMax).toBe(60);
    expect(cfg.emojiBadgeRadius).toBe(12);
    expect(cfg.emojiFontSize).toBe(14);

    expect(cfg.globalSpriteOverride).toBe('');
  });

  it('all numeric values are finite', () => {
    const cfg = getDefaults();
    for (const [key, value] of Object.entries(cfg)) {
      if (key === 'globalSpriteOverride') continue;
      expect(typeof value).toBe('number');
      expect(Number.isFinite(value)).toBe(true);
    }
  });

  it('returns a new object each call', () => {
    const a = getDefaults();
    const b = getDefaults();
    expect(a).toEqual(b);
    expect(a).not.toBe(b);
  });
});

// ---------------------------------------------------------------------------
// loadOverrides
// ---------------------------------------------------------------------------
describe('loadOverrides', () => {
  beforeEach(() => {
    localStorage.removeItem('bacchus-visuals');
    vi.restoreAllMocks();
  });

  it('returns empty object when nothing stored', () => {
    expect(loadOverrides()).toEqual({});
  });

  it('returns parsed numeric overrides from localStorage', () => {
    localStorage.setItem(
      'bacchus-visuals',
      JSON.stringify({ glowBlurRadius: 5, vineStrokeWidth: 4 }),
    );
    expect(loadOverrides()).toEqual({
      glowBlurRadius: 5,
      vineStrokeWidth: 4,
    });
  });

  it('returns string sprite override', () => {
    localStorage.setItem(
      'bacchus-visuals',
      JSON.stringify({ globalSpriteOverride: './custom.svg' }),
    );
    expect(loadOverrides()).toEqual({
      globalSpriteOverride: './custom.svg',
    });
  });

  it('ignores invalid keys', () => {
    localStorage.setItem(
      'bacchus-visuals',
      JSON.stringify({ fakeKey: 123, glowBlurRadius: 5 }),
    );
    expect(loadOverrides()).toEqual({ glowBlurRadius: 5 });
  });

  it('ignores non-numeric values for slider keys', () => {
    localStorage.setItem(
      'bacchus-visuals',
      JSON.stringify({ glowBlurRadius: 'not-a-number' }),
    );
    expect(loadOverrides()).toEqual({});
  });

  it('ignores NaN and Infinity', () => {
    localStorage.setItem(
      'bacchus-visuals',
      JSON.stringify({ glowBlurRadius: null, vineStrokeWidth: 'Infinity' }),
    );
    expect(loadOverrides()).toEqual({});
  });

  it('handles corrupt JSON gracefully', () => {
    localStorage.setItem('bacchus-visuals', '{bad json');
    expect(loadOverrides()).toEqual({});
  });

  it('handles non-object JSON gracefully', () => {
    localStorage.setItem('bacchus-visuals', '"just a string"');
    expect(loadOverrides()).toEqual({});
  });
});

// ---------------------------------------------------------------------------
// saveOverrides
// ---------------------------------------------------------------------------
describe('saveOverrides', () => {
  beforeEach(() => {
    localStorage.removeItem('bacchus-visuals');
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    localStorage.removeItem('bacchus-visuals');
  });

  it('persists overrides after debounce', () => {
    saveOverrides({ glowBlurRadius: 7 });
    expect(localStorage.getItem('bacchus-visuals')).toBeNull();
    vi.advanceTimersByTime(200);
    expect(JSON.parse(localStorage.getItem('bacchus-visuals')!)).toEqual({
      glowBlurRadius: 7,
    });
  });

  it('debounces rapid calls', () => {
    saveOverrides({ glowBlurRadius: 1 });
    vi.advanceTimersByTime(100);
    saveOverrides({ glowBlurRadius: 2 });
    vi.advanceTimersByTime(100);
    saveOverrides({ glowBlurRadius: 3 });
    vi.advanceTimersByTime(200);
    expect(JSON.parse(localStorage.getItem('bacchus-visuals')!)).toEqual({
      glowBlurRadius: 3,
    });
  });

  it('removes key when overrides are empty', () => {
    localStorage.setItem('bacchus-visuals', JSON.stringify({ glowBlurRadius: 5 }));
    saveOverrides({});
    vi.advanceTimersByTime(200);
    expect(localStorage.getItem('bacchus-visuals')).toBeNull();
  });

  it('persists sprite override as string', () => {
    saveOverrides({ globalSpriteOverride: './sprites/custom.svg' });
    vi.advanceTimersByTime(200);
    expect(JSON.parse(localStorage.getItem('bacchus-visuals')!)).toEqual({
      globalSpriteOverride: './sprites/custom.svg',
    });
  });
});

// ---------------------------------------------------------------------------
// clearOverrides
// ---------------------------------------------------------------------------
describe('clearOverrides', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    localStorage.removeItem('bacchus-visuals');
  });

  it('removes the localStorage key', () => {
    localStorage.setItem('bacchus-visuals', JSON.stringify({ glowBlurRadius: 5 }));
    clearOverrides();
    expect(localStorage.getItem('bacchus-visuals')).toBeNull();
  });

  it('cancels pending save', () => {
    saveOverrides({ glowBlurRadius: 10 });
    clearOverrides();
    vi.advanceTimersByTime(200);
    expect(localStorage.getItem('bacchus-visuals')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// resolveConfig
// ---------------------------------------------------------------------------
describe('resolveConfig', () => {
  it('returns defaults when given empty overrides', () => {
    expect(resolveConfig({})).toEqual(getDefaults());
  });

  it('overrides a single key', () => {
    const cfg = resolveConfig({ glowBlurRadius: 10 });
    expect(cfg.glowBlurRadius).toBe(10);
    expect(cfg.glowStrokeWidth).toBe(2.5); // default preserved
  });

  it('overrides multiple keys', () => {
    const cfg = resolveConfig({
      dimmedNodeOpacity: 0.2,
      vineStrokeWidth: 5,
      globalSpriteOverride: './test.svg',
    });
    expect(cfg.dimmedNodeOpacity).toBe(0.2);
    expect(cfg.vineStrokeWidth).toBe(5);
    expect(cfg.globalSpriteOverride).toBe('./test.svg');
    expect(cfg.glowBlurRadius).toBe(3.5); // default preserved
  });

  it('returns a new object each call', () => {
    const a = resolveConfig({});
    const b = resolveConfig({});
    expect(a).not.toBe(b);
  });
});

// ---------------------------------------------------------------------------
// injectVisualsCSS
// ---------------------------------------------------------------------------
describe('injectVisualsCSS', () => {
  it('sets CSS custom properties on document root', () => {
    const cfg = getDefaults();
    injectVisualsCSS(cfg);

    const style = document.documentElement.style;
    expect(style.getPropertyValue('--vis-glow-pulse-min')).toBe('0.4');
    expect(style.getPropertyValue('--vis-glow-pulse-max')).toBe('0.8');
    expect(style.getPropertyValue('--vis-glow-pulse-duration')).toBe('2s');
    expect(style.getPropertyValue('--vis-shimmer-duration')).toBe('6s');
    expect(style.getPropertyValue('--vis-edge-flow-duration')).toBe('2s');
    expect(style.getPropertyValue('--vis-leaf-sway-angle')).toBe('3deg');
    expect(style.getPropertyValue('--vis-leaf-sway-duration')).toBe('4s');
  });

  it('updates when config changes', () => {
    const cfg = { ...getDefaults(), glowPulseDuration: 5, shimmerDuration: 10 };
    injectVisualsCSS(cfg);

    const style = document.documentElement.style;
    expect(style.getPropertyValue('--vis-glow-pulse-duration')).toBe('5s');
    expect(style.getPropertyValue('--vis-shimmer-duration')).toBe('10s');
  });
});

// ---------------------------------------------------------------------------
// Round-trip: save → load → resolve
// ---------------------------------------------------------------------------
describe('round-trip persistence', () => {
  beforeEach(() => {
    localStorage.removeItem('bacchus-visuals');
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    localStorage.removeItem('bacchus-visuals');
  });

  it('save → load → resolve produces same overrides', () => {
    const overrides = {
      glowBlurRadius: 8,
      dimmedNodeOpacity: 0.3,
      globalSpriteOverride: './test.svg',
    };
    saveOverrides(overrides);
    vi.advanceTimersByTime(200);

    const loaded = loadOverrides();
    expect(loaded).toEqual(overrides);

    const cfg = resolveConfig(loaded);
    expect(cfg.glowBlurRadius).toBe(8);
    expect(cfg.dimmedNodeOpacity).toBe(0.3);
    expect(cfg.globalSpriteOverride).toBe('./test.svg');
    // Unchanged defaults
    expect(cfg.vineStrokeWidth).toBe(2.5);
  });
});
