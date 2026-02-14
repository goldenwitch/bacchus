import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'fs';
import { join } from 'path';

const fixturesDir = join(__dirname, 'fixtures');

function loadFixture(name: string): string {
  return readFileSync(join(fixturesDir, name), 'utf-8');
}

async function loadGraphViaUrl(page: Page, fixtureName: string) {
  const content = loadFixture(fixtureName);
  await page.route('**/fixtures/' + fixtureName, route =>
    route.fulfill({ body: content, contentType: 'text/plain' })
  );
  await page.goto('/?file=' + encodeURIComponent('http://localhost:5173/fixtures/' + fixtureName));
}

test('file drop loads graph', async ({ page }) => {
  await page.goto('/');
  // Verify landing screen
  await expect(page.locator('text=Bacchus')).toBeVisible();

  const content = loadFixture('simple.vine');
  const dropZone = page.locator('.dropzone');
  await expect(dropZone).toBeVisible();

  // Use the hidden input[type=file] inside the dropzone
  const fileInput = page.locator('input[type="file"]');
  await fileInput.setInputFiles({
    name: 'simple.vine',
    mimeType: 'text/plain',
    buffer: Buffer.from(content),
  });

  // Wait for graph to render
  await page.waitForSelector('svg', { timeout: 10000 });
  await expect(page.locator('svg circle').first()).toBeVisible();
});

test('url parameter auto-loads', async ({ page }) => {
  await loadGraphViaUrl(page, 'simple.vine');
  // simple.vine has 3 tasks → expect circles to appear
  await page.waitForSelector('svg circle', { timeout: 10000 });
  await expect(page.locator('svg circle').first()).toBeVisible();
});

test('parse error shows error card', async ({ page }) => {
  const content = loadFixture('invalid-syntax.vine');
  await page.route('**/fixtures/invalid-syntax.vine', route =>
    route.fulfill({ body: content, contentType: 'text/plain' })
  );
  await page.goto('/?file=' + encodeURIComponent('http://localhost:5173/fixtures/invalid-syntax.vine'));

  // Should show auto-error card with parse error message
  await expect(page.locator('.auto-error')).toBeVisible({ timeout: 5000 });
  await expect(page.locator('.auto-error p')).toContainText('Parse error');
});

test('validation error (cycle) shows error card', async ({ page }) => {
  const content = loadFixture('invalid-cycle.vine');
  await page.route('**/fixtures/invalid-cycle.vine', route =>
    route.fulfill({ body: content, contentType: 'text/plain' })
  );
  await page.goto('/?file=' + encodeURIComponent('http://localhost:5173/fixtures/invalid-cycle.vine'));

  await expect(page.locator('.auto-error')).toBeVisible({ timeout: 5000 });
  await expect(page.locator('.auto-error p')).toContainText('Validation error');
});

test('url fetch 404 shows error card', async ({ page }) => {
  await page.route('**/fixtures/missing.vine', route =>
    route.fulfill({ status: 404, body: '' })
  );
  await page.goto('/?file=' + encodeURIComponent('http://localhost:5173/fixtures/missing.vine'));

  await expect(page.locator('.auto-error')).toBeVisible({ timeout: 5000 });
  await expect(page.locator('.auto-error p')).toContainText('Failed to load file: 404');
});

test('error dismiss clears error', async ({ page }) => {
  await page.route('**/fixtures/missing.vine', route =>
    route.fulfill({ status: 404, body: '' })
  );
  await page.goto('/?file=' + encodeURIComponent('http://localhost:5173/fixtures/missing.vine'));

  await expect(page.locator('.auto-error')).toBeVisible({ timeout: 5000 });
  await page.locator('.auto-error button').click();
  await expect(page.locator('.auto-error')).not.toBeVisible();
});

test('url input load button fetches and renders graph', async ({ page }) => {
  const content = loadFixture('simple.vine');
  await page.route('**/test-url/simple.vine', route =>
    route.fulfill({ body: content, contentType: 'text/plain' })
  );

  await page.goto('/');
  await expect(page.locator('text=Bacchus')).toBeVisible();

  // Type URL into the text input
  const urlInput = page.locator('input[type="text"]');
  await urlInput.fill('http://localhost:5173/test-url/simple.vine');

  // Click Load button
  await page.locator('button:text("Load")').click();

  // Wait for graph
  await page.waitForSelector('svg circle', { timeout: 10000 });
  await expect(page.locator('svg circle').first()).toBeVisible();
});

test('url input Enter key triggers load', async ({ page }) => {
  const content = loadFixture('simple.vine');
  await page.route('**/test-url/simple.vine', route =>
    route.fulfill({ body: content, contentType: 'text/plain' })
  );

  await page.goto('/');
  const urlInput = page.locator('input[type="text"]');
  await urlInput.fill('http://localhost:5173/test-url/simple.vine');
  await urlInput.press('Enter');

  await page.waitForSelector('svg circle', { timeout: 10000 });
  await expect(page.locator('svg circle').first()).toBeVisible();
});
