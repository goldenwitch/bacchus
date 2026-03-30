import type { VineGraph } from '@bacchus/core';
import type { ChatMessage, DisplayMessage } from './types.js';
import { ChatOrchestrator } from './orchestrator.js';
import type { OrchestratorEvent } from './orchestrator.js';
import { getApiKey, setApiKey, clearApiKey } from './apikey.js';
import {
  type ProviderType,
  getActiveProvider,
  setActiveProvider,
  createChatService,
} from './providers.js';

/**
 * Callback interface for graph updates emitted during a send.
 */
export type GraphUpdateCallback = (graph: VineGraph) => void;

/**
 * Manages the full chat session state — display messages, orchestrator,
 * API key, and loading flag. Lives above the component tree so it
 * survives panel toggling and Landing→Graph view transitions.
 *
 * The send loop runs inside the session (not the component) so that
 * a component being destroyed mid-stream cannot orphan the async
 * generator and leave `isLoading` stuck.
 *
 * Reactive properties (`displayMessages`, `isLoading`, `apiKey`) use
 * getter/setter pairs that call `onStateChange` on every write so that
 * the active ChatPanel (a Svelte component with local `$state`) can
 * keep its own reactive variables in sync.
 */
export class ChatSession {
  // -----------------------------------------------------------------------
  // Reactive properties — getter/setter with change notification
  // -----------------------------------------------------------------------

  private _displayMessages: DisplayMessage[] = [];
  private _isLoading = false;
  private _apiKey: string | null;
  private _provider: ProviderType;

  /** Callback invoked after any reactive property changes. */
  onStateChange: (() => void) | null = null;

  /** Callback for graph updates — set by the active ChatPanel. */
  onGraphUpdate: GraphUpdateCallback | null = null;

  get displayMessages(): DisplayMessage[] {
    return this._displayMessages;
  }
  set displayMessages(value: DisplayMessage[]) {
    this._displayMessages = value;
    this.onStateChange?.();
  }

  get isLoading(): boolean {
    return this._isLoading;
  }
  set isLoading(value: boolean) {
    this._isLoading = value;
    this.onStateChange?.();
  }

  get apiKey(): string | null {
    return this._apiKey;
  }
  set apiKey(value: string | null) {
    this._apiKey = value;
    this.onStateChange?.();
  }

  get provider(): ProviderType {
    return this._provider;
  }
  set provider(value: ProviderType) {
    this._provider = value;
    this.onStateChange?.();
  }

  // -----------------------------------------------------------------------
  // Plain properties (non-reactive)
  // -----------------------------------------------------------------------

  /** User's draft text in the input field. */
  inputDraft = '';

  /** Root task id this session is associated with. */
  vineId: string | null = null;

  /** The orchestrator driving the LLM conversation. */
  private orchestrator: ChatOrchestrator | null = null;

  constructor() {
    this._provider = getActiveProvider();
    this._apiKey = getApiKey(this._provider);
  }

  /**
   * True when the session has an API key and an active orchestrator.
   */
  get isReady(): boolean {
    return this.orchestrator !== null;
  }

  /**
   * Save the API key for the current provider and create the orchestrator.
   */
  saveApiKey(key: string, graph: VineGraph | null): void {
    setApiKey(key, this._provider);
    this.apiKey = key;
    void this.initOrchestrator(graph);
  }

  /**
   * Remove the stored API key for the current provider.
   *
   * Clears conversation history and tears down the orchestrator so the
   * panel returns to the key-entry prompt.
   */
  removeApiKey(): void {
    clearApiKey(this._provider);
    this._apiKey = null;
    this._displayMessages = [];
    this.orchestrator = null;
    this.onStateChange?.();
  }

  /**
   * Switch to a different LLM provider.
   *
   * Persists the choice, loads the provider's API key (if any),
   * clears conversation history, and re-initialises the orchestrator.
   */
  switchProvider(newProvider: ProviderType, graph: VineGraph | null): void {
    setActiveProvider(newProvider);
    this._provider = newProvider;
    this._apiKey = getApiKey(newProvider);
    this.orchestrator?.clearHistory();
    this._displayMessages = [];
    this.onStateChange?.();
    if (this._apiKey) {
      void this.initOrchestrator(graph);
    } else {
      this.orchestrator = null;
    }
  }

  /**
   * Initialise (or re-initialise) the orchestrator with the current API key.
   */
  async initOrchestrator(graph: VineGraph | null): Promise<void> {
    if (!this.apiKey) return;
    const service = await createChatService(this._provider, this.apiKey);
    this.orchestrator = new ChatOrchestrator(service, graph);
  }

  /**
   * Forward a graph update to the orchestrator.
   */
  setGraph(graph: VineGraph | null): void {
    this.orchestrator?.setGraph(graph);
  }

  /**
   * Get the raw LLM conversation history (for persistence).
   */
  getChatMessages(): readonly ChatMessage[] {
    return this.orchestrator?.getMessages() ?? [];
  }

  /**
   * Restore LLM conversation history (from persistence).
   */
  setChatMessages(messages: ChatMessage[]): void {
    this.orchestrator?.setMessages(messages);
  }

  /**
   * Clear the session — remove all messages and reset the orchestrator history.
   */
  clear(): void {
    this._displayMessages = [];
    this.inputDraft = '';
    this._isLoading = false;
    this.onStateChange?.();
    this.orchestrator?.clearHistory();
  }

  /**
   * Send a user message, drive the orchestrator loop, and update
   * `displayMessages` / `isLoading` directly on the session.
   *
   * Because the loop lives here (not inside a component), it survives
   * Landing→Graph view transitions that destroy and recreate ChatPanel.
   */
  async processMessage(text: string): Promise<void> {
    if (!this.orchestrator || this.isLoading) return;

    this.displayMessages = [
      ...this.displayMessages,
      { type: 'user', content: text },
    ];
    this.isLoading = true;

    let assistantIdx = -1;

    try {
      for await (const event of this.orchestrator.send(text)) {
        this.handleEvent(event);
        if (event.type === 'text' && assistantIdx === -1) {
          assistantIdx = this.displayMessages.length;
          this.displayMessages = [
            ...this.displayMessages,
            { type: 'assistant', content: event.content },
          ];
        } else if (event.type === 'text' && assistantIdx >= 0) {
          const msg = this.displayMessages[assistantIdx];
          if (msg && msg.type === 'assistant') {
            const updated = [...this.displayMessages];
            updated[assistantIdx] = {
              type: 'assistant',
              content: msg.content + event.content,
            };
            this.displayMessages = updated;
          }
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.displayMessages = [
        ...this.displayMessages,
        { type: 'error', message: msg },
      ];
    } finally {
      this.isLoading = false;
    }
  }

  /**
   * Handle a single orchestrator event — push tool/error messages and
   * notify the graph-update callback.
   */
  private handleEvent(event: OrchestratorEvent): void {
    switch (event.type) {
      case 'tool_exec':
        this.displayMessages = [
          ...this.displayMessages,
          {
            type: 'tool',
            name: event.name,
            result: event.result,
            isError: event.isError,
            detail: event.detail,
          },
        ];
        break;
      case 'graph_update':
        this.onGraphUpdate?.(event.graph);
        break;
      case 'error':
        this.displayMessages = [
          ...this.displayMessages,
          { type: 'error', message: event.message },
        ];
        break;
      case 'text':
      case 'done':
        break;
    }
  }
}
