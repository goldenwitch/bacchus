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
  layerExponent: number;
  clusterStrength: number;
  centerStrength: number;
  velocityDecay: number;
}

/** Union of every valid physics parameter key. */
export type PhysicsParamKey = keyof PhysicsConfig;

/** Descriptor used by the UI to render a slider for a single parameter. */
export interface PhysicsSliderDef {
  key: PhysicsParamKey;
  label: string;
  group:
    | 'Repulsion'
    | 'Links'
    | 'Collisions'
    | 'Layout'
    | 'Damping'
    | 'Centering';
  min: number;
  max: number;
  step: number;
}

/** Ordered slider definitions — drives the physics-panel UI. */
export const PHYSICS_SLIDER_DEFS: readonly PhysicsSliderDef[] = [
  {
    key: 'chargeStrength',
    label: 'Charge Strength',
    group: 'Repulsion',
    min: -12000,
    max: -5,
    step: 10,
  },
  {
    key: 'chargeDistanceMax',
    label: 'Charge Range',
    group: 'Repulsion',
    min: 10,
    max: 15000,
    step: 50,
  },
  {
    key: 'linkStrength',
    label: 'Link Strength',
    group: 'Links',
    min: 0.005,
    max: 1.0,
    step: 0.005,
  },
  {
    key: 'minEdgeGap',
    label: 'Edge Gap',
    group: 'Links',
    min: 2,
    max: 2000,
    step: 5,
  },
  {
    key: 'collidePadding',
    label: 'Collision Padding',
    group: 'Collisions',
    min: 0,
    max: 400,
    step: 2,
  },
  {
    key: 'collideStrength',
    label: 'Collision Strength',
    group: 'Collisions',
    min: 0.01,
    max: 1.0,
    step: 0.01,
  },
  {
    key: 'layerSpacing',
    label: 'Layer Spacing',
    group: 'Layout',
    min: 8,
    max: 4000,
    step: 10,
  },
  {
    key: 'layerStrength',
    label: 'Layer Strength',
    group: 'Layout',
    min: 0.0,
    max: 5.0,
    step: 0.01,
  },
  {
    key: 'layerExponent',
    label: 'Layer Exponent',
    group: 'Layout',
    min: 0.1,
    max: 3.0,
    step: 0.1,
  },
  {
    key: 'clusterStrength',
    label: 'Cluster Strength',
    group: 'Layout',
    min: 0.0,
    max: 5.0,
    step: 0.01,
  },
  {
    key: 'centerStrength',
    label: 'Centering Strength',
    group: 'Centering',
    min: 0.0,
    max: 0.5,
    step: 0.005,
  },
  {
    key: 'velocityDecay',
    label: 'Velocity Decay',
    group: 'Damping',
    min: 0.005,
    max: 0.95,
    step: 0.005,
  },
] as const;

// Set of valid config keys for fast membership checks.
const VALID_KEYS: ReadonlySet<string> = new Set<PhysicsParamKey>(
  PHYSICS_SLIDER_DEFS.map((d) => d.key),
);

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

/**
 * Return the default physics config.
 *
 * Tuned for a balanced layout across graph sizes.
 */
export function getDefaults(): PhysicsConfig {
  return {
    chargeStrength: -10,
    chargeDistanceMax: 10,
    linkStrength: 0.01,
    minEdgeGap: 2,
    collidePadding: 40,
    collideStrength: 1.0,
    layerSpacing: 118,
    layerStrength: 5.0,
    layerExponent: 0.9,
    clusterStrength: 0.0,
    centerStrength: 0.02,
    velocityDecay: 0.25,
  };
}

// ---------------------------------------------------------------------------
// localStorage persistence
// ---------------------------------------------------------------------------

const STORAGE_KEY = 'bacchus-physics';

/** Default value for the strata-lines toggle. */
export const DEFAULT_STRATA_LINES = true;

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
 * Returns only the keys that are valid `PhysicsConfig` keys with numeric
 * values. Returns an empty object when nothing is stored or parsing fails.
 */
export function loadOverrides(): Partial<PhysicsConfig> {
  const stored = readStoredObject();
  const result: Partial<PhysicsConfig> = {};
  for (const [k, v] of Object.entries(stored)) {
    if (VALID_KEYS.has(k) && typeof v === 'number' && Number.isFinite(v)) {
      (result as Record<string, number>)[k] = v;
    }
  }
  return result;
}

/**
 * Load the strata-lines preference from the same storage key.
 *
 * Returns `DEFAULT_STRATA_LINES` when nothing is stored.
 */
export function loadStrataOverride(): boolean {
  const stored = readStoredObject();
  if (typeof stored.showStrataLines === 'boolean')
    return stored.showStrataLines;
  return DEFAULT_STRATA_LINES;
}

/**
 * Persist the strata-lines preference alongside physics overrides.
 *
 * Only stores a non-default value; removes the key when it matches the default
 * and no other data is present.
 */
export function saveStrataOverride(show: boolean): void {
  const stored = readStoredObject();
  if (show === DEFAULT_STRATA_LINES) {
    delete stored.showStrataLines;
  } else {
    stored.showStrataLines = show;
  }
  if (Object.keys(stored).length === 0) {
    localStorage.removeItem(STORAGE_KEY);
  } else {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
  }
}

// Debounce timer handle for `saveOverrides`.
let debounceTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Persist user overrides to `localStorage` (debounced — 200 ms).
 *
 * Preserves non-physics keys (e.g. `showStrataLines`) already stored under
 * the same key.  If all data has been cleared the key is removed entirely.
 */
export function saveOverrides(overrides: Partial<PhysicsConfig>): void {
  if (debounceTimer !== null) {
    clearTimeout(debounceTimer);
  }
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    // Read existing stored data so non-physics keys are preserved.
    const stored = readStoredObject();
    const cleaned: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(stored)) {
      if (!VALID_KEYS.has(k)) cleaned[k] = v;
    }
    Object.assign(cleaned, overrides);
    if (Object.keys(cleaned).length === 0) {
      localStorage.removeItem(STORAGE_KEY);
    } else {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(cleaned));
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
  // nodeCount reserved for future tuning
  void nodeCount;
  return { ...getDefaults(), ...overrides };
}
