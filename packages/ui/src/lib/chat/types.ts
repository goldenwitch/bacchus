/**
 * Chat message roles.
 */
export type ChatRole = 'user' | 'assistant';

/**
 * A tool call emitted by the LLM.
 */
export interface ToolCall {
  readonly id: string;
  readonly name: string;
  readonly input: Record<string, unknown>;
}

/**
 * The result of executing a tool call.
 */
export interface ToolResult {
  readonly toolCallId: string;
  readonly result: string;
  readonly isError?: boolean;
}

/**
 * A message in the chat conversation.
 */
export interface ChatMessage {
  readonly role: ChatRole;
  readonly content: string;
  readonly toolCalls?: readonly ToolCall[];
  readonly toolResults?: readonly ToolResult[];
}

/**
 * JSON Schema definition for a tool parameter.
 */
export interface ToolDefinition {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: Record<string, unknown>;
}

/**
 * Events streamed from the chat service.
 */
export type ChatEvent =
  | { readonly type: 'text'; readonly content: string }
  | { readonly type: 'tool_call'; readonly call: ToolCall }
  | { readonly type: 'done'; readonly stopReason: string };

import type { ToolFeedbackDetail } from './toolFeedback.js';

/**
 * Messages displayed in the chat UI.
 */
export type DisplayMessage =
  | { readonly type: 'user'; readonly content: string }
  | { readonly type: 'assistant'; readonly content: string }
  | {
      readonly type: 'tool';
      readonly name: string;
      readonly result: string;
      readonly isError: boolean;
      readonly detail: ToolFeedbackDetail;
    }
  | { readonly type: 'error'; readonly message: string };

/**
 * Abstract interface for LLM chat providers.
 *
 * Implementations wrap a specific provider API (e.g. Anthropic, OpenAI)
 * behind a uniform async-generator interface.
 */
export interface ChatService {
  /**
   * Send a conversation and receive streamed events.
   *
   * The generator yields `ChatEvent` objects — text deltas, tool calls,
   * and a final `done` event. The caller is responsible for managing
   * the conversation history and tool-use loop.
   */
  sendMessage(
    messages: readonly ChatMessage[],
    tools: readonly ToolDefinition[],
    systemPrompt: string,
  ): AsyncGenerator<ChatEvent, void, unknown>;
}

/**
 * Optional structured logger for debugging chat interactions.
 * When provided, the orchestrator and service log key events
 * (API calls, tool executions, timing) for observability.
 */
export interface ChatLogger {
  log(
    level: 'info' | 'warn' | 'error',
    message: string,
    data?: Record<string, unknown>,
  ): void;
}
