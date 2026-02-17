import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockOrchestrator = {
  setGraph: vi.fn(),
  getMessages: vi.fn(() => []),
  setMessages: vi.fn(),
  clearHistory: vi.fn(),
  send: vi.fn(async function* () {
    yield { type: 'text_delta' as const, text: 'hi' };
  }),
};

// Mock dependencies before importing session
vi.mock('../../src/lib/chat/anthropic.js', () => ({
  AnthropicChatService: vi.fn(),
}));

vi.mock('../../src/lib/chat/apikey.js', () => ({
  getApiKey: vi.fn(() => null),
  setApiKey: vi.fn(),
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

  it('becomes ready after saveApiKey', () => {
    const session = new ChatSession();
    session.saveApiKey('sk-key', null);
    expect(setApiKey).toHaveBeenCalledWith('sk-key');
    expect(session.apiKey).toBe('sk-key');
    expect(session.isReady).toBe(true);
  });

  it('initOrchestrator does nothing without API key', () => {
    const session = new ChatSession();
    session.initOrchestrator(null);
    expect(session.isReady).toBe(false);
  });

  it('setGraph forwards to orchestrator', () => {
    const session = new ChatSession();
    session.saveApiKey('sk-key', null);
    session.setGraph(null);
    expect(mockOrchestrator.setGraph).toHaveBeenCalledWith(null);
  });

  it('getChatMessages returns empty without orchestrator', () => {
    const session = new ChatSession();
    expect(session.getChatMessages()).toEqual([]);
  });

  it('getChatMessages delegates to orchestrator', () => {
    const msgs = [{ role: 'user', content: 'hi' }];
    mockOrchestrator.getMessages.mockReturnValue(msgs);
    const session = new ChatSession();
    session.saveApiKey('sk-key', null);
    expect(session.getChatMessages()).toBe(msgs);
  });

  it('setChatMessages delegates to orchestrator', () => {
    const session = new ChatSession();
    session.saveApiKey('sk-key', null);
    const msgs = [{ role: 'user' as const, content: 'test' }];
    session.setChatMessages(msgs);
    expect(mockOrchestrator.setMessages).toHaveBeenCalledWith(msgs);
  });

  it('clear resets state and orchestrator', () => {
    const session = new ChatSession();
    session.saveApiKey('sk-key', null);
    session.displayMessages = [{ role: 'user' as const, content: 'hello' }];
    session.inputDraft = 'some text';
    session.isLoading = true;

    session.clear();

    expect(session.displayMessages).toEqual([]);
    expect(session.inputDraft).toBe('');
    expect(session.isLoading).toBe(false);
    expect(mockOrchestrator.clearHistory).toHaveBeenCalled();
  });

  it('send yields events from orchestrator', async () => {
    const session = new ChatSession();
    session.saveApiKey('sk-key', null);

    const events = [];
    for await (const e of session.send('hello')) {
      events.push(e);
    }

    expect(events).toEqual([{ type: 'text_delta', text: 'hi' }]);
    expect(session.isLoading).toBe(false);
  });

  it('send does nothing without orchestrator', async () => {
    const session = new ChatSession();
    const events = [];
    for await (const e of session.send('hello')) {
      events.push(e);
    }
    expect(events).toHaveLength(0);
  });

  it('send does nothing if already loading', async () => {
    const session = new ChatSession();
    session.saveApiKey('sk-key', null);
    session.isLoading = true;

    const events = [];
    for await (const e of session.send('hello')) {
      events.push(e);
    }
    expect(events).toHaveLength(0);
  });

  it('resets isLoading on error', async () => {
    // eslint-disable-next-line require-yield
    mockOrchestrator.send.mockImplementation(async function* () {
      throw new Error('boom');
    });

    const session = new ChatSession();
    session.saveApiKey('sk-key', null);

    await expect(async () => {
      for await (const _e of session.send('hello')) {
        // consume
      }
    }).rejects.toThrow('boom');

    expect(session.isLoading).toBe(false);
  });
});
