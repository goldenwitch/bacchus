<script lang="ts">
  import type { Task } from '@bacchus/core';
  import { fade } from 'svelte/transition';
  import { STATUS_MAP } from '../status.js';

  let { task, x, y }: { task: Task | null; x: number; y: number } = $props();

  const statusInfo = $derived(task ? STATUS_MAP[task.status] : null);

  const truncatedDesc = $derived(
    task
      ? task.description.length > 80
        ? task.description.slice(0, 80) + '…'
        : task.description
      : ''
  );
</script>

{#if task && statusInfo}
  <div
    class="tooltip"
    style="left: {x + 12}px; top: {y + 12}px;"
    transition:fade={{ duration: 150 }}
  >
    <div class="status-line">{statusInfo.emoji} {task.status.charAt(0).toUpperCase() + task.status.slice(1)}</div>
    <div class="desc-line">{truncatedDesc}</div>
  </div>
{/if}

<style>
  .tooltip {
    position: fixed;
    pointer-events: none;
    background: rgba(15, 23, 42, 0.9);
    color: #e2e8f0;
    padding: 8px 12px;
    border-radius: 8px;
    font-size: 0.8rem;
    line-height: 1.4;
    max-width: 280px;
    z-index: 200;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
  }

  .status-line {
    font-weight: 600;
    margin-bottom: 2px;
  }

  .desc-line {
    color: #94a3b8;
  }
</style>
