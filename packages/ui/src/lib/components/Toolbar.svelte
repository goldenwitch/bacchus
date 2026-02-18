<script lang="ts">
  import MuteButton from './MuteButton.svelte';
  import ThemeToggle from './ThemeToggle.svelte';
  import { serialize } from '@bacchus/core';
  import type { VineGraph } from '@bacchus/core';

  let {
    onreset,
    graphTitle,
    onzoomin,
    onzoomout,
    onfitview,
    zoomLevel,
    graph,
    onchat,
    chatOpen,
  }: {
    onreset?: () => void;
    graphTitle?: string;
    onzoomin?: () => void;
    onzoomout?: () => void;
    onfitview?: () => void;
    zoomLevel?: number;
    graph?: VineGraph;
    onchat?: () => void;
    chatOpen?: boolean;
  } = $props();

  function exportVine() {
    if (!graph) return;
    try {
      const text = serialize(graph);
      const safeName = (graphTitle ?? 'graph').replace(/[/\\:*?"<>|]/g, '_');
      const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${safeName}.vine`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      if (import.meta.env.DEV) console.error('Failed to export .vine file:', e);
    }
  }
</script>

<div class="toolbar">
  {#if onreset}
    <button
      class="home-btn"
      onclick={onreset}
      aria-label="Return to home screen"
      title="Load new file"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <path d="M3 12L12 3l9 9" />
        <path d="M9 21V12h6v9" />
      </svg>
    </button>
  {/if}
  {#if graphTitle}
    <span class="graph-title" title={graphTitle}>{graphTitle}</span>
  {/if}
  {#if onzoomout}
    <button
      class="home-btn"
      onclick={onzoomout}
      aria-label="Zoom out"
      title="Zoom out"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <circle cx="11" cy="11" r="8" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
        <line x1="8" y1="11" x2="14" y2="11" />
      </svg>
    </button>
  {/if}
  {#if onzoomin}
    <button
      class="home-btn"
      onclick={onzoomin}
      aria-label="Zoom in"
      title="Zoom in"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <circle cx="11" cy="11" r="8" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
        <line x1="11" y1="8" x2="11" y2="14" />
        <line x1="8" y1="11" x2="14" y2="11" />
      </svg>
    </button>
  {/if}
  {#if zoomLevel !== undefined}
    <span class="zoom-level">{Math.round(zoomLevel * 100)}%</span>
  {/if}
  {#if onfitview}
    <button
      class="home-btn"
      onclick={onfitview}
      aria-label="Fit graph to view"
      title="Fit to view"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <path d="M15 3h6v6" />
        <path d="M9 21H3v-6" />
        <path d="M21 3l-7 7" />
        <path d="M3 21l7-7" />
      </svg>
    </button>
  {/if}
  {#if graph}
    <button
      class="home-btn"
      onclick={exportVine}
      aria-label="Download .vine"
      title="Download .vine"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
        <polyline points="7 10 12 15 17 10" />
        <line x1="12" y1="15" x2="12" y2="3" />
      </svg>
    </button>
  {/if}
  {#if onchat}
    <button
      class="home-btn"
      class:chat-active={chatOpen}
      onclick={onchat}
      aria-label={chatOpen ? 'Close chat planner' : 'Open chat planner'}
      title={chatOpen ? 'Close chat' : 'Chat planner'}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <path
          d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"
        />
      </svg>
    </button>
  {/if}
  <ThemeToggle />
  <MuteButton />
</div>

<style>
  .toolbar {
    position: fixed;
    top: 12px;
    right: 12px;
    z-index: 150;
    display: flex;
    gap: 8px;
    align-items: center;
    background: var(--toolbar-bg);
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    border: 1px solid var(--border-subtle);
    border-radius: 24px;
    padding: 6px 12px;
  }

  .home-btn {
    background: transparent;
    border: none;
    color: var(--text-secondary);
    font-size: 1.25rem;
    cursor: pointer;
    padding: 6px;
    line-height: 1;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .home-btn:hover {
    opacity: 0.8;
  }

  .chat-active {
    color: var(--accent-green);
  }

  .zoom-level {
    color: var(--text-muted);
    font-size: 0.7rem;
    min-width: 36px;
    text-align: center;
    user-select: none;
  }

  .graph-title {
    color: var(--text-muted);
    font-size: 0.85rem;
    font-weight: 500;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 200px;
    margin: 0 auto;
  }
</style>
