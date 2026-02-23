// ---------------------------------------------------------------------------
// visuals.ts — Visual configuration data layer for the graph visualisation.
// Pure TypeScript module: no Svelte runes, no stores, no external deps.
// ---------------------------------------------------------------------------

/** All tuneable visual parameters for graph rendering. */
export interface VisualsConfig {
  // ── Glow ──
  glowBlurRadius: number;
  glowStrokeWidth: number;
  glowBaseOpacity: number;
  glowPulseMin: number;
  glowPulseMax: number;
  glowPulseDuration: number;
  glowRadiusOffset: number;

  // ── Dimming ──
  dimmedNodeOpacity: number;
  dimmedEdgeOpacity: number;
  defaultEdgeOpacity: number;
  highlightedEdgeOpacity: number;

  // ── Edges ──
  vineStrokeWidth: number;
  vineWaveAmplitude: number;
  vineWaveFrequency: number;
  vineSegments: number;
  leafScale: number;
  leafOpacity: number;
  edgeFlowDuration: number;

  // ── Animations ──
  shimmerDuration: number;
  leafSwayAngle: number;
  leafSwayDuration: number;
  entryStaggerDelay: number;

  // ── Sizing ──
  nodeRadiusMin: number;
  nodeRadiusMax: number;
  emojiBadgeRadius: number;
  emojiFontSize: number;

  // ── Sprite ──
  globalSpriteOverride: string;
}

/** Union of every valid visual parameter key. */
export type VisualsParamKey = keyof VisualsConfig;

/** The set of keys that are numeric sliders (everything except globalSpriteOverride). */
export type VisualsSliderKey = Exclude<VisualsParamKey, 'globalSpriteOverride'>;

/** Descriptor used by the UI to render a slider for a single parameter. */
export interface VisualsSliderDef {
  key: VisualsSliderKey;
  label: string;
  group: 'Glow' | 'Dimming' | 'Edges' | 'Animations' | 'Sizing';
  min: number;
  max: number;
  step: number;
}

/** Ordered slider definitions — drives the visuals-panel UI. */
export const VISUALS_SLIDER_DEFS: readonly VisualsSliderDef[] = [
  // ── Glow ──
  {
    key: 'glowBlurRadius',
    label: 'Glow Blur',
    group: 'Glow',
    min: 0,
    max: 15,
    step: 0.5,
  },
  {
    key: 'glowStrokeWidth',
    label: 'Glow Stroke',
    group: 'Glow',
    min: 0.5,
    max: 8,
    step: 0.5,
  },
  {
    key: 'glowBaseOpacity',
    label: 'Glow Opacity',
    group: 'Glow',
    min: 0,
    max: 1,
    step: 0.05,
  },
  {
    key: 'glowPulseMin',
    label: 'Pulse Min',
    group: 'Glow',
    min: 0,
    max: 1,
    step: 0.05,
  },
  {
    key: 'glowPulseMax',
    label: 'Pulse Max',
    group: 'Glow',
    min: 0,
    max: 1,
    step: 0.05,
  },
  {
    key: 'glowPulseDuration',
    label: 'Pulse Speed',
    group: 'Glow',
    min: 0.5,
    max: 8,
    step: 0.5,
  },
  {
    key: 'glowRadiusOffset',
    label: 'Ring Offset',
    group: 'Glow',
    min: 0,
    max: 20,
    step: 1,
  },

  // ── Dimming ──
  {
    key: 'dimmedNodeOpacity',
    label: 'Dimmed Nodes',
    group: 'Dimming',
    min: 0,
    max: 1,
    step: 0.05,
  },
  {
    key: 'dimmedEdgeOpacity',
    label: 'Dimmed Edges',
    group: 'Dimming',
    min: 0,
    max: 1,
    step: 0.05,
  },
  {
    key: 'defaultEdgeOpacity',
    label: 'Default Edges',
    group: 'Dimming',
    min: 0,
    max: 1,
    step: 0.05,
  },
  {
    key: 'highlightedEdgeOpacity',
    label: 'Focused Edges',
    group: 'Dimming',
    min: 0,
    max: 1,
    step: 0.05,
  },

  // ── Edges ──
  {
    key: 'vineStrokeWidth',
    label: 'Vine Width',
    group: 'Edges',
    min: 0.5,
    max: 8,
    step: 0.5,
  },
  {
    key: 'vineWaveAmplitude',
    label: 'Wave Amplitude',
    group: 'Edges',
    min: 0,
    max: 20,
    step: 1,
  },
  {
    key: 'vineWaveFrequency',
    label: 'Wave Frequency',
    group: 'Edges',
    min: 0,
    max: 10,
    step: 0.5,
  },
  {
    key: 'vineSegments',
    label: 'Vine Segments',
    group: 'Edges',
    min: 2,
    max: 20,
    step: 1,
  },
  {
    key: 'leafScale',
    label: 'Leaf Scale',
    group: 'Edges',
    min: 0.5,
    max: 6,
    step: 0.1,
  },
  {
    key: 'leafOpacity',
    label: 'Leaf Opacity',
    group: 'Edges',
    min: 0,
    max: 1,
    step: 0.05,
  },
  {
    key: 'edgeFlowDuration',
    label: 'Flow Speed',
    group: 'Edges',
    min: 0.5,
    max: 8,
    step: 0.5,
  },

  // ── Animations ──
  {
    key: 'shimmerDuration',
    label: 'Shimmer Speed',
    group: 'Animations',
    min: 1,
    max: 20,
    step: 0.5,
  },
  {
    key: 'leafSwayAngle',
    label: 'Sway Angle',
    group: 'Animations',
    min: 0,
    max: 15,
    step: 1,
  },
  {
    key: 'leafSwayDuration',
    label: 'Sway Speed',
    group: 'Animations',
    min: 1,
    max: 12,
    step: 0.5,
  },
  {
    key: 'entryStaggerDelay',
    label: 'Entry Stagger',
    group: 'Animations',
    min: 20,
    max: 300,
    step: 10,
  },

  // ── Sizing ──
  {
    key: 'nodeRadiusMin',
    label: 'Min Radius',
    group: 'Sizing',
    min: 20,
    max: 80,
    step: 2,
  },
  {
    key: 'nodeRadiusMax',
    label: 'Max Radius',
    group: 'Sizing',
    min: 30,
    max: 120,
    step: 2,
  },
  {
    key: 'emojiBadgeRadius',
    label: 'Badge Size',
    group: 'Sizing',
    min: 6,
    max: 24,
    step: 1,
  },
  {
    key: 'emojiFontSize',
    label: 'Badge Font',
    group: 'Sizing',
    min: 8,
    max: 28,
    step: 1,
  },
] as const;

// Set of valid numeric config keys for fast membership checks.
const VALID_SLIDER_KEYS: ReadonlySet<string> = new Set<VisualsSliderKey>(
  VISUALS_SLIDER_DEFS.map((d) => d.key),
);

// All valid keys including the string-typed sprite override.
const VALID_KEYS: ReadonlySet<string> = new Set<string>([
  ...VALID_SLIDER_KEYS,
  'globalSpriteOverride',
]);

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

/**
 * Return the default visuals config.
 *
 * Values match the hardcoded constants previously scattered across
 * GraphNode.svelte, GraphEdge.svelte, app.css, and types.ts.
 */
export function getDefaults(): VisualsConfig {
  return {
    // Glow
    glowBlurRadius: 3.5,
    glowStrokeWidth: 2.5,
    glowBaseOpacity: 0.6,
    glowPulseMin: 0.4,
    glowPulseMax: 0.8,
    glowPulseDuration: 2,
    glowRadiusOffset: 6,

    // Dimming
    dimmedNodeOpacity: 0.45,
    dimmedEdgeOpacity: 0.15,
    defaultEdgeOpacity: 0.6,
    highlightedEdgeOpacity: 1.0,

    // Edges
    vineStrokeWidth: 2.5,
    vineWaveAmplitude: 5,
    vineWaveFrequency: 3,
    vineSegments: 8,
    leafScale: 2.2,
    leafOpacity: 0.4,
    edgeFlowDuration: 2,

    // Animations
    shimmerDuration: 6,
    leafSwayAngle: 3,
    leafSwayDuration: 4,
    entryStaggerDelay: 80,

    // Sizing
    nodeRadiusMin: 40,
    nodeRadiusMax: 60,
    emojiBadgeRadius: 12,
    emojiFontSize: 14,

    // Sprite
    globalSpriteOverride: '',
  };
}

// ---------------------------------------------------------------------------
// localStorage persistence
// ---------------------------------------------------------------------------

const STORAGE_KEY = 'bacchus-visuals';

/**
 * Read the raw stored object from `localStorage`.
 *
 * Returns an empty object when nothing is stored or parsing fails.
 */
function readStoredObject(): Record<string, unknown> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw == null) return {};
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed))
      return {};
    return parsed as Record<string, unknown>;
  } catch {
    return {};
  }
}

/**
 * Load user overrides previously saved to `localStorage`.
 *
 * Returns only the keys that are valid `VisualsConfig` keys with the
 * correct types. Returns an empty object when nothing is stored.
 */
export function loadOverrides(): Partial<VisualsConfig> {
  const stored = readStoredObject();
  const result: Partial<VisualsConfig> = {};
  for (const [k, v] of Object.entries(stored)) {
    if (k === 'globalSpriteOverride' && typeof v === 'string') {
      result.globalSpriteOverride = v;
    } else if (
      VALID_SLIDER_KEYS.has(k) &&
      typeof v === 'number' &&
      Number.isFinite(v)
    ) {
      (result as Record<string, number>)[k] = v;
    }
  }
  return result;
}

// Debounce timer handle for `saveOverrides`.
let debounceTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Persist user overrides to `localStorage` (debounced — 200 ms).
 *
 * If all data has been cleared the key is removed entirely.
 */
export function saveOverrides(overrides: Partial<VisualsConfig>): void {
  if (debounceTimer !== null) {
    clearTimeout(debounceTimer);
  }
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    const cleaned: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(overrides)) {
      if (VALID_KEYS.has(k)) {
        cleaned[k] = v;
      }
    }
    if (Object.keys(cleaned).length === 0) {
      localStorage.removeItem(STORAGE_KEY);
    } else {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(cleaned));
    }
  }, 200);
}

/**
 * Remove all persisted visual overrides and cancel any pending save.
 */
export function clearOverrides(): void {
  if (debounceTimer !== null) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
  localStorage.removeItem(STORAGE_KEY);
}

// ---------------------------------------------------------------------------
// Resolution
// ---------------------------------------------------------------------------

/**
 * Merge defaults with explicit user overrides.
 *
 * Overrides take precedence; any key not present in `overrides` falls back to
 * the default value.
 */
export function resolveConfig(
  overrides: Partial<VisualsConfig>,
): VisualsConfig {
  return { ...getDefaults(), ...overrides };
}

// ---------------------------------------------------------------------------
// CSS injection
// ---------------------------------------------------------------------------

/**
 * Apply the current visuals config as CSS custom properties on `:root`.
 *
 * This allows CSS animations (keyframes, animation durations) to reference
 * the tuneable values without needing inline styles on every element.
 */
export function injectVisualsCSS(config: VisualsConfig): void {
  const style = document.documentElement.style;

  // Glow pulse
  style.setProperty('--vis-glow-pulse-min', String(config.glowPulseMin));
  style.setProperty('--vis-glow-pulse-max', String(config.glowPulseMax));
  style.setProperty(
    '--vis-glow-pulse-duration',
    `${String(config.glowPulseDuration)}s`,
  );

  // Shimmer
  style.setProperty(
    '--vis-shimmer-duration',
    `${String(config.shimmerDuration)}s`,
  );

  // Edge flow
  style.setProperty(
    '--vis-edge-flow-duration',
    `${String(config.edgeFlowDuration)}s`,
  );

  // Leaf sway
  style.setProperty(
    '--vis-leaf-sway-angle',
    `${String(config.leafSwayAngle)}deg`,
  );
  style.setProperty(
    '--vis-leaf-sway-duration',
    `${String(config.leafSwayDuration)}s`,
  );
}
