<script lang="ts">
  import type { VineGraph } from '@bacchus/core';
  import { parse, VineParseError, VineValidationError } from '@bacchus/core';
  import type { ValidationDetails } from '@bacchus/core';
  import FileDropZone from './FileDropZone.svelte';
  import UrlInput from './UrlInput.svelte';

  let { onload }: { onload: (graph: VineGraph) => void } = $props();
  let error: string | null = $state(null);

  function handleText(text: string) {
    error = null;
    try {
      const graph = parse(text);
      onload(graph);
    } catch (e: unknown) {
      if (e instanceof VineParseError) {
        error = `Parse error on line ${e.line}: ${e.message}`;
      } else if (e instanceof VineValidationError) {
        error = `Validation error: ${e.constraint} — ${formatDetails(e.details)}`;
      } else {
        error = String(e);
      }
    }
  }

  function handleFetchError(message: string) {
    error = message;
  }

  function formatDetails(details: ValidationDetails): string {
    switch (details.constraint) {
      case 'at-least-one-task':
        return 'File contains no tasks';
      case 'valid-dependency-refs':
        return `Task "${details.taskId}" references unknown dependency "${details.missingDep}"`;
      case 'no-cycles':
        return `Cycle detected: ${details.cycle.join(' → ')}`;
      case 'no-islands':
        return `Disconnected tasks: ${details.islandTaskIds.join(', ')}`;
    }
  }
</script>

<div class="landing">
  <div class="content">
    <h1 class="title">Bacchus</h1>
    <p class="tagline">Visualize your task graph</p>

    <div class="inputs">
      <FileDropZone onload={handleText} />

      <div class="divider">
        <span>or load from URL</span>
      </div>

      <UrlInput onload={handleText} onerror={handleFetchError} />
    </div>

    {#if error}
      <div class="error-card anim-error-shake">
        <p class="error-message">{error}</p>
        <button class="dismiss" onclick={() => { error = null; }}>Dismiss</button>
      </div>
    {/if}
  </div>
</div>

<style>
  .landing {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #0f172a;
  }

  .content {
    max-width: 520px;
    width: 100%;
    padding: 32px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 24px;
  }

  .title {
    font-size: 3rem;
    font-weight: 700;
    margin: 0;
    background: linear-gradient(135deg, #4ade80, #a78bfa);
    background-clip: text;
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
  }

  .tagline {
    margin: -12px 0 0;
    font-size: 1.1rem;
    color: #94a3b8;
  }

  .inputs {
    width: 100%;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .divider {
    text-align: center;
    color: #64748b;
    font-size: 0.85rem;
  }

  .error-card {
    width: 100%;
    padding: 16px 20px;
    border: 1px solid #f87171;
    border-radius: 10px;
    background: rgba(248, 113, 113, 0.08);
    display: flex;
    align-items: flex-start;
    gap: 12px;
    flex-wrap: wrap;
  }

  .error-message {
    flex: 1;
    margin: 0;
    color: #fca5a5;
    font-size: 0.9rem;
    line-height: 1.5;
    min-width: 0;
    word-break: break-word;
  }

  .dismiss {
    padding: 4px 14px;
    border: 1px solid #f87171;
    border-radius: 6px;
    background: transparent;
    color: #f87171;
    font-size: 0.8rem;
    cursor: pointer;
    transition: background 150ms, color 150ms;
    flex-shrink: 0;
  }

  .dismiss:hover {
    background: #f87171;
    color: #0f172a;
  }

  @keyframes error-shake {
    0%, 100% { transform: translateX(0); }
    15% { transform: translateX(-4px); }
    30% { transform: translateX(4px); }
    45% { transform: translateX(-4px); }
    60% { transform: translateX(4px); }
    75% { transform: translateX(-2px); }
    90% { transform: translateX(2px); }
  }

  .anim-error-shake {
    animation: error-shake 300ms ease-out;
  }
</style>
