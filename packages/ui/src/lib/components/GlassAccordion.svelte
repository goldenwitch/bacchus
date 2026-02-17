<script lang="ts">
  import { slide } from 'svelte/transition';
  import type { Snippet } from 'svelte';

  let {
    icon,
    title,
    expanded = $bindable(false),
    ontoggle,
    ariaLabel,
    children,
  }: {
    icon: string;
    title: string;
    expanded?: boolean;
    ontoggle?: () => void;
    ariaLabel?: string;
    children: Snippet;
  } = $props();

  function handleToggle() {
    if (ontoggle) {
      ontoggle();
    } else {
      expanded = !expanded;
    }
  }
</script>

<div class="glass-accordion">
  <button
    class="glass-toggle"
    onclick={handleToggle}
    aria-expanded={expanded}
    aria-label={ariaLabel ?? `Toggle ${title}`}
  >
    <span class="glass-icon">{icon}</span>
    <span class="glass-title">{title}</span>
    <span class="glass-chevron" class:glass-chevron-open={expanded}>▸</span>
  </button>

  {#if expanded}
    <div class="glass-body" transition:slide={{ duration: 200 }}>
      {@render children()}
    </div>
  {/if}
</div>

<style>
  .glass-accordion {
    background: var(--toolbar-bg);
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    border: 1px solid var(--border-subtle);
    border-radius: 12px;
    min-width: 160px;
    user-select: none;
  }

  .glass-toggle {
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
    font-family: inherit;
  }

  .glass-toggle:hover {
    background: var(--hover-bg);
  }

  .glass-icon {
    font-size: 1rem;
  }

  .glass-title {
    flex: 1;
    text-align: left;
    font-weight: 500;
  }

  .glass-chevron {
    display: inline-block;
    transition: transform 0.2s ease;
    font-size: 0.8rem;
    color: var(--text-muted);
  }

  .glass-chevron-open {
    transform: rotate(90deg);
  }
</style>
