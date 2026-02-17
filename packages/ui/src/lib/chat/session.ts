import type { VineGraph } from '@bacchus/core';
import type { ChatMessage, DisplayMessage } from './types.js';
import { ChatOrchestrator } from './orchestrator.js';
import type { OrchestratorEvent } from './orchestrator.js';
import { AnthropicChatService } from './anthropic.js';
import { getApiKey, setApiKey } from './apikey.js';

/**
 * Manages the full chat session state — display messages, orchestrator,
 * API key, and loading flag. Lives above the component tree so it
 * survives panel toggling and Landing→Graph view transitions.
 */
export class ChatSession {
  /** Messages shown in the UI. */
  displayMessages: DisplayMessage[] = [];

  /** User's draft text in the input field. */
  inputDraft = '';

  /** Whether a send is in progress. */
  isLoading = false;

  /** Root task id this session is associated with. */
  vineId: string | null = null;

  /** The Anthropic API key in use (read from localStorage on construction). */
  apiKey: string | null;

  /** The orchestrator driving the LLM conversation. */
  private orchestrator: ChatOrchestrator | null = null;

  constructor() {
    this.apiKey = getApiKey();
  }

  /**
   * True when the session has an API key and an active orchestrator.
   */
  get isReady(): boolean {
    return this.orchestrator !== null;
  }

  /**
   * Save the API key and create the orchestrator.
   */
  saveApiKey(key: string, graph: VineGraph | null): void {
    setApiKey(key);
    this.apiKey = key;
    this.initOrchestrator(graph);
  }

  /**
   * Initialise (or re-initialise) the orchestrator with the current API key.
   */
  initOrchestrator(graph: VineGraph | null): void {
    if (!this.apiKey) return;
    const service = new AnthropicChatService({ apiKey: this.apiKey });
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
    this.displayMessages = [];
    this.inputDraft = '';
    this.isLoading = false;
    this.orchestrator?.clearHistory();
  }

  /**
   * Send a user message and yield orchestrator events.
   *
   * The caller should iterate the generator to drive the conversation
   * and update reactive state.
   */
  async *send(text: string): AsyncGenerator<OrchestratorEvent, void, unknown> {
    if (!this.orchestrator || this.isLoading) return;

    this.isLoading = true;
    try {
      yield* this.orchestrator.send(text);
    } finally {
      this.isLoading = false;
    }
  }
}
