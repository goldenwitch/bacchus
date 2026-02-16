<script lang="ts">
  import type { VineGraph } from '@bacchus/core';
  import { fly } from 'svelte/transition';
  import { AnthropicChatService } from '../chat/anthropic.js';
  import { ChatOrchestrator } from '../chat/orchestrator.js';
  import type { OrchestratorEvent } from '../chat/orchestrator.js';
  import { getApiKey, setApiKey } from '../chat/apikey.js';

  let { graph, onupdate, onclose }: {
    graph: VineGraph | null;
    onupdate: (graph: VineGraph) => void;
    onclose: () => void;
  } = $props();

  // ---------------------------------------------------------------------------
  // Display message types
  // ---------------------------------------------------------------------------

  type DisplayMessage =
    | { type: 'user'; content: string }
    | { type: 'assistant'; content: string }
    | { type: 'tool'; name: string; result: string; isError: boolean }
    | { type: 'error'; message: string };

  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------

  let apiKey = $state(getApiKey());
  let keyInput = $state('');
  let messages: DisplayMessage[] = $state([]);
  let inputText = $state('');
  let isLoading = $state(false);
  let messagesEl: HTMLDivElement | undefined = $state(undefined);

  // ---------------------------------------------------------------------------
  // Orchestrator
  // ---------------------------------------------------------------------------

  let orchestrator: ChatOrchestrator | null = $state(null);

  $effect(() => {
    if (apiKey) {
      const service = new AnthropicChatService({ apiKey });
      orchestrator = new ChatOrchestrator(service, graph);
    }
  });

  // Keep orchestrator's graph in sync
  $effect(() => {
    if (orchestrator && graph) {
      orchestrator.setGraph(graph);
    }
  });

  // Auto-scroll to bottom when messages change
  $effect(() => {
    if (messagesEl && messages.length > 0) {
      // Access messages.length to track the dependency
      void messages.length;
      requestAnimationFrame(() => {
        if (messagesEl) {
          messagesEl.scrollTop = messagesEl.scrollHeight;
        }
      });
    }
  });

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  function handleSaveKey() {
    const trimmed = keyInput.trim();
    if (!trimmed) return;
    setApiKey(trimmed);
    apiKey = trimmed;
    keyInput = '';
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  function handleKeyInputKeyDown(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSaveKey();
    }
  }

  async function handleSend() {
    const text = inputText.trim();
    if (!text || !orchestrator || isLoading) return;

    inputText = '';
    messages.push({ type: 'user', content: text });
    isLoading = true;

    // Track the index where the assistant message will be streamed
    let assistantIdx = -1;

    try {
      for await (const event of orchestrator.send(text)) {
        handleEvent(event, assistantIdx);
        if (event.type === 'text' && assistantIdx === -1) {
          // First text chunk — create the assistant message placeholder
          assistantIdx = messages.length;
          messages.push({ type: 'assistant', content: event.content });
        } else if (event.type === 'text' && assistantIdx >= 0) {
          // Subsequent text — append to existing assistant message
          const msg = messages[assistantIdx];
          if (msg.type === 'assistant') {
            messages[assistantIdx] = { type: 'assistant', content: msg.content + event.content };
          }
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      messages.push({ type: 'error', message: msg });
    } finally {
      isLoading = false;
    }
  }

  function handleEvent(event: OrchestratorEvent, _assistantIdx: number): void {
    switch (event.type) {
      case 'tool_exec':
        messages.push({
          type: 'tool',
          name: event.name,
          result: event.result,
          isError: event.isError,
        });
        break;
      case 'graph_update':
        onupdate(event.graph);
        break;
      case 'error':
        messages.push({ type: 'error', message: event.message });
        break;
      case 'text':
      case 'done':
        // Handled in the main loop
        break;
    }
  }
</script>

<div class="chat-panel" transition:fly={{ x: -320, duration: 300 }}>
  <!-- Header -->
  <div class="chat-header">
    <span class="chat-title">Chat Planner</span>
    <button class="close-btn" onclick={onclose} aria-label="Close chat panel" title="Close">
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <line x1="18" y1="6" x2="6" y2="18" />
        <line x1="6" y1="6" x2="18" y2="18" />
      </svg>
    </button>
  </div>

  {#if !apiKey}
    <!-- API Key entry -->
    <div class="key-setup">
      <p class="key-label">Enter your Anthropic API key to start planning.</p>
      <div class="key-input-row">
        <input
          type="password"
          class="key-input"
          placeholder="sk-ant-..."
          bind:value={keyInput}
          onkeydown={handleKeyInputKeyDown}
        />
        <button class="key-save-btn" onclick={handleSaveKey} disabled={!keyInput.trim()}>
          Save
        </button>
      </div>
      <p class="key-hint">Stored locally in your browser. Never sent to our servers.</p>
    </div>
  {:else}
    <!-- Messages -->
    <div class="chat-messages" bind:this={messagesEl}>
      {#if messages.length === 0}
        <p class="chat-empty">
          Describe the plan you'd like to create, or ask me to modify the current graph.
        </p>
      {/if}
      {#each messages as msg}
        {#if msg.type === 'user'}
          <div class="msg msg-user">
            <p>{msg.content}</p>
          </div>
        {:else if msg.type === 'assistant'}
          <div class="msg msg-assistant">
            <p>{msg.content}</p>
          </div>
        {:else if msg.type === 'tool'}
          <div class="msg msg-tool" class:msg-tool-error={msg.isError}>
            <span class="tool-name">{msg.name}</span>
            <span class="tool-result">{msg.result}</span>
          </div>
        {:else if msg.type === 'error'}
          <div class="msg msg-error">
            <p>{msg.message}</p>
          </div>
        {/if}
      {/each}
      {#if isLoading}
        <div class="loading-indicator">
          <span class="dot"></span>
          <span class="dot"></span>
          <span class="dot"></span>
        </div>
      {/if}
    </div>

    <!-- Input -->
    <div class="chat-input-row">
      <textarea
        class="chat-input"
        placeholder="Describe your plan..."
        rows="2"
        bind:value={inputText}
        onkeydown={handleKeyDown}
        disabled={isLoading}
      ></textarea>
      <button
        class="send-btn"
        onclick={handleSend}
        disabled={isLoading || !inputText.trim()}
        aria-label="Send message"
        title="Send"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="22" y1="2" x2="11" y2="13" />
          <polygon points="22 2 15 22 11 13 2 9 22 2" />
        </svg>
      </button>
    </div>
  {/if}
</div>

<style>
  .chat-panel {
    position: absolute;
    left: 16px;
    bottom: 16px;
    z-index: 136;
    width: 380px;
    max-height: calc(100vh - 100px);
    background: var(--sidebar-bg);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    border: 1px solid var(--border-subtle);
    border-radius: 12px;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
  }

  /* Header */
  .chat-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 16px;
    border-bottom: 1px solid var(--border-subtle);
    flex-shrink: 0;
  }

  .chat-title {
    font-size: 0.9rem;
    font-weight: 600;
    color: var(--text-primary);
  }

  .close-btn {
    background: transparent;
    border: none;
    color: var(--text-muted);
    cursor: pointer;
    padding: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 4px;
  }

  .close-btn:hover {
    color: var(--text-primary);
    background: var(--hover-bg);
  }

  /* API Key setup */
  .key-setup {
    padding: 20px 16px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .key-label {
    margin: 0;
    font-size: 0.85rem;
    color: var(--text-secondary);
    line-height: 1.5;
  }

  .key-input-row {
    display: flex;
    gap: 8px;
  }

  .key-input {
    flex: 1;
    padding: 8px 12px;
    border: 1px solid var(--border-subtle);
    border-radius: 8px;
    background: var(--bg-secondary);
    color: var(--text-primary);
    font-size: 0.85rem;
    outline: none;
  }

  .key-input:focus {
    border-color: var(--accent-green);
  }

  .key-save-btn {
    padding: 8px 16px;
    border: 1px solid var(--accent-green);
    border-radius: 8px;
    background: transparent;
    color: var(--accent-green);
    font-size: 0.85rem;
    font-weight: 600;
    cursor: pointer;
    transition: background 150ms;
  }

  .key-save-btn:hover:not(:disabled) {
    background: var(--color-accent-active);
  }

  .key-save-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .key-hint {
    margin: 0;
    font-size: 0.75rem;
    color: var(--text-dimmed);
    line-height: 1.4;
  }

  /* Messages area */
  .chat-messages {
    flex: 1;
    overflow-y: auto;
    padding: 12px 16px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    min-height: 200px;
    max-height: calc(100vh - 280px);
  }

  .chat-empty {
    color: var(--text-dimmed);
    font-size: 0.85rem;
    text-align: center;
    margin: auto 0;
    padding: 20px 0;
    line-height: 1.5;
  }

  .msg p {
    margin: 0;
    font-size: 0.85rem;
    line-height: 1.5;
    word-break: break-word;
    white-space: pre-wrap;
  }

  .msg-user {
    align-self: flex-end;
    background: var(--accent-green);
    color: var(--accent-green-dark);
    padding: 8px 12px;
    border-radius: 12px 12px 4px 12px;
    max-width: 85%;
  }

  .msg-assistant {
    align-self: flex-start;
    background: var(--bg-tertiary);
    color: var(--text-primary);
    padding: 8px 12px;
    border-radius: 12px 12px 12px 4px;
    max-width: 85%;
  }

  .msg-tool {
    align-self: flex-start;
    background: var(--bg-secondary);
    border: 1px solid var(--border-subtle);
    padding: 6px 10px;
    border-radius: 8px;
    max-width: 90%;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .msg-tool-error {
    border-color: var(--color-error-border);
  }

  .tool-name {
    font-size: 0.7rem;
    font-weight: 600;
    color: var(--text-dimmed);
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }

  .msg-tool-error .tool-name {
    color: var(--color-error);
  }

  .tool-result {
    font-size: 0.8rem;
    color: var(--text-muted);
    word-break: break-word;
  }

  .msg-error {
    align-self: center;
    background: var(--color-error-bg);
    border: 1px solid var(--color-error-border);
    color: var(--color-error-text);
    padding: 8px 12px;
    border-radius: 8px;
    max-width: 90%;
  }

  /* Loading dots */
  .loading-indicator {
    align-self: flex-start;
    display: flex;
    gap: 4px;
    padding: 8px 12px;
  }

  .dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--text-dimmed);
    animation: bounce 1.4s infinite ease-in-out both;
  }

  .dot:nth-child(1) { animation-delay: -0.32s; }
  .dot:nth-child(2) { animation-delay: -0.16s; }
  .dot:nth-child(3) { animation-delay: 0s; }

  @keyframes bounce {
    0%, 80%, 100% {
      transform: scale(0);
      opacity: 0.4;
    }
    40% {
      transform: scale(1);
      opacity: 1;
    }
  }

  /* Input area */
  .chat-input-row {
    display: flex;
    gap: 8px;
    padding: 12px 16px;
    border-top: 1px solid var(--border-subtle);
    flex-shrink: 0;
  }

  .chat-input {
    flex: 1;
    padding: 8px 12px;
    border: 1px solid var(--border-subtle);
    border-radius: 8px;
    background: var(--bg-secondary);
    color: var(--text-primary);
    font-size: 0.85rem;
    font-family: inherit;
    resize: none;
    outline: none;
    line-height: 1.4;
  }

  .chat-input:focus {
    border-color: var(--accent-green);
  }

  .chat-input:disabled {
    opacity: 0.5;
  }

  .send-btn {
    align-self: flex-end;
    padding: 8px;
    border: none;
    border-radius: 8px;
    background: var(--accent-green);
    color: var(--accent-green-dark);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: opacity 150ms;
  }

  .send-btn:hover:not(:disabled) {
    opacity: 0.85;
  }

  .send-btn:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }

  @media (max-width: 639px) {
    .chat-panel {
      display: none;
    }
  }
</style>
