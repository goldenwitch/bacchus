import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockOrchestrator = {
  setGraph: vi.fn(),
  getMessages: vi.fn(() => []),
  setMessages: vi.fn(),
  clearHistory: vi.fn(),
  send: vi.fn(async function* () {
    yield { type: 'text' as const, content: 'hi' };
    yield { type: 'done' as const };
  }),
};

// Mock dependencies before importing session
vi.mock('../../src/lib/chat/apikey.js', () => ({
  getApiKey: vi.fn(() => null),
  setApiKey: vi.fn(),
}));

vi.mock('../../src/lib/chat/providers.js', () => ({
  getActiveProvider: vi.fn(() => 'anthropic'),
  setActiveProvider: vi.fn(),
  createChatService: vi.fn(() => Promise.resolve({})),
  PROVIDERS: {
    anthropic: {
      label: 'Anthropic',
      placeholder: 'sk-ant-...',
      storageKey: 'bacchus:anthropic-key',
      envVar: 'VITE_ANTHROPIC_API_KEY',
      defaultModel: 'claude-opus-4-6',
    },
    openai: {
      label: 'OpenAI',
      placeholder: 'sk-...',
      storageKey: 'bacchus:openai-key',
      envVar: 'VITE_OPENAI_API_KEY',
      defaultModel: 'gpt-4o',
    },
    gemini: {
      label: 'Gemini',
      placeholder: 'AI...',
      storageKey: 'bacchus:gemini-key',
      envVar: 'VITE_GEMINI_API_KEY',
      defaultModel: 'gemini-2.5-flash',
    },
  },
  PROVIDER_IDS: ['anthropic', 'openai', 'gemini'],
}));

vi.mock('../../src/lib/chat/orchestrator.js', () => ({
  ChatOrchestrator: vi.fn(() => mockOrchestrator),
}));

import { ChatSession } from '../../src/lib/chat/session.js';
import { getApiKey, setApiKey } from '../../src/lib/chat/apikey.js';

describe('ChatSession', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getApiKey).mockReturnValue(null);
  });

  it('reads API key on construction', () => {
    vi.mocked(getApiKey).mockReturnValue('sk-test');
    const session = new ChatSession();
    expect(session.apiKey).toBe('sk-test');
  });

  it('starts not ready without API key', () => {
    const session = new ChatSession();
    expect(session.isReady).toBe(false);
  });

  it('becomes ready after saveApiKey', async () => {
    const session = new ChatSession();
    session.saveApiKey('sk-key', null);
    // saveApiKey fires async initOrchestrator; wait for the microtask
    await vi.waitFor(() => expect(session.isReady).toBe(true));
    expect(setApiKey).toHaveBeenCalledWith('sk-key', 'anthropic');
    expect(session.apiKey).toBe('sk-key');
  });

  it('initOrchestrator does nothing without API key', async () => {
    const session = new ChatSession();
    await session.initOrchestrator(null);
    expect(session.isReady).toBe(false);
  });

  it('setGraph forwards to orchestrator', async () => {
    const session = new ChatSession();
    session.saveApiKey('sk-key', null);
    await vi.waitFor(() => expect(session.isReady).toBe(true));
    session.setGraph(null);
    expect(mockOrchestrator.setGraph).toHaveBeenCalledWith(null);
  });

  it('getChatMessages returns empty without orchestrator', () => {
    const session = new ChatSession();
    expect(session.getChatMessages()).toEqual([]);
  });

  it('getChatMessages delegates to orchestrator', async () => {
    const msgs = [{ role: 'user', content: 'hi' }];
    mockOrchestrator.getMessages.mockReturnValue(msgs);
    const session = new ChatSession();
    session.saveApiKey('sk-key', null);
    await vi.waitFor(() => expect(session.isReady).toBe(true));
    expect(session.getChatMessages()).toBe(msgs);
  });

  it('setChatMessages delegates to orchestrator', async () => {
    const session = new ChatSession();
    session.saveApiKey('sk-key', null);
    await vi.waitFor(() => expect(session.isReady).toBe(true));
    const msgs = [{ role: 'user' as const, content: 'test' }];
    session.setChatMessages(msgs);
    expect(mockOrchestrator.setMessages).toHaveBeenCalledWith(msgs);
  });

  it('clear resets state and orchestrator', async () => {
    const session = new ChatSession();
    session.saveApiKey('sk-key', null);
    await vi.waitFor(() => expect(session.isReady).toBe(true));
    session.displayMessages = [{ type: 'user' as const, content: 'hello' }];
    session.inputDraft = 'some text';
    session.isLoading = true;

    session.clear();

    expect(session.displayMessages).toEqual([]);
    expect(session.inputDraft).toBe('');
    expect(session.isLoading).toBe(false);
    expect(mockOrchestrator.clearHistory).toHaveBeenCalled();
  });

  it('processMessage updates displayMessages from orchestrator', async () => {
    const session = new ChatSession();
    session.saveApiKey('sk-key', null);
    await vi.waitFor(() => expect(session.isReady).toBe(true));

    await session.processMessage('hello');

    // Should contain the user message + the assistant reply
    expect(session.displayMessages).toEqual([
      { type: 'user', content: 'hello' },
      { type: 'assistant', content: 'hi' },
    ]);
    expect(session.isLoading).toBe(false);
  });

  it('processMessage does nothing without orchestrator', async () => {
    const session = new ChatSession();
    await session.processMessage('hello');
    expect(session.displayMessages).toEqual([]);
  });

  it('processMessage does nothing if already loading', async () => {
    const session = new ChatSession();
    session.saveApiKey('sk-key', null);
    await vi.waitFor(() => expect(session.isReady).toBe(true));
    session.isLoading = true;

    await session.processMessage('hello');
    expect(session.displayMessages).toEqual([]);
  });

  it('resets isLoading on error', async () => {
    // eslint-disable-next-line require-yield
    mockOrchestrator.send.mockImplementation(async function* () {
      throw new Error('boom');
    });

    const session = new ChatSession();
    session.saveApiKey('sk-key', null);
    await vi.waitFor(() => expect(session.isReady).toBe(true));

    await session.processMessage('hello');

    expect(session.isLoading).toBe(false);
    // Should contain user message + error message
    expect(session.displayMessages).toHaveLength(2);
    expect(session.displayMessages[1]).toEqual({
      type: 'error',
      message: 'boom',
    });
  });

  it('calls onGraphUpdate callback on graph_update events', async () => {
    const fakeGraph = { order: [], tasks: {} };
    mockOrchestrator.send.mockImplementation(async function* () {
      yield { type: 'graph_update' as const, graph: fakeGraph };
      yield { type: 'done' as const };
    });

    const session = new ChatSession();
    session.saveApiKey('sk-key', null);
    await vi.waitFor(() => expect(session.isReady).toBe(true));
    const callback = vi.fn();
    session.onGraphUpdate = callback;

    await session.processMessage('create a graph');

    expect(callback).toHaveBeenCalledWith(fakeGraph);
  });

  it('appends tool_exec events to displayMessages', async () => {
    mockOrchestrator.send.mockImplementation(async function* () {
      yield {
        type: 'tool_exec' as const,
        name: 'add_task',
        result: 'Added task foo',
        isError: false,
        call: { id: 'tc1', name: 'add_task', input: {} },
        detail: { type: 'add_task' as const, id: 'foo', name: 'Foo' },
      };
      yield { type: 'done' as const };
    });

    const session = new ChatSession();
    session.saveApiKey('sk-key', null);
    await vi.waitFor(() => expect(session.isReady).toBe(true));

    await session.processMessage('add a task');

    expect(session.displayMessages).toHaveLength(2); // user + tool
    expect(session.displayMessages[1]!.type).toBe('tool');
  });

  it('accumulates multiple text events into a single assistant message', async () => {
    mockOrchestrator.send.mockImplementation(async function* () {
      yield { type: 'text' as const, content: 'Hello' };
      yield { type: 'text' as const, content: ' world' };
      yield { type: 'text' as const, content: '!' };
      yield { type: 'done' as const };
    });

    const session = new ChatSession();
    session.saveApiKey('sk-key', null);
    await vi.waitFor(() => expect(session.isReady).toBe(true));

    await session.processMessage('hi');

    // user message + single concatenated assistant message
    expect(session.displayMessages).toEqual([
      { type: 'user', content: 'hi' },
      { type: 'assistant', content: 'Hello world!' },
    ]);
  });

  it('handleEvent appends error events to displayMessages', async () => {
    mockOrchestrator.send.mockImplementation(async function* () {
      yield { type: 'error' as const, message: 'something went wrong' };
      yield { type: 'done' as const };
    });

    const session = new ChatSession();
    session.saveApiKey('sk-key', null);
    await vi.waitFor(() => expect(session.isReady).toBe(true));

    await session.processMessage('do it');

    const errorMsg = session.displayMessages.find((m) => m.type === 'error');
    expect(errorMsg).toEqual({
      type: 'error',
      message: 'something went wrong',
    });
  });
});
