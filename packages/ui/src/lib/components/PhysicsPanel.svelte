<script lang="ts">
  import { slide } from 'svelte/transition';
  import { PHYSICS_SLIDER_DEFS, type PhysicsConfig, type PhysicsParamKey } from '../physics.js';

  let { config, onchange, onreset, showStrataLines = false, ontogglestrata }: {
    config: PhysicsConfig;
    onchange: (key: PhysicsParamKey, value: number) => void;
    onreset: () => void;
    showStrataLines?: boolean;
    ontogglestrata?: (show: boolean) => void;
  } = $props();

  let expanded = $state(false);

  const groups = $derived.by(() => {
    const seen = new Set<string>();
    const result: string[] = [];
    for (const def of PHYSICS_SLIDER_DEFS) {
      if (!seen.has(def.group)) { seen.add(def.group); result.push(def.group); }
    }
    return result;
  });

  function formatValue(key: PhysicsParamKey, value: number, step: number): string {
    const precision = step < 0.1 ? 2 : step < 1 ? 1 : 0;
    if (key === 'chargeStrength') {
      return '-' + Math.abs(value).toFixed(precision);
    }
    return value.toFixed(precision);
  }
</script>

<div class="physics-panel">
  <button
    class="physics-toggle"
    onclick={() => { expanded = !expanded; }}
    aria-expanded={expanded}
    aria-label="Toggle physics controls"
  >
    <span class="physics-icon">🎛️</span>
    <span class="physics-title">Physics</span>
    <span class="physics-chevron" class:physics-chevron-open={expanded}>▸</span>
  </button>

  {#if expanded}
    <div class="physics-body" transition:slide={{ duration: 200 }}>
      {#each groups as group}
        <div class="physics-group-header">{group}</div>
        {#each PHYSICS_SLIDER_DEFS.filter(d => d.group === group) as def}
          <div class="physics-slider">
            <div class="physics-slider-row">
              <span class="physics-slider-label">{def.label}</span>
              <span class="physics-slider-value">{formatValue(def.key, config[def.key], def.step)}</span>
            </div>
            <input
              type="range"
              class="physics-range"
              min={def.min}
              max={def.max}
              step={def.step}
              value={config[def.key]}
              aria-label={def.label}
              oninput={(e: Event) => onchange(def.key, parseFloat((e.currentTarget as HTMLInputElement).value))}
            />
          </div>
        {/each}
      {/each}

      <label class="physics-checkbox">
        <input
          type="checkbox"
          checked={showStrataLines}
          onchange={() => ontogglestrata?.(!showStrataLines)}
          aria-label="Show strata lines"
        />
        <span class="physics-checkbox-label">Strata Lines</span>
      </label>

      <button type="button" class="physics-reset" onclick={onreset}>
        Reset Defaults
      </button>
    </div>
  {/if}
</div>

<style>
  .physics-panel {
    position: absolute;
    left: 16px;
    top: 50%;
    transform: translateY(-50%);
    z-index: 135;
    background: var(--toolbar-bg);
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    border: 1px solid var(--border-subtle);
    border-radius: 12px;
    min-width: 160px;
    user-select: none;
  }

  .physics-toggle {
    display: flex;
    align-items: center;
    gap: 6px;
    width: 100%;
    padding: 8px 12px;
    border: none;
    background: transparent;
    cursor: pointer;
    font-size: 0.85rem;
    color: var(--text-secondary);
    border-radius: 12px;
  }

  .physics-toggle:hover {
    background: var(--hover-bg);
  }

  .physics-icon {
    font-size: 1rem;
  }

  .physics-title {
    flex: 1;
    text-align: left;
    font-weight: 500;
  }

  .physics-chevron {
    display: inline-block;
    transition: transform 0.2s ease;
    font-size: 0.8rem;
    color: var(--text-muted);
  }

  .physics-chevron-open {
    transform: rotate(90deg);
  }

  .physics-body {
    width: 230px;
    max-height: 70vh;
    overflow-y: auto;
    padding: 0 12px 10px;
    scrollbar-width: thin;
    scrollbar-color: var(--border-subtle) transparent;
  }

  .physics-body::-webkit-scrollbar {
    width: 5px;
  }

  .physics-body::-webkit-scrollbar-track {
    background: transparent;
  }

  .physics-body::-webkit-scrollbar-thumb {
    background: var(--border-subtle);
    border-radius: 4px;
  }

  .physics-group-header {
    font-size: 0.65rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--text-dimmed);
    margin-top: 10px;
    margin-bottom: 4px;
  }

  .physics-slider {
    margin-bottom: 6px;
  }

  .physics-slider-row {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    margin-bottom: 2px;
  }

  .physics-slider-label {
    font-size: 0.78rem;
    color: var(--text-secondary);
  }

  .physics-slider-value {
    font-size: 0.72rem;
    color: var(--text-muted);
    font-variant-numeric: tabular-nums;
  }

  .physics-range {
    width: 100%;
    accent-color: var(--focus-ring);
    height: 4px;
    cursor: pointer;
  }

  .physics-checkbox {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-top: 10px;
    cursor: pointer;
  }

  .physics-checkbox input[type="checkbox"] {
    accent-color: var(--focus-ring);
    width: 14px;
    height: 14px;
    cursor: pointer;
  }

  .physics-checkbox-label {
    font-size: 0.78rem;
    color: var(--text-secondary);
  }

  .physics-reset {
    width: 100%;
    font-size: 0.78rem;
    padding: 6px 0;
    border: 1px solid var(--border-subtle);
    border-radius: 8px;
    background: transparent;
    color: var(--text-muted);
    cursor: pointer;
    margin-top: 8px;
  }

  .physics-reset:hover {
    background: var(--hover-bg);
  }

  @media (max-width: 639px) {
    .physics-panel {
      display: none;
    }
  }
</style>
