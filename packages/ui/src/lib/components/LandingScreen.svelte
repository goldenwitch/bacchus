<script lang="ts">
  import type { VineGraph } from '@bacchus/core';
  import { parse, VineParseError, VineValidationError } from '@bacchus/core';
  import type { ValidationDetails } from '@bacchus/core';
  import FileDropZone from './FileDropZone.svelte';
  import UrlInput from './UrlInput.svelte';
  import ThemeToggle from './ThemeToggle.svelte';
  import ChatPanel from './ChatPanel.svelte';
  import type { ChatSession } from '../chat/session.js';

  let {
    onload,
    onupdate,
    chatOpen,
    chatSession,
    ontoggle,
  }: {
    onload: (graph: VineGraph) => void;
    onupdate?: (graph: VineGraph) => void;
    chatOpen: boolean;
    chatSession: ChatSession;
    ontoggle: () => void;
  } = $props();
  let error: string | null = $state(null);

  const DIAMOND_EXAMPLE = `[schema] Design Database Schema (complete)
Define tables, indexes, and constraints.

[api] Build REST API (started)
Implement CRUD endpoints on top of the schema.
-> schema

[ui] Build Frontend (started)
Create the user-facing interface against the schema contract.
-> schema

[integration] Integration Testing (notstarted)
End-to-end tests verifying the API and UI work together.
-> api
-> ui
`;

  function handleTryExample() {
    error = null;
    try {
      const graph = parse(DIAMOND_EXAMPLE);
      onload(graph);
    } catch (e: unknown) {
      error = String(e);
    }
  }

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

  function handleChatGraphUpdate(graph: VineGraph) {
    if (onupdate) {
      onupdate(graph);
    }
    onload(graph);
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
  <div class="theme-corner"><ThemeToggle /></div>
  <div class="content">
    <h1 class="title">Bacchus</h1>
    <p class="tagline">Visualize your task graph</p>

    <div class="inputs">
      <FileDropZone onload={handleText} />

      <div class="divider">
        <span>or load from URL</span>
      </div>

      <UrlInput onload={handleText} onerror={handleFetchError} />

      <div class="divider">
        <span>or try a demo</span>
      </div>

      <button class="try-example" onclick={handleTryExample}>
        <span class="try-example-label">✨ Try an example</span>
        <span class="try-example-sub">Load a sample dependency graph</span>
      </button>

      <div class="divider">
        <span>or plan with AI</span>
      </div>

      <button
        class="try-example plan-ai"
        onclick={() => {
          ontoggle();
        }}
      >
        <span class="try-example-label">💬 Plan with AI</span>
        <span class="try-example-sub"
          >Create a task graph through conversation</span
        >
      </button>
    </div>

    {#if error}
      <div class="error-card anim-error-shake">
        <span class="error-icon">⚠️</span>
        <p class="error-message">{error}</p>
        <button
          class="dismiss"
          onclick={() => {
            error = null;
          }}>Dismiss</button
        >
      </div>
    {/if}
  </div>
  {#if chatOpen}
    <ChatPanel
      graph={null}
      onupdate={handleChatGraphUpdate}
      onclose={() => {
        ontoggle();
      }}
      session={chatSession}
    />
  {/if}
</div>

<style>
  .landing {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--bg-primary);
    position: relative;
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
    background: linear-gradient(
      135deg,
      var(--color-complete),
      var(--color-planning)
    );
    background-clip: text;
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
  }

  .tagline {
    margin: 0;
    font-size: 1.1rem;
    color: var(--text-muted);
  }

  .inputs {
    width: 100%;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .divider {
    text-align: center;
    color: var(--text-dimmed);
    font-size: 0.85rem;
  }

  .error-card {
    width: 100%;
    padding: 16px 20px;
    border: 1px solid var(--color-error);
    border-radius: 10px;
    background: var(--color-error-bg);
    display: flex;
    align-items: flex-start;
    gap: 12px;
    flex-wrap: wrap;
  }

  .error-icon {
    font-size: 1.2rem;
    flex-shrink: 0;
    line-height: 1.4;
  }

  .error-message {
    flex: 1;
    margin: 0;
    color: var(--color-error-text);
    font-size: 0.9rem;
    line-height: 1.5;
    min-width: 0;
    word-break: break-word;
  }

  .dismiss {
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
    flex-shrink: 0;
  }

  .dismiss:hover {
    background: var(--color-error);
    color: var(--bg-primary);
  }

  .try-example {
    width: 100%;
    padding: 14px 20px;
    border: 1px solid var(--accent-green);
    border-radius: 10px;
    background: transparent;
    color: var(--accent-green);
    cursor: pointer;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    transition: background 150ms;
  }

  .try-example:hover {
    background: var(--color-accent-active);
  }

  .try-example-label {
    font-size: 1rem;
    font-weight: 600;
  }

  .try-example-sub {
    font-size: 0.8rem;
    color: var(--text-dimmed);
  }

  .plan-ai {
    border-color: var(--color-planning);
    color: var(--color-planning);
  }

  .plan-ai:hover {
    background: rgba(167, 139, 250, 0.1);
  }

  /* error-shake animation handled by global app.css */

  .theme-corner {
    position: absolute;
    top: 16px;
    right: 16px;
  }
</style>
