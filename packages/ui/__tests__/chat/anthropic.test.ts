import { describe, it, expect, vi, beforeEach } from 'vitest';
import Anthropic from '@anthropic-ai/sdk';
import { AnthropicChatService } from '../../src/lib/chat/anthropic.js';
import type {
  ChatEvent,
  ChatMessage,
  ToolDefinition,
} from '../../src/lib/chat/types.js';

// ---------------------------------------------------------------------------
// Module mock — replaces @anthropic-ai/sdk with a controllable constructor
// and lightweight error classes that satisfy instanceof checks.
// ---------------------------------------------------------------------------

vi.mock('@anthropic-ai/sdk', () => {
  class APIError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  }
  class AuthenticationError extends APIError {
    constructor(message: string) {
      super(401, message);
    }
  }

  const MockAnthropic = vi.fn();
  Object.assign(MockAnthropic, { APIError, AuthenticationError });
  return { default: MockAnthropic };
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TOOLS: ToolDefinition[] = [
  {
    name: 'add_task',
    description: 'Add a task',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string' } },
      required: ['id'],
    },
  },
];

const SYSTEM_PROMPT = 'You are a helpful assistant.';

/** Build an async iterable that yields the given SDK stream events. */
async function* mockStream(
  events: Record<string, unknown>[],
): AsyncGenerator<Record<string, unknown>> {
  for (const event of events) {
    yield event;
  }
}

/** Collect all ChatEvents from an async generator. */
async function collectEvents(
  gen: AsyncGenerator<ChatEvent, void, unknown>,
): Promise<ChatEvent[]> {
  const events: ChatEvent[] = [];
  for await (const e of gen) {
    events.push(e);
  }
  return events;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AnthropicChatService', () => {
  let mockCreate: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockCreate = vi.fn();
    vi.mocked(Anthropic).mockImplementation(
      () =>
        ({
          messages: { create: mockCreate },
        }) as unknown as Anthropic,
    );
  });

  // -----------------------------------------------------------------------
  // Constructor & SDK initialization
  // -----------------------------------------------------------------------

  it('passes correct options to Anthropic constructor', async () => {
    mockCreate.mockResolvedValue(mockStream([{ type: 'message_stop' }]));

    const service = new AnthropicChatService({ apiKey: 'sk-test' });
    await collectEvents(service.sendMessage([], [], SYSTEM_PROMPT));

    expect(vi.mocked(Anthropic).mock.calls[0]![0]).toEqual({
      apiKey: 'sk-test',
      baseURL: 'https://api.anthropic.com',
      timeout: 120_000,
      dangerouslyAllowBrowser: true,
      maxRetries: 0,
    });
  });

  it('passes custom options to Anthropic constructor and create', async () => {
    mockCreate.mockResolvedValue(mockStream([{ type: 'message_stop' }]));

    const service = new AnthropicChatService({
      apiKey: 'sk-test',
      model: 'claude-haiku-3',
      apiUrl: 'https://custom.api.com',
      requestTimeoutMs: 60_000,
    });
    await collectEvents(service.sendMessage([], [], SYSTEM_PROMPT));

    const ctorArgs = vi.mocked(Anthropic).mock.calls[0]![0] as Record<
      string,
      unknown
    >;
    expect(ctorArgs.baseURL).toBe('https://custom.api.com');
    expect(ctorArgs.timeout).toBe(60_000);

    expect(mockCreate.mock.calls[0]![0].model).toBe('claude-haiku-3');
  });

  // -----------------------------------------------------------------------
  // Request structure
  // -----------------------------------------------------------------------

  it('sends correct parameters to messages.create', async () => {
    mockCreate.mockResolvedValue(mockStream([{ type: 'message_stop' }]));

    const service = new AnthropicChatService({ apiKey: 'sk-test' });
    const messages: ChatMessage[] = [{ role: 'user', content: 'hello' }];
    await collectEvents(service.sendMessage(messages, TOOLS, SYSTEM_PROMPT));

    const args = mockCreate.mock.calls[0]![0];
    expect(args).toEqual(
      expect.objectContaining({
        model: 'claude-opus-4-6',
        max_tokens: 4096,
        system: SYSTEM_PROMPT,
        stream: true,
      }),
    );
    expect(args.messages).toEqual([{ role: 'user', content: 'hello' }]);
    expect(args.tools).toEqual([
      {
        name: 'add_task',
        description: 'Add a task',
        input_schema: {
          type: 'object',
          properties: { id: { type: 'string' } },
          required: ['id'],
        },
      },
    ]);
  });

  // -----------------------------------------------------------------------
  // mapMessages (tested via mockCreate args inspection)
  // -----------------------------------------------------------------------

  it('maps a plain user message', async () => {
    mockCreate.mockResolvedValue(mockStream([{ type: 'message_stop' }]));

    const service = new AnthropicChatService({ apiKey: 'sk-test' });
    const messages: ChatMessage[] = [{ role: 'user', content: 'hello' }];
    await collectEvents(service.sendMessage(messages, [], SYSTEM_PROMPT));

    const args = mockCreate.mock.calls[0]![0];
    expect(args.messages).toEqual([{ role: 'user', content: 'hello' }]);
  });

  it('maps a message with tool calls to tool_use blocks', async () => {
    mockCreate.mockResolvedValue(mockStream([{ type: 'message_stop' }]));

    const service = new AnthropicChatService({ apiKey: 'sk-test' });
    const messages: ChatMessage[] = [
      {
        role: 'assistant',
        content: 'Let me add that.',
        toolCalls: [{ id: 'tc1', name: 'add_task', input: { id: 'foo' } }],
      },
    ];
    await collectEvents(service.sendMessage(messages, [], SYSTEM_PROMPT));

    const args = mockCreate.mock.calls[0]![0];
    expect(args.messages).toEqual([
      {
        role: 'assistant',
        content: [
          { type: 'text', text: 'Let me add that.' },
          {
            type: 'tool_use',
            id: 'tc1',
            name: 'add_task',
            input: { id: 'foo' },
          },
        ],
      },
    ]);
  });

  it('maps assistant tool calls without text content', async () => {
    mockCreate.mockResolvedValue(mockStream([{ type: 'message_stop' }]));

    const service = new AnthropicChatService({ apiKey: 'sk-test' });
    const messages: ChatMessage[] = [
      {
        role: 'assistant',
        content: '',
        toolCalls: [{ id: 'tc1', name: 'add_task', input: { id: 'bar' } }],
      },
    ];
    await collectEvents(service.sendMessage(messages, [], SYSTEM_PROMPT));

    const args = mockCreate.mock.calls[0]![0];
    // Should not include a text block when content is empty
    expect(args.messages).toEqual([
      {
        role: 'assistant',
        content: [
          {
            type: 'tool_use',
            id: 'tc1',
            name: 'add_task',
            input: { id: 'bar' },
          },
        ],
      },
    ]);
  });

  it('maps tool results to user messages with tool_result blocks', async () => {
    mockCreate.mockResolvedValue(mockStream([{ type: 'message_stop' }]));

    const service = new AnthropicChatService({ apiKey: 'sk-test' });
    const messages: ChatMessage[] = [
      {
        role: 'user',
        content: '',
        toolResults: [{ toolCallId: 'tc1', result: '{"ok": true}' }],
      },
    ];
    await collectEvents(service.sendMessage(messages, [], SYSTEM_PROMPT));

    const args = mockCreate.mock.calls[0]![0];
    expect(args.messages).toEqual([
      {
        role: 'user',
        content: [
          { type: 'tool_result', tool_use_id: 'tc1', content: '{"ok": true}' },
        ],
      },
    ]);
  });

  it('maps tool results with isError flag', async () => {
    mockCreate.mockResolvedValue(mockStream([{ type: 'message_stop' }]));

    const service = new AnthropicChatService({ apiKey: 'sk-test' });
    const messages: ChatMessage[] = [
      {
        role: 'user',
        content: '',
        toolResults: [
          { toolCallId: 'tc1', result: 'not found', isError: true },
        ],
      },
    ];
    await collectEvents(service.sendMessage(messages, [], SYSTEM_PROMPT));

    const args = mockCreate.mock.calls[0]![0];
    expect(args.messages[0].content[0].is_error).toBe(true);
  });

  // -----------------------------------------------------------------------
  // mapTools
  // -----------------------------------------------------------------------

  it('maps tool definitions to Anthropic format', async () => {
    mockCreate.mockResolvedValue(mockStream([{ type: 'message_stop' }]));

    const service = new AnthropicChatService({ apiKey: 'sk-test' });
    await collectEvents(service.sendMessage([], TOOLS, SYSTEM_PROMPT));

    const args = mockCreate.mock.calls[0]![0];
    expect(args.tools).toEqual([
      {
        name: 'add_task',
        description: 'Add a task',
        input_schema: {
          type: 'object',
          properties: { id: { type: 'string' } },
          required: ['id'],
        },
      },
    ]);
  });

  // -----------------------------------------------------------------------
  // Error handling
  // -----------------------------------------------------------------------

  it('throws a friendly message on authentication error', async () => {
    const AuthError = (Anthropic as unknown as Record<string, unknown>)
      .AuthenticationError as new (msg: string) => Error;
    mockCreate.mockRejectedValue(new AuthError('invalid x-api-key'));

    const service = new AnthropicChatService({ apiKey: 'sk-test' });
    await expect(
      collectEvents(service.sendMessage([], [], SYSTEM_PROMPT)),
    ).rejects.toThrow(
      'Authentication failed — invalid x-api-key. Check that your API key is valid.',
    );
  });

  it('throws on API error with status and message', async () => {
    const ApiError = (Anthropic as unknown as Record<string, unknown>)
      .APIError as new (status: number, msg: string) => Error;
    mockCreate.mockRejectedValue(new ApiError(429, 'Too many requests'));

    const service = new AnthropicChatService({ apiKey: 'sk-test' });
    await expect(
      collectEvents(service.sendMessage([], [], SYSTEM_PROMPT)),
    ).rejects.toThrow('Anthropic API error 429: Too many requests');
  });

  it('re-throws non-API errors', async () => {
    mockCreate.mockRejectedValue(new Error('Network failure'));

    const service = new AnthropicChatService({ apiKey: 'sk-test' });
    await expect(
      collectEvents(service.sendMessage([], [], SYSTEM_PROMPT)),
    ).rejects.toThrow('Network failure');
  });

  // -----------------------------------------------------------------------
  // Stream event mapping — text
  // -----------------------------------------------------------------------

  it('yields text events from text_delta', async () => {
    mockCreate.mockResolvedValue(
      mockStream([
        {
          type: 'content_block_delta',
          index: 0,
          delta: { type: 'text_delta', text: 'Hello ' },
        },
        {
          type: 'content_block_delta',
          index: 0,
          delta: { type: 'text_delta', text: 'world' },
        },
        {
          type: 'message_delta',
          delta: { stop_reason: 'end_turn' },
          usage: { output_tokens: 10 },
        },
      ]),
    );

    const service = new AnthropicChatService({ apiKey: 'sk-test' });
    const events = await collectEvents(
      service.sendMessage([], [], SYSTEM_PROMPT),
    );

    expect(events).toEqual([
      { type: 'text', content: 'Hello ' },
      { type: 'text', content: 'world' },
      { type: 'done', stopReason: 'end_turn' },
    ]);
  });

  // -----------------------------------------------------------------------
  // Stream event mapping — tool use
  // -----------------------------------------------------------------------

  it('yields tool_call events from tool_use blocks', async () => {
    mockCreate.mockResolvedValue(
      mockStream([
        {
          type: 'content_block_start',
          index: 0,
          content_block: {
            type: 'tool_use',
            id: 'tc_1',
            name: 'add_task',
            input: {},
          },
        },
        {
          type: 'content_block_delta',
          index: 0,
          delta: { type: 'input_json_delta', partial_json: '{"id":' },
        },
        {
          type: 'content_block_delta',
          index: 0,
          delta: { type: 'input_json_delta', partial_json: '"foo"}' },
        },
        { type: 'content_block_stop', index: 0 },
        {
          type: 'message_delta',
          delta: { stop_reason: 'tool_use' },
          usage: { output_tokens: 10 },
        },
      ]),
    );

    const service = new AnthropicChatService({ apiKey: 'sk-test' });
    const events = await collectEvents(
      service.sendMessage([], TOOLS, SYSTEM_PROMPT),
    );

    expect(events).toEqual([
      {
        type: 'tool_call',
        call: { id: 'tc_1', name: 'add_task', input: { id: 'foo' } },
      },
      { type: 'done', stopReason: 'tool_use' },
    ]);
  });

  it('handles content_block_stop without active tool', async () => {
    mockCreate.mockResolvedValue(
      mockStream([
        {
          type: 'content_block_start',
          index: 0,
          content_block: { type: 'text', text: '' },
        },
        {
          type: 'content_block_delta',
          index: 0,
          delta: { type: 'text_delta', text: 'hi' },
        },
        { type: 'content_block_stop', index: 0 },
        { type: 'message_stop' },
      ]),
    );

    const service = new AnthropicChatService({ apiKey: 'sk-test' });
    const events = await collectEvents(
      service.sendMessage([], [], SYSTEM_PROMPT),
    );

    // Only text event, no spurious tool_call
    expect(events).toEqual([{ type: 'text', content: 'hi' }]);
  });

  // -----------------------------------------------------------------------
  // Edge cases
  // -----------------------------------------------------------------------

  it('handles tool with malformed JSON input gracefully', async () => {
    mockCreate.mockResolvedValue(
      mockStream([
        {
          type: 'content_block_start',
          index: 0,
          content_block: {
            type: 'tool_use',
            id: 'tc_x',
            name: 'add_task',
            input: {},
          },
        },
        {
          type: 'content_block_delta',
          index: 0,
          delta: { type: 'input_json_delta', partial_json: '{bad' },
        },
        { type: 'content_block_stop', index: 0 },
        { type: 'message_stop' },
      ]),
    );

    const service = new AnthropicChatService({ apiKey: 'sk-test' });
    const events = await collectEvents(
      service.sendMessage([], TOOLS, SYSTEM_PROMPT),
    );

    // Should still yield a tool_call with empty input
    expect(events).toEqual([
      {
        type: 'tool_call',
        call: { id: 'tc_x', name: 'add_task', input: {} },
      },
    ]);
  });

  it('message_delta without stop_reason is ignored', async () => {
    mockCreate.mockResolvedValue(
      mockStream([
        {
          type: 'message_delta',
          delta: { stop_reason: null },
          usage: { output_tokens: 10 },
        },
        { type: 'message_stop' },
      ]),
    );

    const service = new AnthropicChatService({ apiKey: 'sk-test' });
    const events = await collectEvents(
      service.sendMessage([], [], SYSTEM_PROMPT),
    );

    // No done event because stop_reason was absent
    expect(events).toEqual([]);
  });
});
