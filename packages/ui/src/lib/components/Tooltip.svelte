<script lang="ts">
  import type { Task } from '@bacchus/core';
  import { fade } from 'svelte/transition';
  import { STATUS_MAP } from '../status.js';

  let { task, x, y }: { task: Task | null; x: number; y: number } = $props();

  const statusInfo = $derived(
    task && task.kind === 'task' ? STATUS_MAP[task.status] : null,
  );

  let tooltipEl: HTMLDivElement | undefined = $state(undefined);

  const adjustedLeft = $derived.by(() => {
    if (!tooltipEl) return `${x + 12}px`;
    const w = tooltipEl.offsetWidth;
    if (x + 12 + w > window.innerWidth) return `${x - w - 12}px`;
    return `${Math.max(0, x + 12)}px`;
  });

  const adjustedTop = $derived.by(() => {
    if (!tooltipEl) return `${y + 12}px`;
    const h = tooltipEl.offsetHeight;
    if (y + 12 + h > window.innerHeight) return `${y - h - 12}px`;
    return `${Math.max(0, y + 12)}px`;
  });
</script>

{#if task && statusInfo}
  <div
    bind:this={tooltipEl}
    class="tooltip"
    style="left: {adjustedLeft}; top: {adjustedTop};"
    transition:fade={{ duration: 150 }}
  >
    <div class="status-line">{statusInfo.emoji} {statusInfo.label}</div>
    <div class="desc-line">{task.description}</div>
  </div>
{/if}

<style>
  .tooltip {
    position: fixed;
    pointer-events: none;
    background: var(--legend-bg);
    color: var(--text-secondary);
    padding: 8px 12px;
    border-radius: 8px;
    font-size: 0.8rem;
    line-height: 1.4;
    max-width: 280px;
    z-index: 200;
    box-shadow: 0 4px 12px var(--color-tooltip-shadow);
  }

  .status-line {
    font-weight: 600;
    margin-bottom: 2px;
  }

  .desc-line {
    color: var(--text-muted);
    display: -webkit-box;
    -webkit-line-clamp: 3;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
</style>
