import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AnthropicChatService } from '../../src/lib/chat/anthropic.js';
import type {
  ChatEvent,
  ChatMessage,
  ToolDefinition,
} from '../../src/lib/chat/types.js';

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

/** Encode a string as a Uint8Array chunk. */
function encode(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

/** Build a ReadableStream that emits the given chunks sequentially. */
function sseStream(...chunks: string[]): ReadableStream<Uint8Array> {
  let index = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (index < chunks.length) {
        controller.enqueue(encode(chunks[index]!));
        index++;
      } else {
        controller.close();
      }
    },
  });
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

/** Build a minimal successful fetch Response wrapping an SSE stream. */
function okResponse(body: ReadableStream<Uint8Array>): Response {
  return {
    ok: true,
    status: 200,
    body,
    headers: new Headers(),
    statusText: 'OK',
    redirected: false,
    type: 'basic',
    url: '',
    text: () => Promise.resolve(''),
    json: () => Promise.resolve({}),
    blob: () => Promise.resolve(new Blob()),
    arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
    formData: () => Promise.resolve(new FormData()),
    bodyUsed: false,
    clone: () => okResponse(body),
    bytes: () => Promise.resolve(new Uint8Array()),
  } as Response;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AnthropicChatService', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  // -----------------------------------------------------------------------
  // Constructor & request structure
  // -----------------------------------------------------------------------

  it('uses default model and API URL', async () => {
    const stream = sseStream('data: {"type":"message_stop"}\n\n');
    vi.mocked(globalThis.fetch).mockResolvedValue(okResponse(stream));

    const service = new AnthropicChatService({ apiKey: 'sk-test' });
    const messages: ChatMessage[] = [{ role: 'user', content: 'hello' }];

    await collectEvents(service.sendMessage(messages, TOOLS, SYSTEM_PROMPT));

    const [url, init] = vi.mocked(globalThis.fetch).mock.calls[0]!;
    expect(url).toBe('https://api.anthropic.com/v1/messages');

    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.model).toBe('claude-opus-4-6');
    expect(body.stream).toBe(true);
    expect(body.system).toBe(SYSTEM_PROMPT);
    expect(body.max_tokens).toBe(4096);
  });

  it('uses custom model and API URL', async () => {
    const stream = sseStream('data: {"type":"message_stop"}\n\n');
    vi.mocked(globalThis.fetch).mockResolvedValue(okResponse(stream));

    const service = new AnthropicChatService({
      apiKey: 'sk-test',
      model: 'claude-haiku-3',
      apiUrl: 'https://custom.api.com',
    });

    await collectEvents(service.sendMessage([], TOOLS, SYSTEM_PROMPT));

    const [url, init] = vi.mocked(globalThis.fetch).mock.calls[0]!;
    expect(url).toBe('https://custom.api.com/v1/messages');
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.model).toBe('claude-haiku-3');
  });

  it('sends correct headers', async () => {
    const stream = sseStream('data: {"type":"message_stop"}\n\n');
    vi.mocked(globalThis.fetch).mockResolvedValue(okResponse(stream));

    const service = new AnthropicChatService({ apiKey: 'sk-my-key' });
    await collectEvents(service.sendMessage([], [], SYSTEM_PROMPT));

    const init = vi.mocked(globalThis.fetch).mock.calls[0]![1] as RequestInit;
    const headers = init.headers as Record<string, string>;
    expect(headers['x-api-key']).toBe('sk-my-key');
    expect(headers['anthropic-version']).toBe('2023-06-01');
    expect(headers['Content-Type']).toBe('application/json');
    expect(headers['anthropic-dangerous-direct-browser-access']).toBe('true');
  });

  // -----------------------------------------------------------------------
  // mapMessages (tested via fetch body inspection)
  // -----------------------------------------------------------------------

  it('maps a plain user message', async () => {
    const stream = sseStream('data: {"type":"message_stop"}\n\n');
    vi.mocked(globalThis.fetch).mockResolvedValue(okResponse(stream));

    const service = new AnthropicChatService({ apiKey: 'sk-test' });
    const messages: ChatMessage[] = [{ role: 'user', content: 'hello' }];

    await collectEvents(service.sendMessage(messages, [], SYSTEM_PROMPT));

    const body = JSON.parse(
      (vi.mocked(globalThis.fetch).mock.calls[0]![1] as RequestInit)
        .body as string,
    );
    expect(body.messages).toEqual([{ role: 'user', content: 'hello' }]);
  });

  it('maps a message with tool calls to tool_use blocks', async () => {
    const stream = sseStream('data: {"type":"message_stop"}\n\n');
    vi.mocked(globalThis.fetch).mockResolvedValue(okResponse(stream));

    const service = new AnthropicChatService({ apiKey: 'sk-test' });
    const messages: ChatMessage[] = [
      {
        role: 'assistant',
        content: 'Let me add that.',
        toolCalls: [{ id: 'tc1', name: 'add_task', input: { id: 'foo' } }],
      },
    ];

    await collectEvents(service.sendMessage(messages, [], SYSTEM_PROMPT));

    const body = JSON.parse(
      (vi.mocked(globalThis.fetch).mock.calls[0]![1] as RequestInit)
        .body as string,
    );
    expect(body.messages).toEqual([
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
    const stream = sseStream('data: {"type":"message_stop"}\n\n');
    vi.mocked(globalThis.fetch).mockResolvedValue(okResponse(stream));

    const service = new AnthropicChatService({ apiKey: 'sk-test' });
    const messages: ChatMessage[] = [
      {
        role: 'assistant',
        content: '',
        toolCalls: [{ id: 'tc1', name: 'add_task', input: { id: 'bar' } }],
      },
    ];

    await collectEvents(service.sendMessage(messages, [], SYSTEM_PROMPT));

    const body = JSON.parse(
      (vi.mocked(globalThis.fetch).mock.calls[0]![1] as RequestInit)
        .body as string,
    );
    // Should not include a text block when content is empty
    expect(body.messages).toEqual([
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
    const stream = sseStream('data: {"type":"message_stop"}\n\n');
    vi.mocked(globalThis.fetch).mockResolvedValue(okResponse(stream));

    const service = new AnthropicChatService({ apiKey: 'sk-test' });
    const messages: ChatMessage[] = [
      {
        role: 'user',
        content: '',
        toolResults: [{ toolCallId: 'tc1', result: '{"ok": true}' }],
      },
    ];

    await collectEvents(service.sendMessage(messages, [], SYSTEM_PROMPT));

    const body = JSON.parse(
      (vi.mocked(globalThis.fetch).mock.calls[0]![1] as RequestInit)
        .body as string,
    );
    expect(body.messages).toEqual([
      {
        role: 'user',
        content: [
          { type: 'tool_result', tool_use_id: 'tc1', content: '{"ok": true}' },
        ],
      },
    ]);
  });

  it('maps tool results with isError flag', async () => {
    const stream = sseStream('data: {"type":"message_stop"}\n\n');
    vi.mocked(globalThis.fetch).mockResolvedValue(okResponse(stream));

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

    const body = JSON.parse(
      (vi.mocked(globalThis.fetch).mock.calls[0]![1] as RequestInit)
        .body as string,
    );
    expect(body.messages[0].content[0].is_error).toBe(true);
  });

  // -----------------------------------------------------------------------
  // mapTools
  // -----------------------------------------------------------------------

  it('maps tool definitions to Anthropic format', async () => {
    const stream = sseStream('data: {"type":"message_stop"}\n\n');
    vi.mocked(globalThis.fetch).mockResolvedValue(okResponse(stream));

    const service = new AnthropicChatService({ apiKey: 'sk-test' });
    await collectEvents(service.sendMessage([], TOOLS, SYSTEM_PROMPT));

    const body = JSON.parse(
      (vi.mocked(globalThis.fetch).mock.calls[0]![1] as RequestInit)
        .body as string,
    );
    expect(body.tools).toEqual([
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

  it('throws on non-OK response', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue({
      ok: false,
      status: 429,
      text: () => Promise.resolve('Rate limited'),
    } as unknown as Response);

    const service = new AnthropicChatService({ apiKey: 'sk-test' });
    await expect(
      collectEvents(service.sendMessage([], [], SYSTEM_PROMPT)),
    ).rejects.toThrow('Anthropic API error 429: Rate limited');
  });

  it('throws when response body is null', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue({
      ok: true,
      status: 200,
      body: null,
    } as unknown as Response);

    const service = new AnthropicChatService({ apiKey: 'sk-test' });
    await expect(
      collectEvents(service.sendMessage([], [], SYSTEM_PROMPT)),
    ).rejects.toThrow('Response body is null');
  });

  // -----------------------------------------------------------------------
  // parseSSEStream — text streaming
  // -----------------------------------------------------------------------

  it('yields text events from SSE text_delta', async () => {
    const stream = sseStream(
      'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Hello "}}\n\n' +
        'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"world"}}\n\n' +
        'data: {"type":"message_delta","delta":{"stop_reason":"end_turn"}}\n\n' +
        'data: {"type":"message_stop"}\n\n',
    );
    vi.mocked(globalThis.fetch).mockResolvedValue(okResponse(stream));

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
  // parseSSEStream — tool use streaming
  // -----------------------------------------------------------------------

  it('yields tool_call events from SSE tool_use blocks', async () => {
    const stream = sseStream(
      'data: {"type":"content_block_start","content_block":{"type":"tool_use","id":"tc_1","name":"add_task"}}\n\n' +
        'data: {"type":"content_block_delta","delta":{"type":"input_json_delta","partial_json":"{\\"id\\":"}}\n\n' +
        'data: {"type":"content_block_delta","delta":{"type":"input_json_delta","partial_json":"\\"foo\\"}"}}\n\n' +
        'data: {"type":"content_block_stop"}\n\n' +
        'data: {"type":"message_delta","delta":{"stop_reason":"tool_use"}}\n\n',
    );
    vi.mocked(globalThis.fetch).mockResolvedValue(okResponse(stream));

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

  it('handles content_block_stop without active tool (text block)', async () => {
    const stream = sseStream(
      'data: {"type":"content_block_start","content_block":{"type":"text","text":""}}\n\n' +
        'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"hi"}}\n\n' +
        'data: {"type":"content_block_stop"}\n\n' +
        'data: {"type":"message_stop"}\n\n',
    );
    vi.mocked(globalThis.fetch).mockResolvedValue(okResponse(stream));

    const service = new AnthropicChatService({ apiKey: 'sk-test' });
    const events = await collectEvents(
      service.sendMessage([], [], SYSTEM_PROMPT),
    );

    // Only text event, no spurious tool_call
    expect(events).toEqual([{ type: 'text', content: 'hi' }]);
  });

  // -----------------------------------------------------------------------
  // parseSSEStream — edge cases
  // -----------------------------------------------------------------------

  it('handles SSE data split across multiple chunks', async () => {
    // The SSE line is split across two chunks
    const stream = sseStream(
      'data: {"type":"content_block_del',
      'ta","delta":{"type":"text_delta","text":"chunked"}}\n\n' +
        'data: {"type":"message_stop"}\n\n',
    );
    vi.mocked(globalThis.fetch).mockResolvedValue(okResponse(stream));

    const service = new AnthropicChatService({ apiKey: 'sk-test' });
    const events = await collectEvents(
      service.sendMessage([], [], SYSTEM_PROMPT),
    );

    expect(events).toEqual([{ type: 'text', content: 'chunked' }]);
  });

  it('skips malformed JSON in SSE data', async () => {
    const stream = sseStream(
      'data: not-json\n\n' +
        'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"ok"}}\n\n' +
        'data: {"type":"message_stop"}\n\n',
    );
    vi.mocked(globalThis.fetch).mockResolvedValue(okResponse(stream));

    const service = new AnthropicChatService({ apiKey: 'sk-test' });
    const events = await collectEvents(
      service.sendMessage([], [], SYSTEM_PROMPT),
    );

    expect(events).toEqual([{ type: 'text', content: 'ok' }]);
  });

  it('skips empty data and [DONE] sentinel', async () => {
    const stream = sseStream(
      'data: \n\n' +
        'data: [DONE]\n\n' +
        'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"after"}}\n\n' +
        'data: {"type":"message_stop"}\n\n',
    );
    vi.mocked(globalThis.fetch).mockResolvedValue(okResponse(stream));

    const service = new AnthropicChatService({ apiKey: 'sk-test' });
    const events = await collectEvents(
      service.sendMessage([], [], SYSTEM_PROMPT),
    );

    expect(events).toEqual([{ type: 'text', content: 'after' }]);
  });

  it('ignores non-data SSE lines', async () => {
    const stream = sseStream(
      'event: message\n' +
        'retry: 5000\n' +
        'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"works"}}\n\n' +
        'data: {"type":"message_stop"}\n\n',
    );
    vi.mocked(globalThis.fetch).mockResolvedValue(okResponse(stream));

    const service = new AnthropicChatService({ apiKey: 'sk-test' });
    const events = await collectEvents(
      service.sendMessage([], [], SYSTEM_PROMPT),
    );

    expect(events).toEqual([{ type: 'text', content: 'works' }]);
  });

  it('handles tool with malformed JSON input gracefully', async () => {
    const stream = sseStream(
      'data: {"type":"content_block_start","content_block":{"type":"tool_use","id":"tc_x","name":"add_task"}}\n\n' +
        'data: {"type":"content_block_delta","delta":{"type":"input_json_delta","partial_json":"{bad"}}\n\n' +
        'data: {"type":"content_block_stop"}\n\n' +
        'data: {"type":"message_stop"}\n\n',
    );
    vi.mocked(globalThis.fetch).mockResolvedValue(okResponse(stream));

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
    const stream = sseStream(
      'data: {"type":"message_delta","delta":{"usage":{"output_tokens":10}}}\n\n' +
        'data: {"type":"message_stop"}\n\n',
    );
    vi.mocked(globalThis.fetch).mockResolvedValue(okResponse(stream));

    const service = new AnthropicChatService({ apiKey: 'sk-test' });
    const events = await collectEvents(
      service.sendMessage([], [], SYSTEM_PROMPT),
    );

    // No done event because stop_reason was absent
    expect(events).toEqual([]);
  });
});
