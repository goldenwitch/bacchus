<script lang="ts">
  import type { VineGraph } from '@bacchus/core';
  import MarkdownMessage from './MarkdownMessage.svelte';
  import type { DisplayMessage } from '../chat/types.js';
  import { ChatSession } from '../chat/session.js';
  import ToolFeedbackCard from './ToolFeedbackCard.svelte';
  import {
    PROVIDERS,
    PROVIDER_IDS,
    type ProviderType,
  } from '../chat/providers.js';
  import { getApiKey } from '../chat/apikey.js';

  let {
    graph,
    onupdate,
    session,
  }: {
    graph: VineGraph | null;
    onupdate: (graph: VineGraph) => void;
    session: ChatSession;
  } = $props();

  // ---------------------------------------------------------------------------
  // Local reactive state — initialized from session, kept in sync via callback
  // ---------------------------------------------------------------------------

  let messages: DisplayMessage[] = $state([...session.displayMessages]);
  let isLoading = $state(session.isLoading);
  let apiKey: string | null = $state(session.apiKey);
  let activeProvider: ProviderType = $state(session.provider);
  let inputText = $state(session.inputDraft);
  let keyInput = $state('');
  let messagesEl: HTMLDivElement | undefined = $state(undefined);

  // Sync session → local via onStateChange callback.
  $effect(() => {
    session.onStateChange = () => {
      messages = [...session.displayMessages];
      isLoading = session.isLoading;
      apiKey = session.apiKey;
      activeProvider = session.provider;
    };
    return () => {
      if (session.onStateChange) {
        session.onStateChange = null;
      }
    };
  });

  // Sync input draft back to session
  $effect(() => {
    session.inputDraft = inputText;
  });

  // ---------------------------------------------------------------------------
  // Orchestrator init & graph sync
  // ---------------------------------------------------------------------------

  $effect(() => {
    if (apiKey && !session.isReady) {
      void session.initOrchestrator(graph);
    }
  });

  $effect(() => {
    if (graph !== undefined) {
      session.setGraph(graph);
    }
  });

  $effect(() => {
    session.onGraphUpdate = onupdate;
    return () => {
      if (session.onGraphUpdate === onupdate) {
        session.onGraphUpdate = null;
      }
    };
  });

  // Auto-scroll to bottom when messages change
  $effect(() => {
    if (messagesEl && messages.length > 0) {
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
    session.saveApiKey(trimmed, graph);
    keyInput = '';
  }

  function handleSwitchProvider(provider: ProviderType) {
    if (provider === activeProvider) return;
    session.switchProvider(provider, graph);
    keyInput = '';
  }

  function handleRemoveKey() {
    session.removeApiKey();
  }

  /** Check whether a provider has a saved key. */
  function providerHasKey(provider: ProviderType): boolean {
    return getApiKey(provider) !== null;
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

  function handleSend() {
    const text = inputText.trim();
    if (!text || isLoading) return;

    inputText = '';
    void session.processMessage(text);
  }
</script>

<div class="chat-body">
  <!-- Provider selector tabs -->
  <div class="provider-tabs">
    {#each PROVIDER_IDS as pid (pid)}
      <button
        class="provider-tab"
        class:active={pid === activeProvider}
        onclick={() => handleSwitchProvider(pid)}
        disabled={isLoading}
      >
        {PROVIDERS[pid].label}
        {#if providerHasKey(pid)}
          <span class="key-dot" title="API key saved"></span>
        {/if}
      </button>
    {/each}
  </div>

  {#if apiKey}
    <div class="key-actions">
      <button
        class="remove-key-btn"
        onclick={handleRemoveKey}
        disabled={isLoading}
        title="Remove saved API key for {PROVIDERS[activeProvider].label}"
      >
        Remove {PROVIDERS[activeProvider].label} key
      </button>
    </div>
  {/if}

  {#if !apiKey}
    <!-- API Key entry -->
    <div class="key-setup">
      <p class="key-label">
        Enter your {PROVIDERS[activeProvider].label} API key to start planning.
      </p>
      <div class="key-input-row">
        <input
          type="password"
          class="key-input"
          placeholder={PROVIDERS[activeProvider].placeholder}
          bind:value={keyInput}
          onkeydown={handleKeyInputKeyDown}
        />
        <button
          class="key-save-btn"
          onclick={handleSaveKey}
          disabled={!keyInput.trim()}
        >
          Save
        </button>
      </div>
      <p class="key-hint">
        Stored locally in your browser. Never sent to our servers.
      </p>
    </div>
  {:else}
    <!-- Messages -->
    <div class="chat-messages" bind:this={messagesEl}>
      {#if messages.length === 0}
        <p class="chat-empty">
          Describe the plan you'd like to create, or ask me to modify the
          current graph.
        </p>
      {/if}
      {#each messages as msg, i (i)}
        {#if msg.type === 'user'}
          <div class="msg msg-user">
            <p>{msg.content}</p>
          </div>
        {:else if msg.type === 'assistant'}
          <div class="msg msg-assistant">
            <MarkdownMessage content={msg.content} />
            <button
              class="msg-copy-btn"
              aria-label="Copy message"
              onclick={() => {
                navigator.clipboard.writeText(msg.content).catch(() => {});
              }}
              title="Copy message"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                <path
                  d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"
                ></path>
              </svg>
            </button>
          </div>
        {:else if msg.type === 'tool'}
          <div
            class="msg"
            class:msg-tool={!msg.isError}
            class:msg-tool-error={msg.isError}
          >
            <ToolFeedbackCard
              detail={msg.detail}
              name={msg.name}
              result={msg.result}
              isError={msg.isError}
            />
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
        placeholder="Describe your plan... ({PROVIDERS[activeProvider].label})"
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
          <line x1="22" y1="2" x2="11" y2="13" />
          <polygon points="22 2 15 22 11 13 2 9 22 2" />
        </svg>
      </button>
    </div>
  {/if}
</div>

<style>
  /* Body container */
  .chat-body {
    width: 340px;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    max-height: calc(100vh - 180px);
  }

  /* Provider selector tabs */
  .provider-tabs {
    display: flex;
    gap: 4px;
    padding: 8px 16px;
    border-bottom: 1px solid var(--border-subtle);
    flex-shrink: 0;
  }

  .provider-tab {
    flex: 1;
    padding: 6px 8px;
    border: 1px solid var(--border-subtle);
    border-radius: 6px;
    background: transparent;
    color: var(--text-secondary);
    font-size: 0.75rem;
    font-weight: 500;
    cursor: pointer;
    transition:
      background 150ms,
      border-color 150ms,
      color 150ms;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
  }

  .provider-tab:hover:not(:disabled) {
    background: var(--bg-secondary);
    border-color: var(--text-dimmed);
  }

  .provider-tab.active {
    background: var(--color-accent-active);
    border-color: var(--accent-green);
    color: var(--accent-green);
    font-weight: 600;
  }

  .provider-tab:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .key-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--accent-green);
    display: inline-block;
    flex-shrink: 0;
  }

  .key-actions {
    display: flex;
    justify-content: flex-end;
    padding: 2px 16px 0;
  }

  .remove-key-btn {
    background: none;
    border: 1px solid var(--text-dimmed);
    color: var(--text-secondary);
    font-size: 0.75rem;
    cursor: pointer;
    padding: 4px 10px;
    border-radius: 6px;
    transition: color 150ms, background 150ms, border-color 150ms;
  }

  .remove-key-btn:hover:not(:disabled) {
    color: var(--color-error-text);
    background: var(--color-error-bg);
    border-color: var(--color-error-border);
  }

  .remove-key-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
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
    user-select: text;
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

  .dot:nth-child(1) {
    animation-delay: -0.32s;
  }
  .dot:nth-child(2) {
    animation-delay: -0.16s;
  }
  .dot:nth-child(3) {
    animation-delay: 0s;
  }

  @keyframes bounce {
    0%,
    80%,
    100% {
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

  .msg-copy-btn {
    position: absolute;
    top: 6px;
    right: 6px;
    background: rgba(255, 255, 255, 0.1);
    border: 1px solid rgba(255, 255, 255, 0.15);
    color: inherit;
    border-radius: 4px;
    padding: 3px 5px;
    cursor: pointer;
    opacity: 0;
    transition: opacity 0.15s;
    display: flex;
    align-items: center;
  }

  .msg.msg-assistant {
    position: relative;
  }

  .msg.msg-assistant:hover .msg-copy-btn {
    opacity: 0.7;
  }

  .msg-copy-btn:hover {
    opacity: 1 !important;
    background: rgba(255, 255, 255, 0.2);
  }
</style>
