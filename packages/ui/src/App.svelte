<script lang="ts">
  import type { VineGraph } from '@bacchus/core';
  import { parse, VineParseError, VineValidationError } from '@bacchus/core';
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

  function handleGraphLoaded(graph: VineGraph) {
    vineGraph = graph;
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<main onclick={() => initAudio()}>
  {#if vineGraph}
    <GraphView graph={vineGraph} />
  {:else if autoLoading}
    <div class="loading">
      <p>Loading…</p>
    </div>
  {:else}
    <LandingScreen onload={handleGraphLoaded} />
    {#if autoLoadError}
      <div class="auto-error">
        <p>{autoLoadError}</p>
        <button onclick={() => { autoLoadError = null; }}>Dismiss</button>
      </div>
    {/if}
  {/if}
</main>

<style>
  main {
    width: 100vw;
    height: 100vh;
    overflow: hidden;
    background: #0f172a;
  }

  .loading {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #94a3b8;
    font-size: 1.2rem;
  }

  .auto-error {
    position: fixed;
    bottom: 24px;
    left: 50%;
    transform: translateX(-50%);
    padding: 14px 20px;
    border: 1px solid #f87171;
    border-radius: 10px;
    background: rgba(15, 23, 42, 0.95);
    display: flex;
    align-items: center;
    gap: 16px;
    z-index: 100;
  }

  .auto-error p {
    margin: 0;
    color: #fca5a5;
    font-size: 0.9rem;
  }

  .auto-error button {
    padding: 4px 14px;
    border: 1px solid #f87171;
    border-radius: 6px;
    background: transparent;
    color: #f87171;
    font-size: 0.8rem;
    cursor: pointer;
    transition: background 150ms, color 150ms;
    white-space: nowrap;
  }

  .auto-error button:hover {
    background: #f87171;
    color: #0f172a;
  }
</style>
