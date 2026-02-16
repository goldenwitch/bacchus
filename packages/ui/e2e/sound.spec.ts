import { test, expect } from '@playwright/test';
import { loadGraph } from './helpers/e2e-helpers.js';

async function loadSimpleGraph(page: import('@playwright/test').Page) {
  await loadGraph(page, 'simple.vine');
}

test('mute button toggles icon between 🔊 and 🔇', async ({ page }) => {
  await loadSimpleGraph(page);

  const muteBtn = page.locator('.mute-btn');
  await expect(muteBtn).toBeVisible();

  // Initial state should be unmuted (🔊)
  await expect(muteBtn).toContainText('🔊');

  // Toggle to muted
  await muteBtn.click();
  await expect(muteBtn).toContainText('🔇');

  // Toggle back to unmuted
  await muteBtn.click();
  await expect(muteBtn).toContainText('🔊');
});

test('mute state persists across page reload', async ({ page }) => {
  await loadSimpleGraph(page);

  // Mute
  const muteBtn = page.locator('.mute-btn');
  await muteBtn.click();
  await expect(muteBtn).toContainText('🔇');

  // Reload the page with the same graph
  await loadGraph(page, 'simple.vine');

  // Should still be muted after reload
  await expect(page.locator('.mute-btn')).toContainText('🔇');
});
