<script lang="ts">
  import { STATUS_MAP } from '../status.js';

  let expanded = $state(false);

  const entries = Object.entries(STATUS_MAP);
</script>

<div class="legend-container">
  <button
    class="legend-toggle"
    onclick={() => {
      expanded = !expanded;
    }}
    aria-expanded={expanded}
    aria-label="Toggle legend"
  >
    <span class="legend-icon">ℹ️</span>
    <span class="legend-title">Legend</span>
    <span class="legend-chevron" class:legend-chevron-open={expanded}>▸</span>
  </button>
  {#if expanded}
    <div class="legend-body">
      {#each entries as [_key, info] (_key)}
        <div class="legend-item">
          <span class="legend-swatch" style="background: {info.color};"></span>
          <span class="legend-emoji">{info.emoji}</span>
          <span class="legend-label">{info.label}</span>
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .legend-container {
    position: absolute;
    bottom: 16px;
    left: 16px;
    z-index: 130;
    background: var(--legend-bg);
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    border: 1px solid var(--border-subtle);
    border-radius: 12px;
    min-width: 160px;
    user-select: none;
  }

  .legend-toggle {
    display: flex;
    align-items: center;
    gap: 6px;
    width: 100%;
    padding: 8px 12px;
    background: none;
    border: none;
    color: var(--text-secondary);
    cursor: pointer;
    font-size: 0.85rem;
    font-family: inherit;
  }
  .legend-toggle:hover {
    background: var(--hover-bg);
    border-radius: 12px;
  }

  .legend-icon {
    font-size: 1rem;
  }
  .legend-title {
    flex: 1;
    text-align: left;
    font-weight: 500;
  }
  .legend-chevron {
    font-size: 0.8rem;
    transition: transform 200ms ease;
  }
  .legend-chevron-open {
    transform: rotate(90deg);
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
