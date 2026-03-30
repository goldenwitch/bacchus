import { FinishReason, GoogleGenerativeAI } from '@google/generative-ai';
import type { Content, Part } from '@google/generative-ai';
import type {
  ChatService,
  ChatEvent,
  ChatMessage,
  ToolDefinition,
  ChatLogger,
} from './types.js';

/**
 * Google Gemini API chat service.
 *
 * Streams responses via the official SDK and maps them to the
 * provider-agnostic {@link ChatEvent} interface.
 */
export class GeminiChatService implements ChatService {
  private readonly genAI: GoogleGenerativeAI;
  private readonly model: string;
  private readonly logger?: ChatLogger;

  constructor(options: {
    apiKey: string;
    model?: string;
    logger?: ChatLogger;
  }) {
    this.genAI = new GoogleGenerativeAI(options.apiKey);
    this.model = options.model ?? 'gemini-2.5-flash';
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

    try {
      const model = this.genAI.getGenerativeModel({
        model: this.model,
        systemInstruction: systemPrompt,
        tools: [{ functionDeclarations: this.mapTools(tools) }],
      });

      const contents = this.mapContents(messages);
      const result = await model.generateContentStream({ contents });

      this.logger?.log('info', 'API response received');

      let hasToolCalls = false;

      for await (const chunk of result.stream) {
        const candidates = chunk.candidates;
        if (!candidates || candidates.length === 0) continue;
        const candidate = candidates[0];

        const parts = candidate.content.parts;

        for (const part of parts) {
          if (part.text) {
            yield { type: 'text', content: part.text };
          }

          if (part.functionCall) {
            hasToolCalls = true;
            // Gemini doesn't use tool call IDs — the functionResponse.name
            // must match the original functionCall.name, so we use that directly.
            const callId = part.functionCall.name;
            this.logger?.log('info', 'Tool call', {
              id: callId,
              name: part.functionCall.name,
            });
            yield {
              type: 'tool_call',
              call: {
                id: callId,
                name: part.functionCall.name,
                input: part.functionCall.args as Record<string, unknown>,
              },
            };
          }
        }

        // Check for finish reason
        const finishReason = candidate.finishReason;
        if (finishReason != null && finishReason !== FinishReason.FINISH_REASON_UNSPECIFIED) {
          const stopReason = hasToolCalls ? 'tool_use' : 'end_turn';
          yield { type: 'done', stopReason };
          return;
        }
      }

      // Stream ended without an explicit finish reason
      const stopReason = hasToolCalls ? 'tool_use' : 'end_turn';
      yield { type: 'done', stopReason };

      this.logger?.log('info', 'Stream completed');
    } catch (error) {
      if (error instanceof Error) {
        const msg = error.message;
        if (msg.includes('API_KEY_INVALID') || msg.includes('401')) {
          this.logger?.log('error', 'API error', { detail: msg });
          throw new Error(
            `Authentication failed — ${msg}. Check that your API key is valid.`,
          );
        }
        this.logger?.log('error', 'API error', { detail: msg });
        throw new Error(`Gemini API error: ${msg}`);
      }
      throw error;
    }
  }

  /**
   * Map our ChatMessage[] to Gemini's Content[] format.
   *
   * Gemini expects `user`/`model` roles with `parts` arrays.
   * Tool calls are `functionCall` parts on `model` messages,
   * and tool results are `functionResponse` parts on `function` messages
   * (Gemini rejects `functionResponse` under the `user` role).
   */
  private mapContents(messages: readonly ChatMessage[]): Content[] {
    const contents: Content[] = [];

    for (const msg of messages) {
      if (msg.toolResults && msg.toolResults.length > 0) {
        // Function responses must use the 'function' role
        contents.push({
          role: 'function',
          parts: msg.toolResults.map(
            (tr) =>
              ({
                functionResponse: {
                  name: tr.toolCallId,
                  response: {
                    result: tr.result,
                    isError: tr.isError ?? false,
                  },
                },
              }) as Part,
          ),
        });
      } else if (msg.toolCalls && msg.toolCalls.length > 0) {
        const parts: Part[] = [];
        if (msg.content) {
          parts.push({ text: msg.content } as Part);
        }
        for (const tc of msg.toolCalls) {
          parts.push({
            functionCall: { name: tc.name, args: tc.input },
          } as Part);
        }
        contents.push({ role: 'model', parts });
      } else {
        const role = msg.role === 'assistant' ? 'model' : 'user';
        contents.push({ role, parts: [{ text: msg.content } as Part] });
      }
    }

    return contents;
  }

  /**
   * Map our ToolDefinition[] to Gemini's functionDeclarations format.
   */
  private mapTools(
    tools: readonly ToolDefinition[],
  ): Array<{
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  }> {
    return tools.map((t) => ({
      name: t.name,
      description: t.description,
      parameters: t.inputSchema,
    }));
  }
}
