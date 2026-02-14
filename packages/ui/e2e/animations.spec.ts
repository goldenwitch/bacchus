import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'fs';
import { join } from 'path';

const fixturesDir = join(__dirname, 'fixtures');

function loadFixture(name: string): string {
  return readFileSync(join(fixturesDir, name), 'utf-8');
}

async function loadGraph(page: Page, fixtureName: string) {
  const content = loadFixture(fixtureName);
  await page.route('**/fixtures/' + fixtureName, route =>
    route.fulfill({ body: content, contentType: 'text/plain' })
  );
  await page.goto('/?file=' + encodeURIComponent('http://localhost:5173/fixtures/' + fixtureName));
  await page.waitForTimeout(2000);
}

test('entry animation completes and all nodes visible', async ({ page }) => {
  await loadGraph(page, 'simple.vine');
  // After 2s wait, all 3 nodes should be visible (3 tasks × 2 circles = 6)
  const circles = page.locator('svg circle');
  await expect(circles).toHaveCount(6);
});

test('label bob animation is applied to all node labels', async ({ page }) => {
  await loadGraph(page, 'simple.vine');
  const labels = page.locator('svg text.anim-label-bob');
  const count = await labels.count();
  expect(count).toBe(3);
});

test('glow pulse animation on started nodes', async ({ page }) => {
  await loadGraph(page, 'five-status.vine');
  // Only 'started' nodes should have the glow-pulse class
  const glowPulse = page.locator('svg circle.anim-glow-pulse');
  const count = await glowPulse.count();
  expect(count).toBe(1);
});

test('completion shimmer on complete nodes', async ({ page }) => {
  await loadGraph(page, 'five-status.vine');
  const shimmer = page.locator('svg circle.anim-completion-shimmer');
  const count = await shimmer.count();
  expect(count).toBe(1);
});

test('edge flow animation has stroke-dasharray', async ({ page }) => {
  await loadGraph(page, 'simple.vine');
  const edges = page.locator('svg path.anim-edge-flow');
  const count = await edges.count();
  expect(count).toBe(2);
  // Each edge path should have stroke-dasharray set
  for (let i = 0; i < count; i++) {
    const dasharray = await edges.nth(i).getAttribute('stroke-dasharray');
    expect(dasharray).toBeTruthy();
  }
});

test('error card has shake animation class', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('text=Bacchus')).toBeVisible();

  const content = loadFixture('invalid-syntax.vine');
  // Use the file input to trigger a parse error on the landing screen
  const fileInput = page.locator('input[type="file"]');
  await fileInput.setInputFiles({
    name: 'invalid.vine',
    mimeType: 'text/plain',
    buffer: Buffer.from(content),
  });

  // Error card should appear with the shake animation class
  const errorCard = page.locator('.anim-error-shake');
  await expect(errorCard).toBeVisible({ timeout: 5000 });
});
