<script lang="ts">
  import type { VineGraph } from '@bacchus/core';
  import {
    parse,
    getRoot,
    VineParseError,
    VineValidationError,
  } from '@bacchus/core';
  import GraphView from './lib/components/GraphView.svelte';
  import LandingScreen from './lib/components/LandingScreen.svelte';
  import { initAudio } from './lib/sound.js';

  let vineGraph: VineGraph | null = $state(null);
  let autoLoading = $state(false);
  let autoLoadError: string | null = $state(null);

  // On mount: check for ?file=<url> parameter
  $effect(() => {
    const params = new URLSearchParams(window.location.search);
    const fileUrl = params.get('file');
    if (fileUrl) {
      autoLoading = true;
      autoLoadError = null;
      fetch(fileUrl)
        .then(async (response) => {
          if (!response.ok) {
            autoLoadError = `Failed to load file: ${response.status} ${response.statusText}`;
            return;
          }
          const text = await response.text();
          try {
            vineGraph = parse(text);
            document.title = `${getRoot(vineGraph).shortName} — Bacchus`;
          } catch (e: unknown) {
            if (e instanceof VineParseError) {
              autoLoadError = `Parse error on line ${e.line}: ${e.message}`;
            } else if (e instanceof VineValidationError) {
              autoLoadError = `Validation error: ${e.constraint}`;
            } else {
              autoLoadError = String(e);
            }
          }
        })
        .catch(() => {
          autoLoadError = 'Network error';
        })
        .finally(() => {
          autoLoading = false;
        });
    }
  });

  // Initialize audio context on first user interaction
  $effect(() => {
    const handler = () => initAudio();
    document.addEventListener('click', handler, { once: true });
    return () => document.removeEventListener('click', handler);
  });

  function handleGraphLoaded(graph: VineGraph) {
    vineGraph = graph;
    document.title = `${getRoot(graph).shortName} — Bacchus`;
  }

  function handleReset() {
    vineGraph = null;
    document.title = 'Bacchus UI';
    // Clear ?file= query param so it doesn't auto-reload
    const url = new URL(window.location.href);
    if (url.searchParams.has('file')) {
      url.searchParams.delete('file');
      window.history.replaceState({}, '', url.toString());
    }
  }

  function handleGraphUpdate(updated: VineGraph) {
    vineGraph = updated;
    document.title = `${getRoot(updated).shortName} — Bacchus`;
  }
</script>

<main>
  {#if vineGraph}
    <GraphView
      graph={vineGraph}
      graphTitle={getRoot(vineGraph).shortName}
      onreset={handleReset}
      onupdate={handleGraphUpdate}
    />
  {:else if autoLoading}
    <div class="loading">
      <p>Loading…</p>
    </div>
  {:else}
    <LandingScreen onload={handleGraphLoaded} onupdate={handleGraphUpdate} />
    {#if autoLoadError}
      <div class="auto-error">
        <p>{autoLoadError}</p>
        <button
          onclick={() => {
            autoLoadError = null;
          }}>Dismiss</button
        >
      </div>
    {/if}
  {/if}
</main>

<style>
  main {
    width: 100vw;
    height: 100vh;
    overflow: hidden;
    background: var(--bg-primary);
  }

  .loading {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--text-muted);
    font-size: 1.2rem;
  }

  .auto-error {
    position: fixed;
    bottom: 24px;
    left: 50%;
    transform: translateX(-50%);
    padding: 14px 20px;
    border: 1px solid var(--color-error);
    border-radius: 10px;
    background: var(--sidebar-bg);
    display: flex;
    align-items: center;
    gap: 16px;
    z-index: 100;
  }

  .auto-error p {
    margin: 0;
    color: var(--color-error-text);
    font-size: 0.9rem;
  }

  .auto-error button {
    padding: 4px 14px;
    border: 1px solid var(--color-error);
    border-radius: 6px;
    background: transparent;
    color: var(--color-error);
    font-size: 0.8rem;
    cursor: pointer;
    transition:
      background 150ms,
      color 150ms;
    white-space: nowrap;
  }

  .auto-error button:hover {
    background: var(--color-error);
    color: var(--bg-primary);
  }
</style>
