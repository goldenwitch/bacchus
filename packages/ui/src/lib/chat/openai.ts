import OpenAI from 'openai';
import type {
  ChatService,
  ChatEvent,
  ChatMessage,
  ToolDefinition,
  ChatLogger,
} from './types.js';

/**
 * OpenAI Chat Completions API chat service.
 *
 * Streams responses via the official SDK and maps them to the
 * provider-agnostic {@link ChatEvent} interface.
 */
export class OpenAIChatService implements ChatService {
  private readonly client: OpenAI;
  private readonly model: string;
  private readonly logger?: ChatLogger;

  constructor(options: {
    apiKey: string;
    model?: string;
    apiUrl?: string;
    requestTimeoutMs?: number;
    logger?: ChatLogger;
  }) {
    this.client = new OpenAI({
      apiKey: options.apiKey,
      baseURL: options.apiUrl ?? 'https://api.openai.com/v1',
      timeout: options.requestTimeoutMs ?? 120_000,
      dangerouslyAllowBrowser: true,
      maxRetries: 0,
    });
    this.model = options.model ?? 'gpt-4o';
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

    // Track partial tool calls being streamed
    const pendingTools = new Map<
      number,
      { id: string; name: string; args: string }
    >();

    try {
      const stream = await this.client.chat.completions.create({
        model: this.model,
        max_tokens: 4096,
        messages: this.mapMessages(messages, systemPrompt),
        tools: this.mapTools(tools),
        stream: true,
      });

      this.logger?.log('info', 'API response received', { status: 200 });

      for await (const chunk of stream) {
        const choice = chunk.choices[0];
        if (!choice) continue;

        const delta = choice.delta;

        // Text content
        if (delta.content) {
          yield { type: 'text', content: delta.content };
        }

        // Tool call chunks — OpenAI streams these incrementally
        if (delta.tool_calls) {
          for (const tc of delta.tool_calls) {
            const idx = tc.index;
            if (!pendingTools.has(idx)) {
              pendingTools.set(idx, {
                id: tc.id ?? '',
                name: tc.function?.name ?? '',
                args: '',
              });
            }
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- guaranteed by has() check above
            const pending = pendingTools.get(idx)!;
            if (tc.id) pending.id = tc.id;
            if (tc.function?.name) pending.name = tc.function.name;
            if (tc.function?.arguments) pending.args += tc.function.arguments;
          }
        }

        // Finish reason
        if (choice.finish_reason) {
          // Emit any accumulated tool calls
          for (const [, pending] of pendingTools) {
            let input: Record<string, unknown> = {};
            try {
              input = JSON.parse(pending.args) as Record<string, unknown>;
            } catch {
              // malformed JSON — use empty input
            }
            this.logger?.log('info', 'Tool call', {
              id: pending.id,
              name: pending.name,
            });
            yield {
              type: 'tool_call',
              call: {
                id: pending.id,
                name: pending.name,
                input,
              },
            };
          }
          pendingTools.clear();

          // Normalize OpenAI finish reasons to provider-agnostic values
          // expected by the orchestrator ('tool_use' / 'end_turn').
          const stopReason =
            choice.finish_reason === 'tool_calls' ? 'tool_use' : 'end_turn';
          yield { type: 'done', stopReason };
          return;
        }
      }

      this.logger?.log('info', 'Stream completed');
    } catch (error) {
      if (error instanceof OpenAI.AuthenticationError) {
        this.logger?.log('error', 'API error', {
          status: error.status,
          detail: error.message,
        });
        throw new Error(
          `Authentication failed — ${error.message}. Check that your API key is valid.`,
        );
      }
      if (error instanceof OpenAI.APIError) {
        this.logger?.log('error', 'API error', {
          status: error.status,
          detail: error.message,
        });
        throw new Error(
          `OpenAI API error ${String(error.status)}: ${error.message}`,
        );
      }
      throw error;
    }
  }

  /**
   * Map our ChatMessage[] to OpenAI's message format.
   *
   * OpenAI uses `tool` role messages for tool results and `tool_calls`
   * array on assistant messages for tool invocations.
   */
  private mapMessages(
    messages: readonly ChatMessage[],
    systemPrompt: string,
  ): OpenAI.ChatCompletionMessageParam[] {
    const result: OpenAI.ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt },
    ];

    for (const msg of messages) {
      if (msg.toolResults && msg.toolResults.length > 0) {
        // Each tool result is a separate message with role 'tool'
        for (const tr of msg.toolResults) {
          result.push({
            role: 'tool',
            tool_call_id: tr.toolCallId,
            content: tr.result,
          });
        }
      } else if (msg.toolCalls && msg.toolCalls.length > 0) {
        result.push({
          role: 'assistant',
          content: msg.content || null,
          tool_calls: msg.toolCalls.map((tc) => ({
            id: tc.id,
            type: 'function' as const,
            function: {
              name: tc.name,
              arguments: JSON.stringify(tc.input),
            },
          })),
        });
      } else {
        result.push({ role: msg.role, content: msg.content });
      }
    }

    return result;
  }

  /**
   * Map our ToolDefinition[] to OpenAI's tool format.
   */
  private mapTools(
    tools: readonly ToolDefinition[],
  ): OpenAI.ChatCompletionTool[] {
    return tools.map((t) => ({
      type: 'function' as const,
      function: {
        name: t.name,
        description: t.description,
        parameters: t.inputSchema,
      },
    }));
  }
}
