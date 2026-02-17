<script lang="ts">
  import { STATUS_MAP } from '../status.js';
  import GlassAccordion from './GlassAccordion.svelte';

  let expanded = $state(false);

  const entries = Object.entries(STATUS_MAP);
</script>

<div class="legend-container">
  <GlassAccordion
    icon="ℹ️"
    title="Legend"
    bind:expanded
    ariaLabel="Toggle legend"
  >
    <div class="legend-body">
      {#each entries as [_key, info] (_key)}
        <div class="legend-item">
          <span class="legend-swatch" style="background: {info.color};"></span>
          <span class="legend-emoji">{info.emoji}</span>
          <span class="legend-label">{info.label}</span>
        </div>
      {/each}
    </div>
  </GlassAccordion>
</div>

<style>
  .legend-container {
    position: absolute;
    bottom: 16px;
    left: 16px;
    z-index: 130;
  }

  .legend-body {
    padding: 4px 12px 10px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .legend-item {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 0.8rem;
  }

  .legend-swatch {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    flex-shrink: 0;
    border: 1px solid var(--border-subtle);
  }
  .legend-emoji {
    font-size: 0.9rem;
  }
  .legend-label {
    color: var(--text-secondary);
  }
</style>
