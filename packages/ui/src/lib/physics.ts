// ---------------------------------------------------------------------------
// physics.ts — Physics configuration data layer for the graph visualisation.
// Pure TypeScript module: no Svelte runes, no stores, no external deps.
// ---------------------------------------------------------------------------

/** All tuneable physics parameters for the D3-force simulation. */
export interface PhysicsConfig {
  chargeStrength: number;
  chargeDistanceMax: number;
  linkStrength: number;
  minEdgeGap: number;
  collidePadding: number;
  collideStrength: number;
  layerSpacing: number;
  layerStrength: number;
  clusterStrength: number;
  velocityDecay: number;
}

/** Union of every valid physics parameter key. */
export type PhysicsParamKey = keyof PhysicsConfig;

/** Descriptor used by the UI to render a slider for a single parameter. */
export interface PhysicsSliderDef {
  key: PhysicsParamKey;
  label: string;
  group: 'Repulsion' | 'Links' | 'Collisions' | 'Layout' | 'Damping';
  min: number;
  max: number;
  step: number;
}

/** Ordered slider definitions — drives the physics-panel UI. */
export const PHYSICS_SLIDER_DEFS: readonly PhysicsSliderDef[] = [
  { key: 'chargeStrength',    label: 'Charge Strength',    group: 'Repulsion',   min: -1200, max: -50,  step: 10   },
  { key: 'chargeDistanceMax', label: 'Charge Range',       group: 'Repulsion',   min: 100,   max: 1500, step: 50   },
  { key: 'linkStrength',      label: 'Link Strength',      group: 'Links',       min: 0.05,  max: 1.0,  step: 0.05 },
  { key: 'minEdgeGap',        label: 'Edge Gap',           group: 'Links',       min: 20,    max: 200,  step: 5    },
  { key: 'collidePadding',    label: 'Collision Padding',  group: 'Collisions',  min: 0,     max: 40,   step: 2    },
  { key: 'collideStrength',   label: 'Collision Strength', group: 'Collisions',  min: 0.1,   max: 1.0,  step: 0.05 },
  { key: 'layerSpacing',      label: 'Layer Spacing',      group: 'Layout',      min: 80,    max: 400,  step: 10   },
  { key: 'layerStrength',     label: 'Layer Strength',     group: 'Layout',      min: 0.0,   max: 0.5,  step: 0.01 },
  { key: 'clusterStrength',   label: 'Cluster Strength',   group: 'Layout',      min: 0.0,   max: 0.5,  step: 0.01 },
  { key: 'velocityDecay',     label: 'Velocity Decay',     group: 'Damping',     min: 0.05,  max: 0.9,  step: 0.05 },
] as const;

// Set of valid config keys for fast membership checks.
const VALID_KEYS: ReadonlySet<string> = new Set<PhysicsParamKey>(
  PHYSICS_SLIDER_DEFS.map((d) => d.key),
);

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

/**
 * Return the default physics config for a graph of the given size.
 *
 * `chargeStrength` and `layerSpacing` vary with node count (threshold: 8).
 * All other values are fixed.
 */
export function getDefaults(nodeCount: number): PhysicsConfig {
  const large = nodeCount > 8;
  return {
    chargeStrength:    large ? -600 : -350,
    chargeDistanceMax: 600,
    linkStrength:      0.7,
    minEdgeGap:        80,
    collidePadding:    16,
    collideStrength:   0.9,
    layerSpacing:      large ? 220 : 180,
    layerStrength:     0.12,
    clusterStrength:   0.15,
    velocityDecay:     0.45,
  };
}

// ---------------------------------------------------------------------------
// localStorage persistence
// ---------------------------------------------------------------------------

const STORAGE_KEY = 'bacchus-physics';

/**
 * Load user overrides previously saved to `localStorage`.
 *
 * Returns only the keys that are valid `PhysicsConfig` keys with numeric
 * values. Returns an empty object when nothing is stored or parsing fails.
 */
export function loadOverrides(): Partial<PhysicsConfig> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw == null) return {};
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {};

    const result: Partial<PhysicsConfig> = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (VALID_KEYS.has(k) && typeof v === 'number' && Number.isFinite(v)) {
        (result as Record<string, number>)[k] = v;
      }
    }
    return result;
  } catch {
    return {};
  }
}

// Debounce timer handle for `saveOverrides`.
let debounceTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Persist user overrides to `localStorage` (debounced — 200 ms).
 *
 * If `overrides` is an empty object the stored key is removed instead.
 */
export function saveOverrides(overrides: Partial<PhysicsConfig>): void {
  if (debounceTimer !== null) {
    clearTimeout(debounceTimer);
  }
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    if (Object.keys(overrides).length === 0) {
      localStorage.removeItem(STORAGE_KEY);
    } else {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides));
    }
  }, 200);
}

/**
 * Remove all persisted physics overrides and cancel any pending save.
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
 * Merge defaults (based on `nodeCount`) with explicit user overrides.
 *
 * Overrides take precedence; any key not present in `overrides` falls back to
 * the default value.
 */
export function resolveConfig(
  nodeCount: number,
  overrides: Partial<PhysicsConfig>,
): PhysicsConfig {
  return { ...getDefaults(nodeCount), ...overrides };
}
