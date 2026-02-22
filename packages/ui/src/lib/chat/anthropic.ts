import type {
  ChatService,
  ChatEvent,
  ChatMessage,
  ToolDefinition,
  ChatLogger,
} from './types.js';

/**
 * Anthropic Messages API chat service.
 *
 * Streams responses via SSE and maps them to the provider-agnostic
 * {@link ChatEvent} interface.
 */
export class AnthropicChatService implements ChatService {
  private readonly apiKey: string;
  private readonly model: string;
  private readonly apiUrl: string;
  private readonly requestTimeoutMs: number;
  private readonly logger?: ChatLogger;

  constructor(options: { apiKey: string; model?: string; apiUrl?: string; requestTimeoutMs?: number; logger?: ChatLogger }) {
    this.apiKey = options.apiKey;
    this.model = options.model ?? 'claude-opus-4-6';
    this.apiUrl = options.apiUrl ?? 'https://api.anthropic.com';
    this.requestTimeoutMs = options.requestTimeoutMs ?? 120_000;
    this.logger = options.logger;
  }

  async *sendMessage(
    messages: readonly ChatMessage[],
    tools: readonly ToolDefinition[],
    systemPrompt: string,
  ): AsyncGenerator<ChatEvent, void, unknown> {
    const body = {
      model: this.model,
      max_tokens: 4096,
      system: systemPrompt,
      messages: this.mapMessages(messages),
      tools: this.mapTools(tools),
      stream: true,
    };

    this.logger?.log('info', 'Sending API request', { model: this.model, messageCount: messages.length, toolCount: tools.length });

    const response = await fetch(`${this.apiUrl}/v1/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(this.requestTimeoutMs),
    });

    if (!response.ok) {
      const errorText = await response.text();
      let detail = errorText;
      try {
        const parsed = JSON.parse(errorText) as { error?: { message?: string } };
        if (parsed.error?.message) {
          detail = parsed.error.message;
        }
      } catch {
        // Not JSON — use raw text
      }
      this.logger?.log('error', 'API error', { status: response.status, detail });
      if (response.status === 401) {
        throw new Error(
          `Authentication failed — ${detail}. Check that your API key is valid.`,
        );
      }
      throw new Error(
        `Anthropic API error ${String(response.status)}: ${detail}`,
      );
    }

    this.logger?.log('info', 'API response received', { status: response.status });

    if (!response.body) {
      throw new Error('Response body is null — streaming not supported');
    }

    yield* this.parseSSEStream(response.body);
  }

  /**
   * Map our ChatMessage[] to Anthropic's message format.
   *
   * Anthropic expects tool results as a separate content block within a
   * `user` role message, and tool calls as `tool_use` blocks in an
   * `assistant` message.
   */
  private mapMessages(messages: readonly ChatMessage[]): AnthropicMessage[] {
    const result: AnthropicMessage[] = [];

    for (const msg of messages) {
      if (msg.toolResults && msg.toolResults.length > 0) {
        // Tool results go as a user message with tool_result content blocks
        const content: AnthropicContentBlock[] = msg.toolResults.map((tr) => ({
          type: 'tool_result' as const,
          tool_use_id: tr.toolCallId,
          content: tr.result,
          ...(tr.isError ? { is_error: true } : {}),
        }));
        result.push({ role: 'user', content });
      } else if (msg.toolCalls && msg.toolCalls.length > 0) {
        // Assistant message with tool use blocks
        const content: AnthropicContentBlock[] = [];
        if (msg.content) {
          content.push({ type: 'text', text: msg.content });
        }
        for (const tc of msg.toolCalls) {
          content.push({
            type: 'tool_use',
            id: tc.id,
            name: tc.name,
            input: tc.input,
          });
        }
        result.push({ role: 'assistant', content });
      } else {
        result.push({ role: msg.role, content: msg.content });
      }
    }

    return result;
  }

  /**
   * Map our ToolDefinition[] to Anthropic's tool format.
   */
  private mapTools(tools: readonly ToolDefinition[]): AnthropicTool[] {
    return tools.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.inputSchema,
    }));
  }

  /**
   * Parse an SSE stream from the Anthropic Messages API.
   */
  private async *parseSSEStream(
    body: ReadableStream<Uint8Array>,
  ): AsyncGenerator<ChatEvent, void, unknown> {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    // Track partial tool use blocks being streamed
    let currentToolId = '';
    let currentToolName = '';
    let currentToolJson = '';

    const READ_TIMEOUT_MS = 30_000;
    try {
      for (;;) {
        const readResult = await Promise.race([
          reader.read(),
          new Promise<never>((_, reject) =>
            setTimeout(() => {
              reject(new Error('SSE stream read timed out (no data for 30 s)'));
            }, READ_TIMEOUT_MS),
          ),
        ]);

        const { done, value } = readResult;
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        // Keep the last (possibly incomplete) line in the buffer
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6).trim();
          if (data === '' || data === '[DONE]') continue;

          let event: Record<string, unknown>;
          try {
            event = JSON.parse(data) as Record<string, unknown>;
          } catch {
            continue;
          }

          const eventType = event.type as string;

          if (eventType === 'content_block_start') {
            const block = event.content_block as Record<string, unknown>;
            if (block.type === 'tool_use') {
              currentToolId = block.id as string;
              currentToolName = block.name as string;
              currentToolJson = '';
            }
          } else if (eventType === 'content_block_delta') {
            const delta = event.delta as Record<string, unknown>;
            if (delta.type === 'text_delta') {
              yield { type: 'text', content: delta.text as string };
            } else if (delta.type === 'input_json_delta') {
              currentToolJson += delta.partial_json as string;
            }
          } else if (eventType === 'content_block_stop') {
            if (currentToolId) {
              let input: Record<string, unknown> = {};
              try {
                input = JSON.parse(currentToolJson) as Record<string, unknown>;
              } catch {
                // If JSON parsing fails, use empty input
              }
              this.logger?.log('info', 'SSE tool_call', { id: currentToolId, name: currentToolName });
              yield {
                type: 'tool_call',
                call: {
                  id: currentToolId,
                  name: currentToolName,
                  input,
                },
              };
              currentToolId = '';
              currentToolName = '';
              currentToolJson = '';
            }
          } else if (eventType === 'message_delta') {
            const delta = event.delta as Record<string, unknown>;
            if (delta.stop_reason) {
              yield { type: 'done', stopReason: delta.stop_reason as string };
            }
          } else if (eventType === 'message_stop') {
            // Final SSE event — exit the parser immediately so we don't
            // block on reader.read() waiting for TCP close (HTTP/2 keep-alive).
            this.logger?.log('info', 'SSE message_stop received');
            return;
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }
}

// ---------------------------------------------------------------------------
// Anthropic API types (internal)
// ---------------------------------------------------------------------------

type AnthropicContentBlock =
  | { type: 'text'; text: string }
  | {
      type: 'tool_use';
      id: string;
      name: string;
      input: Record<string, unknown>;
    }
  | {
      type: 'tool_result';
      tool_use_id: string;
      content: string;
      is_error?: boolean;
    };

interface AnthropicMessage {
  role: 'user' | 'assistant';
  content: string | AnthropicContentBlock[];
}

interface AnthropicTool {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}
