<script lang="ts">
  import type { Task, VineGraph } from '@bacchus/core';
  import { getDependencies, getDependants } from '@bacchus/core';
  import { fly } from 'svelte/transition';
  import { quintOut, quintIn } from 'svelte/easing';
  import { STATUS_MAP } from '../status.js';

  let { task, graph, onclose, onfocus }: { task: Task | null; graph: VineGraph; onclose?: () => void; onfocus?: (taskId: string) => void } = $props();

  const statusInfo = $derived(task ? STATUS_MAP[task.status] : null);
  const deps = $derived(task ? getDependencies(graph, task.id) : []);
  const dependants = $derived(task ? getDependants(graph, task.id) : []);

  // Compute pill text color with proper contrast against status background
  const pillTextColor = $derived.by(() => {
    if (!statusInfo) return 'var(--color-node-text-dark)';
    const hex = statusInfo.color;
    if (!hex || hex.length < 7) return 'var(--color-node-text-dark)';
    const r = parseInt(hex.slice(1, 3), 16) / 255;
    const g = parseInt(hex.slice(3, 5), 16) / 255;
    const b = parseInt(hex.slice(5, 7), 16) / 255;
    const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
    return luminance > 0.5 ? 'var(--color-node-text-dark)' : 'var(--color-node-text-light)';
  });

  // Detect mobile for transition direction
  const isMobile = typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(max-width: 480px)').matches
    : false;

  let copied = $state(false);

  function copyId() {
    if (!task) return;
    navigator.clipboard.writeText(task.id);
    copied = true;
    setTimeout(() => { copied = false; }, 1500);
  }
</script>

{#if task}
  <aside
    class="sidebar"
    role="region"
    aria-label="Task details"
    in:fly={{ x: isMobile ? 0 : 360, y: isMobile ? 300 : 0, duration: 300, easing: quintOut }}
    out:fly={{ x: isMobile ? 0 : 360, y: isMobile ? 300 : 0, duration: 200, easing: quintIn }}
    onclick={(e: MouseEvent) => e.stopPropagation()}
    onkeydown={(e: KeyboardEvent) => { if (e.key === 'Escape') onclose?.(); }}
  >
    {#if onclose}
      <button class="close-btn" aria-label="Close sidebar" onclick={onclose}>✕</button>
    {/if}
    {#if statusInfo}
      <span class="status-pill" style="background: {statusInfo.color}; color: {pillTextColor};">
        {statusInfo.emoji} {statusInfo.label}
      </span>
    {/if}

    <h2 class="heading">{task.shortName}</h2>

    <p class="description">{task.description}</p>

    {#if task.decisions.length > 0}
      <div class="decisions">
        <h3 class="section-heading">Decisions</h3>
        <ul>
          {#each task.decisions as decision}
            <li>{decision}</li>
          {/each}
        </ul>
      </div>
    {/if}

    <div class="dep-section">
      <h3 class="section-heading">Depends on</h3>
      {#if deps.length === 0}
        <span class="dep-empty">None</span>
      {:else}
        {#each deps as dep}
          <button class="dep-item" onclick={() => onfocus?.(dep.id)}>
            <span>{STATUS_MAP[dep.status].emoji}</span>
            <span>{dep.shortName}</span>
          </button>
        {/each}
      {/if}
    </div>

    <div class="dep-section">
      <h3 class="section-heading">Depended on by</h3>
      {#if dependants.length === 0}
        <span class="dep-empty">None</span>
      {:else}
        {#each dependants as dep}
          <button class="dep-item" onclick={() => onfocus?.(dep.id)}>
            <span>{STATUS_MAP[dep.status].emoji}</span>
            <span>{dep.shortName}</span>
          </button>
        {/each}
      {/if}
    </div>

    <div class="watermark">
      <span class="watermark-id">{task.id}</span>
      <button class="copy-btn" aria-label="Copy task ID" onclick={copyId}>
        {#if copied}
          <span class="copied-flash">Copied!</span>
        {:else}
          📋
        {/if}
      </button>
    </div>
  </aside>
{/if}

<style>
  .sidebar {
    position: fixed;
    top: 56px;
    right: 0;
    width: min(360px, calc(100vw - 48px));
    height: calc(100vh - 56px);
    max-height: calc(100vh - 56px);
    background: var(--sidebar-bg);
    color: var(--text-secondary);
    padding: 24px;
    z-index: 100;
    display: flex;
    flex-direction: column;
    gap: 12px;
    overflow-y: auto;
  }

  .close-btn {
    position: absolute;
    top: 12px;
    right: 12px;
    background: none;
    border: none;
    color: var(--text-muted);
    font-size: 1.2rem;
    cursor: pointer;
    padding: 4px 8px;
    border-radius: 4px;
  }

  .close-btn:hover {
    color: var(--text-secondary);
    background: var(--hover-bg-strong);
  }

  .status-pill {
    display: inline-block;
    padding: 4px 12px;
    border-radius: 9999px;
    font-size: 0.85rem;
    font-weight: 600;
    width: fit-content;
  }

  .heading {
    margin: 0;
    font-size: 1.25rem;
    font-weight: 700;
    color: var(--text-primary);
  }

  .description {
    margin: 0;
    font-size: 0.9rem;
    line-height: 1.5;
    color: var(--text-tertiary);
  }

  .decisions {
    margin-top: 8px;
  }

  .section-heading {
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    color: var(--text-dimmed);
    letter-spacing: 0.05em;
    border-bottom: 1px solid var(--border-subtle);
    padding-bottom: 6px;
    margin: 16px 0 8px 0;
  }

  .decisions ul {
    margin: 0;
    padding-left: 20px;
  }

  .decisions li {
    font-size: 0.85rem;
    color: var(--text-tertiary);
    margin-bottom: 4px;
  }

  .dep-section {
    margin-top: 0;
  }

  .dep-item {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 8px;
    border-radius: 6px;
    cursor: pointer;
    font-size: 0.85rem;
    color: var(--text-tertiary);
    background: none;
    border: none;
    width: 100%;
    text-align: left;
    font-family: inherit;
  }

  .dep-item:hover {
    background: var(--hover-bg);
  }

  .dep-empty {
    font-size: 0.8rem;
    color: var(--text-dimmed);
    padding: 4px 8px;
  }

  .watermark {
    position: absolute;
    bottom: 16px;
    right: 16px;
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 0.75rem;
    opacity: 0.35;
    color: var(--text-secondary);
  }

  .watermark-id {
    user-select: all;
  }

  .copy-btn {
    background: none;
    border: none;
    cursor: pointer;
    font-size: 0.7rem;
    padding: 2px 4px;
    border-radius: 4px;
    color: var(--text-secondary);
    opacity: 0.8;
  }

  .copy-btn:hover {
    opacity: 1;
    background: var(--hover-bg-strong);
  }

  .copied-flash {
    color: var(--accent-green);
    font-size: 0.7rem;
    font-weight: 600;
  }

  /* Mobile bottom-sheet layout */
  @media (max-width: 480px) {
    .sidebar {
      top: auto;
      bottom: 0;
      left: 0;
      right: 0;
      width: 100%;
      height: 60vh;
      max-height: 60vh;
      border-radius: 16px 16px 0 0;
      padding-bottom: 32px;
    }

    .sidebar::before {
      content: '';
      display: block;
      width: 40px;
      height: 4px;
      background: var(--disabled-bg);
      border-radius: 2px;
      margin: 0 auto 12px;
      flex-shrink: 0;
    }

    .watermark {
      position: relative;
      bottom: auto;
      right: auto;
      margin-top: auto;
    }
  }
</style>
