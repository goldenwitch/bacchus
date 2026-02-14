import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { join } from 'path';

const fixturesDir = join(__dirname, 'fixtures');

function loadFixture(name: string): string {
  return readFileSync(join(fixturesDir, name), 'utf-8');
}

async function loadSimpleGraph(page: import('@playwright/test').Page) {
  const content = loadFixture('simple.vine');
  await page.route('**/fixtures/simple.vine', route =>
    route.fulfill({ body: content, contentType: 'text/plain' })
  );
  await page.goto('/?file=' + encodeURIComponent('http://localhost:5173/fixtures/simple.vine'));
  await page.waitForTimeout(2000);
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
  const content = loadFixture('simple.vine');
  await page.route('**/fixtures/simple.vine', route =>
    route.fulfill({ body: content, contentType: 'text/plain' })
  );
  await page.goto('/?file=' + encodeURIComponent('http://localhost:5173/fixtures/simple.vine'));
  await page.waitForTimeout(2000);

  // Should still be muted after reload
  await expect(page.locator('.mute-btn')).toContainText('🔇');
});
