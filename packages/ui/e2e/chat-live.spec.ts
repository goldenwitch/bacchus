/**
 * Live-agent e2e tests that hit the real Anthropic API.
 *
 * These tests require the ANTHROPIC_API_KEY environment variable to be set.
 * They are automatically skipped when the key is not present.
 *
 * Run with:  yarn e2e:chat:live
 */

import { test, expect } from '@playwright/test';
import {
  loadGraph,
  seedApiKey,
  openChatFromToolbar,
  openChatFromLanding,
  sendMessage,
  waitForAssistantReply,
  waitForToolCard,
  getMessages,
  getNodeCount,
} from './helpers/e2e-helpers.js';

const API_KEY = process.env.ANTHROPIC_API_KEY ?? '';

test.describe('Chat panel (live Anthropic API)', () => {
  test.skip(!API_KEY, 'Skipped: ANTHROPIC_API_KEY not set');

  test('simple text conversation', { timeout: 60_000 }, async ({ page }) => {
    await seedApiKey(page, API_KEY);
    await loadGraph(page, 'simple.vine');
    await openChatFromToolbar(page);

    await sendMessage(page, 'Say hello and nothing else.');
    await waitForAssistantReply(page, 30_000);

    const messages = await getMessages(page);
    const assistantTexts = messages
      .filter((m) => m.type === 'msg-assistant')
      .map((m) => m.text.toLowerCase());
    const combined = assistantTexts.join(' ');

    expect(combined).toContain('hello');
  });

  test(
    'tool-use round-trip: add a task',
    { timeout: 120_000 },
    async ({ page }) => {
      await seedApiKey(page, API_KEY);
      await loadGraph(page, 'simple.vine');

      const initialCount = await getNodeCount(page);
      expect(initialCount).toBe(3);

      await openChatFromToolbar(page);
      await sendMessage(
        page,
        'Add a new task called "Deploy" with id "deploy" that depends on "mid". Set its status to notstarted.',
      );

      await waitForToolCard(page);
      await waitForAssistantReply(page, 60_000);

      const newCount = await getNodeCount(page);
      expect(newCount).toBeGreaterThanOrEqual(4);

      await expect(page.locator('.msg-tool').first()).toBeVisible();
    },
  );

  test(
    'tool-use round-trip: change status',
    { timeout: 120_000 },
    async ({ page }) => {
      await seedApiKey(page, API_KEY);
      await loadGraph(page, 'five-status.vine');
      await openChatFromToolbar(page);

      await sendMessage(page, 'Mark task-d as complete.');
      await waitForToolCard(page, 'set_status');
      await waitForAssistantReply(page, 60_000);

      await expect(page.locator('.msg-tool').first()).toContainText(
        'set_status',
      );

      const count = await getNodeCount(page);
      expect(count).toBe(5);
    },
  );

  test('create graph from scratch', { timeout: 120_000 }, async ({ page }) => {
    await seedApiKey(page, API_KEY);
    await page.goto('/');

    await openChatFromLanding(page);
    await sendMessage(
      page,
      'Create a simple 3-task project plan for building a website: design, develop, and deploy. Each step should depend on the previous one.',
    );

    await waitForToolCard(page);
    await waitForAssistantReply(page, 90_000);

    // After graph creation the app switches to GraphView with SVG circles
    await expect(page.locator('svg circle').first()).toBeVisible({
      timeout: 10_000,
    });

    const count = await getNodeCount(page);
    expect(count).toBeGreaterThanOrEqual(3);
  });

  test('multi-turn modification', { timeout: 180_000 }, async ({ page }) => {
    await seedApiKey(page, API_KEY);
    await loadGraph(page, 'simple.vine');
    await openChatFromToolbar(page);

    // First turn
    await sendMessage(
      page,
      'Add a task called "Test" with id "test" that depends on "mid".',
    );
    await waitForAssistantReply(page, 60_000);

    // Second turn
    await sendMessage(
      page,
      'Now add a task called "Deploy" with id "deploy" that depends on "test".',
    );
    await waitForAssistantReply(page, 60_000);

    const count = await getNodeCount(page);
    expect(count).toBeGreaterThanOrEqual(5);

    const messages = await getMessages(page);
    const userMessages = messages.filter((m) => m.type === 'msg-user');
    const assistantMessages = messages.filter(
      (m) => m.type === 'msg-assistant',
    );
    expect(userMessages.length).toBe(2);
    expect(assistantMessages.length).toBeGreaterThanOrEqual(2);
  });

  test(
    'error recovery on vague request',
    { timeout: 120_000 },
    async ({ page }) => {
      await seedApiKey(page, API_KEY);
      await loadGraph(page, 'simple.vine');
      await openChatFromToolbar(page);

      await sendMessage(page, 'Remove the task called "nonexistent-task-xyz".');
      await waitForAssistantReply(page, 60_000);

      // The model should handle gracefully — either a tool error or a text explanation
      const hasToolError = await page.locator('.msg-tool-error').count();
      const assistantMsgs = await getMessages(page);
      const hasAssistantReply = assistantMsgs.some(
        (m) => m.type === 'msg-assistant' && m.text.length > 0,
      );
      expect(hasToolError > 0 || hasAssistantReply).toBeTruthy();

      // Page should still be functional — chat input is enabled
      await expect(page.locator('.chat-input')).toBeEnabled();
    },
  );
});
