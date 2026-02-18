import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const fixturesDir = join(__dirname, '..', 'fixtures');

// ---------------------------------------------------------------------------
// Graph loading helpers (re-exported for shared use)
// ---------------------------------------------------------------------------

/** Read a fixture file from the e2e fixtures directory. */
export function loadFixture(name: string): string {
  return readFileSync(join(fixturesDir, name), 'utf-8');
}

/** Load a .vine fixture into the page via route interception. */
export async function loadGraph(
  page: Page,
  fixtureName: string,
  { skipWait = false }: { skipWait?: boolean } = {},
): Promise<void> {
  const content = loadFixture(fixtureName);
  await page.route('**/fixtures/' + fixtureName, (route) =>
    route.fulfill({ body: content, contentType: 'text/plain' }),
  );
  await page.goto(
    '/?file=' +
      encodeURIComponent('http://localhost:5173/fixtures/' + fixtureName),
  );
  if (!skipWait) {
    await page.waitForTimeout(2000); // Wait for entry animation
  }
}

// ---------------------------------------------------------------------------
// API key helpers
// ---------------------------------------------------------------------------

/** Pre-seed the Anthropic API key in localStorage before navigation. */
export async function seedApiKey(
  page: Page,
  key: string = 'sk-ant-test-mock-key',
): Promise<void> {
  await page.addInitScript((k) => {
    localStorage.setItem('bacchus:anthropic-key', k);
  }, key);
}

/** Clear any stored/env-injected API key so tests can exercise the key-entry flow. */
export async function clearApiKey(page: Page): Promise<void> {
  await page.addInitScript(() => {
    localStorage.removeItem('bacchus:anthropic-key');
    // Neutralize the Vite build-time env var so getApiKey() returns null.
    // Must delete (not set to undefined) because the resolution checks truthiness.
    delete (import.meta.env as Record<string, unknown>).VITE_ANTHROPIC_API_KEY;
  });
}

// ---------------------------------------------------------------------------
// Chat panel navigation
// ---------------------------------------------------------------------------

/** Open the chat panel via the Toolbar chat toggle button. Waits for panel expanded. */
export async function openChatFromToolbar(page: Page): Promise<void> {
  await page.click('button[aria-label="Open chat planner"]');
  await expect(page.locator('.chat-body')).toBeVisible({ timeout: 5000 });
}

/** Open the chat panel from the Landing Screen "Plan with AI" button. */
export async function openChatFromLanding(page: Page): Promise<void> {
  await page.click('.plan-ai');
  await expect(page.locator('.chat-body')).toBeVisible({ timeout: 5000 });
}

/** Close the chat panel by clicking the accordion toggle. */
export async function closeChatPanel(page: Page): Promise<void> {
  await page.click('button[aria-label="Close chat planner"]');
  await expect(page.locator('.chat-body')).not.toBeVisible({ timeout: 5000 });
}

// ---------------------------------------------------------------------------
// Messaging helpers
// ---------------------------------------------------------------------------

/** Type a message and send it. Waits for the user message bubble to appear. */
export async function sendMessage(page: Page, text: string): Promise<void> {
  await page.locator('.chat-input').fill(text);
  await page.locator('.send-btn').click();
  await expect(page.locator('.msg-user', { hasText: text })).toBeVisible();
}

/** Wait for the assistant to finish responding (loading indicator gone + at least one assistant message). */
export async function waitForAssistantReply(
  page: Page,
  timeout: number = 15_000,
): Promise<void> {
  await expect(page.locator('.loading-indicator')).not.toBeVisible({ timeout });
  await expect(page.locator('.msg-assistant').first()).toBeVisible({ timeout });
}

/** Wait for a tool execution card to appear. Optionally filter by tool name. */
export async function waitForToolCard(
  page: Page,
  toolName?: string,
): Promise<void> {
  if (toolName) {
    await expect(
      page.locator('.msg-tool').filter({
        has: page.locator('.tool-name', { hasText: toolName }),
      }),
    ).toBeVisible();
  } else {
    await expect(page.locator('.msg-tool').first()).toBeVisible();
  }
}

/** Get all message texts in display order. Returns array of {type, text}. */
export async function getMessages(
  page: Page,
): Promise<Array<{ type: string; text: string }>> {
  const msgs = page.locator('.msg');
  const count = await msgs.count();
  const results: Array<{ type: string; text: string }> = [];

  for (let i = 0; i < count; i++) {
    const el = msgs.nth(i);
    const classList = (await el.getAttribute('class')) ?? '';
    let type = 'unknown';
    if (classList.includes('msg-user')) type = 'msg-user';
    else if (classList.includes('msg-assistant')) type = 'msg-assistant';
    else if (classList.includes('msg-tool')) type = 'msg-tool';
    else if (classList.includes('msg-error')) type = 'msg-error';

    const text = (await el.innerText()).trim();
    results.push({ type, text });
  }

  return results;
}

/** Get the count of graph nodes currently rendered. */
export async function getNodeCount(page: Page): Promise<number> {
  return page.locator('svg[role="group"] g[role="button"]').count();
}
