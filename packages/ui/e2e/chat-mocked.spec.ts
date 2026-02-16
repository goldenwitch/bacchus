import { test, expect } from '@playwright/test';
import type { ContentBlock } from './helpers/sse-mock.js';
import {
  routeAnthropicAPI,
  routeAnthropicError,
  toolId,
  buildSSEStream,
} from './helpers/sse-mock.js';
import {
  loadGraph,
  seedApiKey,
  openChatFromToolbar,
  openChatFromLanding,
  closeChatPanel,
  sendMessage,
  waitForAssistantReply,
  waitForToolCard,
  getMessages,
  getNodeCount,
} from './helpers/e2e-helpers.js';

test.describe('Chat panel (mocked)', () => {
  // -----------------------------------------------------------------------
  // 1. Chat panel opens and closes from toolbar
  // -----------------------------------------------------------------------
  test('chat panel opens and closes from toolbar', async ({ page }) => {
    await seedApiKey(page);
    await loadGraph(page, 'simple.vine');
    await openChatFromToolbar(page);
    await expect(page.locator('.chat-panel')).toBeVisible();
    await closeChatPanel(page);
    await expect(page.locator('.chat-panel')).not.toBeVisible();
  });

  // -----------------------------------------------------------------------
  // 2. Chat panel opens from landing screen
  // -----------------------------------------------------------------------
  test('chat panel opens from landing screen', async ({ page }) => {
    await seedApiKey(page);
    await page.goto('/');
    await openChatFromLanding(page);
    await expect(page.locator('.chat-panel')).toBeVisible();
    await expect(page.locator('.chat-empty')).toBeVisible();
  });

  // -----------------------------------------------------------------------
  // 3. API key entry flow
  // -----------------------------------------------------------------------
  test('API key entry flow', async ({ page }) => {
    await page.goto('/');
    await openChatFromLanding(page);
    await expect(page.locator('.key-setup')).toBeVisible();
    await expect(page.locator('.chat-input')).not.toBeVisible();
    await page.locator('.key-input').fill('sk-ant-test-key-12345');
    await page.locator('.key-save-btn').click();
    await expect(page.locator('.key-setup')).not.toBeVisible();
    await expect(page.locator('.chat-messages')).toBeVisible();
    await expect(page.locator('.chat-input')).toBeVisible();
  });

  // -----------------------------------------------------------------------
  // 4. API key entry via Enter key
  // -----------------------------------------------------------------------
  test('API key entry via Enter key', async ({ page }) => {
    await page.goto('/');
    await openChatFromLanding(page);
    await page.locator('.key-input').fill('sk-ant-test-key-12345');
    await page.locator('.key-input').press('Enter');
    await expect(page.locator('.key-setup')).not.toBeVisible();
    await expect(page.locator('.chat-input')).toBeVisible();
  });

  // -----------------------------------------------------------------------
  // 5. Send message and receive text response
  // -----------------------------------------------------------------------
  test('send message and receive text response', async ({ page }) => {
    await seedApiKey(page);
    await routeAnthropicAPI(page, [
      [{ type: 'text', text: 'Hello! I can help you plan tasks.' }],
    ]);
    await loadGraph(page, 'simple.vine');
    await openChatFromToolbar(page);
    await sendMessage(page, 'Hello');
    await waitForAssistantReply(page);
    const lastAssistant = page.locator('.msg-assistant').last();
    await expect(lastAssistant).toContainText(
      'Hello! I can help you plan tasks.',
    );
  });

  // -----------------------------------------------------------------------
  // 6. Shift+Enter inserts newline instead of sending
  // -----------------------------------------------------------------------
  test('shift+enter inserts newline instead of sending', async ({ page }) => {
    await seedApiKey(page);
    await loadGraph(page, 'simple.vine');
    await openChatFromToolbar(page);
    const input = page.locator('.chat-input');
    await input.click();
    await input.pressSequentially('line one');
    await input.press('Shift+Enter');
    await input.pressSequentially('line two');
    const value = await input.inputValue();
    expect(value).toContain('line one');
    expect(value).toContain('line two');
    await expect(page.locator('.msg-user')).not.toBeVisible();
  });

  // -----------------------------------------------------------------------
  // 7. Single tool-use round with graph mutation
  // -----------------------------------------------------------------------
  test('single tool-use round with graph mutation', async ({ page }) => {
    await seedApiKey(page);

    const round1: ContentBlock[] = [
      {
        type: 'tool_use',
        id: toolId(),
        name: 'add_task',
        input: {
          id: 'deploy',
          shortName: 'Deploy',
          status: 'notstarted',
          description: 'Deploy the app',
        },
      },
    ];
    const round2: ContentBlock[] = [
      { type: 'text', text: 'I added a Deploy task to your graph.' },
    ];

    await routeAnthropicAPI(page, [round1, round2]);
    await loadGraph(page, 'simple.vine');

    expect(await getNodeCount(page)).toBe(3);

    await openChatFromToolbar(page);
    await sendMessage(page, 'Add a deploy task');
    await waitForToolCard(page, 'add_task');
    await waitForAssistantReply(page);

    await expect(page.locator('.msg-assistant').last()).toContainText('Deploy');
    expect(await getNodeCount(page)).toBe(4);
  });

  // -----------------------------------------------------------------------
  // 8. Multi-tool-use round
  // -----------------------------------------------------------------------
  test('multi-tool-use round', async ({ page }) => {
    await seedApiKey(page);

    const round1: ContentBlock[] = [
      {
        type: 'tool_use',
        id: toolId(),
        name: 'add_task',
        input: { id: 'test', shortName: 'Testing' },
      },
      {
        type: 'tool_use',
        id: toolId(),
        name: 'set_status',
        input: { id: 'leaf', status: 'complete' },
      },
    ];
    const round2: ContentBlock[] = [
      {
        type: 'text',
        text: 'Done! Added testing task and confirmed leaf is complete.',
      },
    ];

    await routeAnthropicAPI(page, [round1, round2]);
    await loadGraph(page, 'simple.vine');
    await openChatFromToolbar(page);
    await sendMessage(page, 'Add a testing task and confirm leaf is complete');
    await waitForAssistantReply(page);

    const toolCards = page.locator('.msg-tool');
    expect(await toolCards.count()).toBeGreaterThanOrEqual(2);
    expect(await getNodeCount(page)).toBe(4);
  });

  // -----------------------------------------------------------------------
  // 9. Replace graph from scratch via landing screen
  // -----------------------------------------------------------------------
  test('replace graph from scratch via landing screen', async ({ page }) => {
    await seedApiKey(page);

    const vineText =
      '[design] Design (notstarted)\nDesign the system.\n\n[build] Build (notstarted)\nBuild it.\n-> design\n\n[ship] Ship (notstarted)\nShip it.\n-> build';

    const round1: ContentBlock[] = [
      {
        type: 'tool_use',
        id: toolId(),
        name: 'replace_graph',
        input: { vineText },
      },
    ];
    const round2: ContentBlock[] = [
      { type: 'text', text: 'Created a 3-task project plan.' },
    ];

    await routeAnthropicAPI(page, [round1, round2]);
    await page.goto('/');
    await openChatFromLanding(page);

    // Don't use sendMessage() here — the replace_graph tool triggers a
    // landing→graph transition that destroys the LandingScreen ChatPanel
    // (and its .msg-user bubble) before Playwright can reliably observe it.
    await page.locator('.chat-input').fill('Create a simple 3-task project');
    await page.locator('.send-btn').click();

    // Just verify the graph rendered correctly after the transition.
    await expect(
      page.locator('svg[role="group"] g[role="button"]'),
    ).toHaveCount(3, { timeout: 15_000 });
  });

  // -----------------------------------------------------------------------
  // 10. Multi-turn conversation
  // -----------------------------------------------------------------------
  test('multi-turn conversation', async ({ page }) => {
    await seedApiKey(page);
    await routeAnthropicAPI(page, [
      [{ type: 'text', text: 'The graph has 3 tasks.' }],
      [{ type: 'text', text: 'Sure, the root task is called Root Task.' }],
    ]);
    await loadGraph(page, 'simple.vine');
    await openChatFromToolbar(page);

    await sendMessage(page, 'How many tasks?');
    await waitForAssistantReply(page);

    await sendMessage(page, 'What is the root task?');
    await waitForAssistantReply(page);

    const messages = await getMessages(page);
    const conversationMsgs = messages.filter(
      (m) => m.type === 'msg-user' || m.type === 'msg-assistant',
    );
    expect(conversationMsgs).toHaveLength(4);

    const assistantMsgs = messages.filter((m) => m.type === 'msg-assistant');
    expect(assistantMsgs[0]!.text).toContain('3 tasks');
    expect(assistantMsgs[1]!.text).toContain('Root Task');
  });

  // -----------------------------------------------------------------------
  // 11. API error displays error message
  // -----------------------------------------------------------------------
  test('API error displays error message', async ({ page }) => {
    await seedApiKey(page);
    await routeAnthropicError(
      page,
      500,
      '{"error":{"message":"Internal server error"}}',
    );
    await loadGraph(page, 'simple.vine');
    await openChatFromToolbar(page);
    await sendMessage(page, 'Hello');
    await expect(page.locator('.loading-indicator')).not.toBeVisible({
      timeout: 10_000,
    });
    await expect(page.locator('.msg-error')).toBeVisible();
  });

  // -----------------------------------------------------------------------
  // 12. Network failure displays error
  // -----------------------------------------------------------------------
  test('network failure displays error', async ({ page }) => {
    await seedApiKey(page);
    await page.route('**/v1/messages', (route) => route.abort());
    await loadGraph(page, 'simple.vine');
    await openChatFromToolbar(page);
    await sendMessage(page, 'Hello');
    await expect(page.locator('.loading-indicator')).not.toBeVisible({
      timeout: 10_000,
    });
    await expect(page.locator('.msg-error')).toBeVisible();
  });

  // -----------------------------------------------------------------------
  // 13. Tool execution error shows error card
  // -----------------------------------------------------------------------
  test('tool execution error shows error card', async ({ page }) => {
    await seedApiKey(page);

    const round1: ContentBlock[] = [
      {
        type: 'tool_use',
        id: toolId(),
        name: 'remove_task',
        input: { id: 'nonexistent' },
      },
    ];
    const round2: ContentBlock[] = [
      { type: 'text', text: 'Sorry, that task does not exist.' },
    ];

    await routeAnthropicAPI(page, [round1, round2]);
    await loadGraph(page, 'simple.vine');
    await openChatFromToolbar(page);
    await sendMessage(page, 'Remove the nonexistent task');
    await waitForAssistantReply(page);
    await expect(page.locator('.msg-tool-error')).toBeVisible();
  });

  // -----------------------------------------------------------------------
  // 14. Input is disabled during loading
  // -----------------------------------------------------------------------
  test('input is disabled during loading', async ({ page }) => {
    await seedApiKey(page);

    await page.route('**/v1/messages', async (route) => {
      await new Promise((r) => setTimeout(r, 2000));
      const body = buildSSEStream([
        { type: 'text', text: 'Delayed response.' },
      ]);
      await route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        body,
      });
    });

    await loadGraph(page, 'simple.vine');
    await openChatFromToolbar(page);
    await sendMessage(page, 'Hello');

    await expect(page.locator('.chat-input')).toBeDisabled();
    await expect(page.locator('.send-btn')).toBeDisabled();

    await waitForAssistantReply(page);

    await expect(page.locator('.chat-input')).toBeEnabled();
  });

  // -----------------------------------------------------------------------
  // 15. Auto-scroll on new messages
  // -----------------------------------------------------------------------
  test('auto-scroll on new messages', async ({ page }) => {
    await seedApiKey(page);

    const longText = 'This is a response. '.repeat(50);
    await routeAnthropicAPI(page, [
      [{ type: 'text', text: longText }],
      [{ type: 'text', text: longText }],
      [{ type: 'text', text: longText }],
    ]);

    await loadGraph(page, 'simple.vine');
    await openChatFromToolbar(page);

    await sendMessage(page, 'First message');
    await waitForAssistantReply(page);

    await sendMessage(page, 'Second message');
    await waitForAssistantReply(page);

    await sendMessage(page, 'Third message');
    await waitForAssistantReply(page);

    // Auto-scroll uses requestAnimationFrame so poll until the scroll
    // position settles near the bottom.
    await page.waitForFunction(
      () => {
        const el = document.querySelector('.chat-messages');
        if (!el) return false;
        return el.scrollHeight - el.scrollTop - el.clientHeight < 50;
      },
      { timeout: 5_000 },
    );
  });

  // -----------------------------------------------------------------------
  // 16. Chat panel shows empty state hint
  // -----------------------------------------------------------------------
  test('chat panel shows empty state hint', async ({ page }) => {
    await seedApiKey(page);
    await routeAnthropicAPI(page, [
      [{ type: 'text', text: 'Here is my reply.' }],
    ]);
    await loadGraph(page, 'simple.vine');
    await openChatFromToolbar(page);

    await expect(page.locator('.chat-empty')).toBeVisible();
    await expect(page.locator('.chat-empty')).toContainText(
      'Describe the plan',
    );

    await sendMessage(page, 'Hello');
    await waitForAssistantReply(page);

    await expect(page.locator('.chat-empty')).not.toBeVisible();
  });
});
