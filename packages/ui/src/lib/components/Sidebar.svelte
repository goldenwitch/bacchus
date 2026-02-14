<script lang="ts">
  import type { Task, VineGraph } from '@bacchus/core';
  import { fly } from 'svelte/transition';
  import { quintOut, quintIn } from 'svelte/easing';
  import { STATUS_MAP } from '../status.js';

  let { task, graph }: { task: Task | null; graph: VineGraph } = $props();

  const statusInfo = $derived(task ? STATUS_MAP[task.status] : null);
</script>

{#if task}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <aside
    class="sidebar"
    in:fly={{ x: 360, duration: 300, easing: quintOut }}
    out:fly={{ x: 360, duration: 200, easing: quintIn }}
    onclick={(e: MouseEvent) => e.stopPropagation()}
  >
    {#if statusInfo}
      <span class="status-pill" style="background: {statusInfo.color};">
        {statusInfo.emoji} {task.status.charAt(0).toUpperCase() + task.status.slice(1)}
      </span>
    {/if}

    <h2 class="heading">{task.shortName}</h2>

    <p class="description">{task.description}</p>

    {#if task.decisions.length > 0}
      <div class="decisions">
        <div class="decisions-label">── Decisions ──────────</div>
        <ul>
          {#each task.decisions as decision}
            <li>{decision}</li>
          {/each}
        </ul>
      </div>
    {/if}

    <div class="watermark">{task.id}</div>
  </aside>
{/if}

<style>
  .sidebar {
    position: fixed;
    top: 0;
    right: 0;
    width: 360px;
    height: 100vh;
    background: var(--sidebar-bg, rgba(15, 23, 42, 0.92));
    color: #e2e8f0;
    padding: 24px;
    z-index: 100;
    display: flex;
    flex-direction: column;
    gap: 12px;
    overflow-y: auto;
  }

  .status-pill {
    display: inline-block;
    padding: 4px 12px;
    border-radius: 9999px;
    font-size: 0.85rem;
    font-weight: 600;
    color: #0f172a;
    width: fit-content;
  }

  .heading {
    margin: 0;
    font-size: 1.25rem;
    font-weight: 700;
    color: #f8fafc;
  }

  .description {
    margin: 0;
    font-size: 0.9rem;
    line-height: 1.5;
    color: #cbd5e1;
  }

  .decisions {
    margin-top: 8px;
  }

  .decisions-label {
    font-size: 0.75rem;
    font-weight: 600;
    color: #64748b;
    letter-spacing: 0.05em;
    margin-bottom: 6px;
  }

  .decisions ul {
    margin: 0;
    padding-left: 20px;
  }

  .decisions li {
    font-size: 0.85rem;
    color: #cbd5e1;
    margin-bottom: 4px;
  }

  .watermark {
    position: absolute;
    bottom: 16px;
    right: 16px;
    font-size: 0.75rem;
    opacity: 0.15;
    color: #e2e8f0;
  }
</style>
