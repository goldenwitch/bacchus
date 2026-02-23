<script lang="ts">
  import { SvelteSet } from 'svelte/reactivity';
  import {
    VISUALS_SLIDER_DEFS,
    type VisualsConfig,
    type VisualsSliderKey,
  } from '../visuals.js';
  import PanelSlider from './primitives/PanelSlider.svelte';
  import GroupHeader from './primitives/GroupHeader.svelte';
  import ResetButton from './primitives/ResetButton.svelte';
  import PanelBody from './primitives/PanelBody.svelte';
  import TextInput from './primitives/TextInput.svelte';
  import { getAllSpriteErrors } from '../sprites/registry.js';

  let {
    config,
    onchange,
    onspritechange,
    onreset,
  }: {
    config: VisualsConfig;
    onchange: (key: VisualsSliderKey, value: number) => void;
    onspritechange: (uri: string) => void;
    onreset: () => void;
  } = $props();

  const groups = $derived.by(() => {
    const seen = new SvelteSet<string>();
    const result: string[] = [];
    for (const def of VISUALS_SLIDER_DEFS) {
      if (!seen.has(def.group)) {
        seen.add(def.group);
        result.push(def.group);
      }
    }
    return result;
  });

  function formatValue(value: number, step: number): string {
    const precision = step < 0.1 ? 2 : step < 1 ? 1 : 0;
    return value.toFixed(precision);
  }

  // eslint-disable-next-line svelte/prefer-writable-derived -- input needs local writability
  let spriteInput = $state(config.globalSpriteOverride);

  $effect(() => {
    spriteInput = config.globalSpriteOverride;
  });

  function handleSpriteSubmit() {
    const trimmed = spriteInput.trim();
    onspritechange(trimmed);
  }

  function handleSpriteClear() {
    spriteInput = '';
    onspritechange('');
  }

  const spriteErrors = $derived(getAllSpriteErrors());
</script>

<PanelBody>
  {#each groups as group (group)}
    <GroupHeader label={group} />
    {#each VISUALS_SLIDER_DEFS.filter((d) => d.group === group) as def (def.key)}
      <PanelSlider
        label={def.label}
        value={config[def.key]}
        min={def.min}
        max={def.max}
        step={def.step}
        formatFn={(v) => formatValue(v, def.step)}
        onchange={(v) => onchange(def.key, v)}
      />
    {/each}
  {/each}

  <!-- Sprite override section -->
  <GroupHeader label="Sprite" />
  <div class="visuals-sprite-section">
    <label class="visuals-sprite-label" for="sprite-uri-input">SVG URI</label>
    <div class="visuals-sprite-row">
      <TextInput
        variant="compact"
        placeholder="./sprites/custom.svg"
        bind:value={spriteInput}
        onsubmit={handleSpriteSubmit}
        ariaLabel="Custom sprite SVG URI"
      />
      {#if config.globalSpriteOverride}
        <button
          type="button"
          class="visuals-sprite-clear"
          onclick={handleSpriteClear}
          aria-label="Clear sprite override"
        >
          ✕
        </button>
      {/if}
    </div>
    <button
      type="button"
      class="visuals-sprite-apply"
      onclick={handleSpriteSubmit}
    >
      Apply Sprite
    </button>
    {#if config.globalSpriteOverride}
      <div class="visuals-sprite-active">
        Active: <span class="visuals-sprite-uri">{config.globalSpriteOverride}</span>
      </div>
    {/if}
    {#if spriteErrors.size > 0}
      <div class="sprite-errors" role="alert">
        {#each [...spriteErrors] as [uri, msg] (uri)}
          <p class="sprite-error">⚠ Sprite <code>{uri}</code>: {msg}</p>
        {/each}
      </div>
    {/if}
  </div>

  <ResetButton onclick={onreset} />
</PanelBody>

<style>
  .visuals-sprite-section {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .visuals-sprite-label {
    font-size: 0.78rem;
    color: var(--text-secondary);
  }

  .visuals-sprite-row {
    display: flex;
    gap: 4px;
    align-items: center;
  }

  .visuals-sprite-clear {
    width: 22px;
    height: 22px;
    font-size: 0.7rem;
    padding: 0;
    border: 1px solid var(--border-subtle);
    border-radius: 4px;
    background: transparent;
    color: var(--text-muted);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .visuals-sprite-clear:hover {
    background: var(--hover-bg);
  }

  .visuals-sprite-apply {
    width: 100%;
    font-size: 0.72rem;
    padding: 4px 0;
    border: 1px solid var(--border-subtle);
    border-radius: 6px;
    background: transparent;
    color: var(--text-secondary);
    cursor: pointer;
  }

  .visuals-sprite-apply:hover {
    background: var(--hover-bg);
  }

  .visuals-sprite-active {
    font-size: 0.68rem;
    color: var(--text-dimmed);
    word-break: break-all;
    margin-top: 2px;
  }

  .visuals-sprite-uri {
    color: var(--focus-ring);
  }

  .sprite-errors {
    padding: 0.5rem;
    font-size: 0.75rem;
  }

  .sprite-error {
    color: var(--color-error, #e74c3c);
    margin: 0.25rem 0;
    word-break: break-all;
  }

  .sprite-error code {
    font-size: inherit;
    opacity: 0.85;
  }
</style>
