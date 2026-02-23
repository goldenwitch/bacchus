import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/svelte';
import { createMockSession } from '../fixtures/chatSessionMock.js';
import { simpleGraph } from '../fixtures/graphs.js';

// Mock ChatSession — must be before ChatPanel import
vi.mock('../../src/lib/chat/session.js', () => ({
  ChatSession: vi.fn().mockImplementation(() => createMockSession()),
}));



import ChatPanel from '../../src/lib/components/ChatPanel.svelte';

// Polyfill Element.animate for jsdom
if (typeof Element.prototype.animate !== 'function') {
  Element.prototype.animate = function () {
    return {
      cancel: () => {},
      finish: () => {},
      play: () => {},
      pause: () => {},
      reverse: () => {},
      onfinish: null,
      finished: Promise.resolve(),
    } as unknown as Animation;
  };
}

function defaultProps(sessionOverrides: Record<string, unknown> = {}) {
  const session = createMockSession(sessionOverrides);
  return {
    graph: simpleGraph(),
    onupdate: vi.fn(),
    session: session as any,
  };
}

describe('ChatPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    // Mock clipboard API
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  // ---------------------------------------------------------------------------
  // Key setup (no API key)
  // ---------------------------------------------------------------------------
  describe('Key setup', () => {
    it('renders key setup section when no API key', () => {
      const { container } = render(ChatPanel, {
        props: defaultProps({ apiKey: null }),
      });
      expect(container.querySelector('.key-setup')).toBeTruthy();
      expect(container.querySelector('.key-input')).toBeTruthy();
      expect(container.querySelector('.key-save-btn')).toBeTruthy();
    });

    it('does not render messages or input when no key', () => {
      const { container } = render(ChatPanel, {
        props: defaultProps({ apiKey: null }),
      });
      expect(container.querySelector('.chat-messages')).toBeNull();
      expect(container.querySelector('.chat-input')).toBeNull();
    });

    it('save button calls session.saveApiKey with trimmed value', async () => {
      const props = defaultProps({ apiKey: null });
      const { container } = render(ChatPanel, { props });
      const keyInput = container.querySelector('.key-input') as HTMLInputElement;
      const saveBtn = container.querySelector('.key-save-btn') as HTMLButtonElement;

      await fireEvent.input(keyInput, { target: { value: '  sk-ant-test-key  ' } });
      await fireEvent.click(saveBtn);

      expect(props.session.saveApiKey).toHaveBeenCalledWith(
        'sk-ant-test-key',
        props.graph,
      );
    });

    it('Enter key in key input triggers save', async () => {
      const props = defaultProps({ apiKey: null });
      const { container } = render(ChatPanel, { props });
      const keyInput = container.querySelector('.key-input') as HTMLInputElement;

      await fireEvent.input(keyInput, { target: { value: 'sk-ant-test-key' } });
      await fireEvent.keyDown(keyInput, { key: 'Enter' });

      expect(props.session.saveApiKey).toHaveBeenCalledTimes(1);
    });

    it('save button is disabled when key input is empty', () => {
      const { container } = render(ChatPanel, {
        props: defaultProps({ apiKey: null }),
      });
      const saveBtn = container.querySelector('.key-save-btn') as HTMLButtonElement;
      expect(saveBtn.disabled).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // Empty state (key present, no messages)
  // ---------------------------------------------------------------------------
  describe('Empty state', () => {
    it('renders empty hint when key present and no messages', () => {
      const { container } = render(ChatPanel, {
        props: defaultProps({ apiKey: 'sk-ant-key', displayMessages: [] }),
      });
      expect(container.querySelector('.chat-empty')).toBeTruthy();
    });

    it('renders chat input and send button when key present', () => {
      const { container } = render(ChatPanel, {
        props: defaultProps({ apiKey: 'sk-ant-key' }),
      });
      expect(container.querySelector('.chat-input')).toBeTruthy();
      expect(container.querySelector('.send-btn')).toBeTruthy();
    });

    it('does not render key setup when key is present', () => {
      const { container } = render(ChatPanel, {
        props: defaultProps({ apiKey: 'sk-ant-key' }),
      });
      expect(container.querySelector('.key-setup')).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // Messages
  // ---------------------------------------------------------------------------
  describe('Messages', () => {
    it('renders user messages with .msg-user', () => {
      const { container } = render(ChatPanel, {
        props: defaultProps({
          apiKey: 'sk-ant-key',
          displayMessages: [{ type: 'user', content: 'Hello world' }],
        }),
      });
      const userMsg = container.querySelector('.msg-user');
      expect(userMsg).toBeTruthy();
      expect(userMsg!.textContent).toContain('Hello world');
    });

    it('renders assistant messages with .msg-assistant', () => {
      const { container } = render(ChatPanel, {
        props: defaultProps({
          apiKey: 'sk-ant-key',
          displayMessages: [{ type: 'assistant', content: 'Hi there' }],
        }),
      });
      expect(container.querySelector('.msg-assistant')).toBeTruthy();
    });

    it('renders error messages with .msg-error', () => {
      const { container } = render(ChatPanel, {
        props: defaultProps({
          apiKey: 'sk-ant-key',
          displayMessages: [{ type: 'error', message: 'Something went wrong' }],
        }),
      });
      const errorMsg = container.querySelector('.msg-error');
      expect(errorMsg).toBeTruthy();
      expect(errorMsg!.textContent).toContain('Something went wrong');
    });

    it('renders tool messages with .msg-tool', () => {
      const { container } = render(ChatPanel, {
        props: defaultProps({
          apiKey: 'sk-ant-key',
          displayMessages: [
            {
              type: 'tool',
              name: 'add_task',
              detail: 'Adding task',
              result: 'ok',
              isError: false,
            },
          ],
        }),
      });
      expect(container.querySelector('.msg-tool')).toBeTruthy();
    });

    it('renders tool error messages with .msg-tool-error', () => {
      const { container } = render(ChatPanel, {
        props: defaultProps({
          apiKey: 'sk-ant-key',
          displayMessages: [
            {
              type: 'tool',
              name: 'add_task',
              detail: 'Failed',
              result: 'error',
              isError: true,
            },
          ],
        }),
      });
      expect(container.querySelector('.msg-tool-error')).toBeTruthy();
    });
  });

  // ---------------------------------------------------------------------------
  // Send behavior
  // ---------------------------------------------------------------------------
  describe('Send behavior', () => {
    it('send button calls session.processMessage and clears input', async () => {
      const props = defaultProps({ apiKey: 'sk-ant-key' });
      const { container } = render(ChatPanel, { props });
      const textarea = container.querySelector('.chat-input') as HTMLTextAreaElement;
      const sendBtn = container.querySelector('.send-btn') as HTMLButtonElement;

      await fireEvent.input(textarea, { target: { value: 'Build a plan' } });
      await fireEvent.click(sendBtn);

      expect(props.session.processMessage).toHaveBeenCalledWith('Build a plan');
    });

    it('does not send when input is empty or whitespace', async () => {
      const props = defaultProps({ apiKey: 'sk-ant-key' });
      const { container } = render(ChatPanel, { props });
      const sendBtn = container.querySelector('.send-btn') as HTMLButtonElement;

      // Send button should be disabled with empty input
      expect(sendBtn.disabled).toBe(true);
      await fireEvent.click(sendBtn);
      expect(props.session.processMessage).not.toHaveBeenCalled();
    });

    it('send is blocked while loading', () => {
      const { container } = render(ChatPanel, {
        props: defaultProps({ apiKey: 'sk-ant-key', isLoading: true }),
      });
      const textarea = container.querySelector('.chat-input') as HTMLTextAreaElement;
      const sendBtn = container.querySelector('.send-btn') as HTMLButtonElement;

      expect(textarea.disabled).toBe(true);
      expect(sendBtn.disabled).toBe(true);
    });

    it('Enter without Shift triggers send', async () => {
      const props = defaultProps({ apiKey: 'sk-ant-key' });
      const { container } = render(ChatPanel, { props });
      const textarea = container.querySelector('.chat-input') as HTMLTextAreaElement;

      await fireEvent.input(textarea, { target: { value: 'Hello' } });
      await fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false });

      expect(props.session.processMessage).toHaveBeenCalledWith('Hello');
    });

    it('Shift+Enter does not trigger send', async () => {
      const props = defaultProps({ apiKey: 'sk-ant-key' });
      const { container } = render(ChatPanel, { props });
      const textarea = container.querySelector('.chat-input') as HTMLTextAreaElement;

      await fireEvent.input(textarea, { target: { value: 'Hello' } });
      await fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: true });

      expect(props.session.processMessage).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // Loading state
  // ---------------------------------------------------------------------------
  describe('Loading state', () => {
    it('renders loading indicator with 3 dots when loading', () => {
      const { container } = render(ChatPanel, {
        props: defaultProps({ apiKey: 'sk-ant-key', isLoading: true }),
      });
      const indicator = container.querySelector('.loading-indicator');
      expect(indicator).toBeTruthy();
      const dots = indicator!.querySelectorAll('.dot');
      expect(dots).toHaveLength(3);
    });

    it('does not render loading indicator when not loading', () => {
      const { container } = render(ChatPanel, {
        props: defaultProps({ apiKey: 'sk-ant-key', isLoading: false }),
      });
      expect(container.querySelector('.loading-indicator')).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // Copy button
  // ---------------------------------------------------------------------------
  describe('Copy button', () => {
    it('copy button calls navigator.clipboard.writeText', async () => {
      const { container } = render(ChatPanel, {
        props: defaultProps({
          apiKey: 'sk-ant-key',
          displayMessages: [{ type: 'assistant', content: 'Copied text' }],
        }),
      });
      const copyBtn = container.querySelector('.msg-copy-btn') as HTMLButtonElement;
      expect(copyBtn).toBeTruthy();
      await fireEvent.click(copyBtn);
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith('Copied text');
    });
  });
});
