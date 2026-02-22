import Anthropic from '@anthropic-ai/sdk';
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
 * Streams responses via the official SDK and maps them to the
 * provider-agnostic {@link ChatEvent} interface.
 */
export class AnthropicChatService implements ChatService {
  private readonly client: Anthropic;
  private readonly model: string;
  private readonly logger?: ChatLogger;

  constructor(options: {
    apiKey: string;
    model?: string;
    apiUrl?: string;
    requestTimeoutMs?: number;
    logger?: ChatLogger;
  }) {
    this.client = new Anthropic({
      apiKey: options.apiKey,
      baseURL: options.apiUrl ?? 'https://api.anthropic.com',
      timeout: options.requestTimeoutMs ?? 120_000,
      dangerouslyAllowBrowser: true,
      maxRetries: 0,
    });
    this.model = options.model ?? 'claude-opus-4-6';
    this.logger = options.logger;
  }

  async *sendMessage(
    messages: readonly ChatMessage[],
    tools: readonly ToolDefinition[],
    systemPrompt: string,
  ): AsyncGenerator<ChatEvent, void, unknown> {
    this.logger?.log('info', 'Sending API request', {
      model: this.model,
      messageCount: messages.length,
      toolCount: tools.length,
    });

    let currentToolId = '';
    let currentToolName = '';
    let currentToolJson = '';

    try {
      const stream = await this.client.messages.create({
        model: this.model,
        max_tokens: 4096,
        system: systemPrompt,
        messages: this.mapMessages(messages),
        tools: this.mapTools(tools),
        stream: true,
      });

      this.logger?.log('info', 'API response received', { status: 200 });

      for await (const event of stream) {
        if (event.type === 'content_block_start') {
          if (event.content_block.type === 'tool_use') {
            currentToolId = event.content_block.id;
            currentToolName = event.content_block.name;
            currentToolJson = '';
          }
        } else if (event.type === 'content_block_delta') {
          if (event.delta.type === 'text_delta') {
            yield { type: 'text', content: event.delta.text };
          } else if (event.delta.type === 'input_json_delta') {
            currentToolJson += event.delta.partial_json;
          }
        } else if (event.type === 'content_block_stop') {
          if (currentToolId) {
            let input: Record<string, unknown> = {};
            try {
              input = JSON.parse(currentToolJson) as Record<string, unknown>;
            } catch {
              // If JSON parsing fails, use empty input
            }
            this.logger?.log('info', 'SSE tool_call', {
              id: currentToolId,
              name: currentToolName,
            });
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
        } else if (event.type === 'message_delta') {
          if (event.delta.stop_reason) {
            yield { type: 'done', stopReason: event.delta.stop_reason };
            return;
          }
        } else if (event.type === 'message_stop') {
          this.logger?.log('info', 'SSE message_stop received');
          return;
        }
      }

      this.logger?.log('info', 'Stream completed');
    } catch (error) {
      if (error instanceof Anthropic.AuthenticationError) {
        this.logger?.log('error', 'API error', {
          status: error.status,
          detail: error.message,
        });
        throw new Error(
          `Authentication failed — ${error.message}. Check that your API key is valid.`,
        );
      }
      if (error instanceof Anthropic.APIError) {
        this.logger?.log('error', 'API error', {
          status: error.status,
          detail: error.message,
        });
        throw new Error(
          `Anthropic API error ${String(error.status)}: ${error.message}`,
        );
      }
      throw error;
    }
  }

  /**
   * Map our ChatMessage[] to Anthropic's message format.
   *
   * Anthropic expects tool results as a separate content block within a
   * `user` role message, and tool calls as `tool_use` blocks in an
   * `assistant` message.
   */
  private mapMessages(
    messages: readonly ChatMessage[],
  ): Anthropic.Messages.MessageParam[] {
    const result: Anthropic.Messages.MessageParam[] = [];

    for (const msg of messages) {
      if (msg.toolResults && msg.toolResults.length > 0) {
        const content: Anthropic.Messages.ToolResultBlockParam[] =
          msg.toolResults.map((tr) => ({
            type: 'tool_result' as const,
            tool_use_id: tr.toolCallId,
            content: tr.result,
            ...(tr.isError ? { is_error: true } : {}),
          }));
        result.push({ role: 'user', content });
      } else if (msg.toolCalls && msg.toolCalls.length > 0) {
        const content: Anthropic.Messages.ContentBlockParam[] = [];
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
  private mapTools(
    tools: readonly ToolDefinition[],
  ): Anthropic.Messages.Tool[] {
    return tools.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.inputSchema as Anthropic.Messages.Tool.InputSchema,
    }));
  }
}
