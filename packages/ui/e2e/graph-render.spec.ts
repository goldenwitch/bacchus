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
  // Wait for entry animation to settle
  await page.waitForTimeout(2000);
}

test('renders correct number of nodes for simple graph', async ({ page }) => {
  await loadGraph(page, 'simple.vine');
  // simple.vine has 3 tasks — each renders 2 circles (outer glow + inner fill)
  const nodeCircles = page.locator('svg circle');
  await expect(nodeCircles).toHaveCount(6);
});

test('renders correct number of edges for simple graph', async ({ page }) => {
  await loadGraph(page, 'simple.vine');
  // simple.vine: mid→leaf, root→mid = 2 edges
  const edgePaths = page.locator('svg path.anim-edge-flow');
  await expect(edgePaths).toHaveCount(2);
});

test('each node shows correct emoji for its status', async ({ page }) => {
  await loadGraph(page, 'five-status.vine');
  // five-status.vine has one task per status
  const svgText = await page.locator('svg').innerHTML();
  expect(svgText).toContain('🌿'); // complete
  expect(svgText).toContain('🔨'); // started
  expect(svgText).toContain('📋'); // notstarted
  expect(svgText).toContain('💭'); // planning
  expect(svgText).toContain('🚧'); // blocked
});

test('each node shows a floating label', async ({ page }) => {
  await loadGraph(page, 'simple.vine');
  // Each node has a <text class="anim-label-bob"> with shortName
  const labels = page.locator('svg text.anim-label-bob');
  await expect(labels).toHaveCount(3);
});

test('edges have arrowhead markers', async ({ page }) => {
  await loadGraph(page, 'simple.vine');
  const markers = page.locator('svg marker');
  const count = await markers.count();
  // 2 edges = at least 2 markers
  expect(count).toBeGreaterThanOrEqual(2);
});

test('single-task graph renders one node, zero edges', async ({ page }) => {
  await loadGraph(page, 'single-task.vine');
  // 1 node × 2 circles = 2 circles
  const circles = page.locator('svg circle');
  await expect(circles).toHaveCount(2);
  // 0 edges
  const edges = page.locator('svg path.anim-edge-flow');
  await expect(edges).toHaveCount(0);
});

test('diamond graph renders 4 nodes and 4 edges', async ({ page }) => {
  await loadGraph(page, 'diamond.vine');
  // 4 nodes × 2 circles = 8 circles
  const circles = page.locator('svg circle');
  await expect(circles).toHaveCount(8);
  // leaf→left, leaf→right, left→root, right→root = 4 edges
  const edges = page.locator('svg path.anim-edge-flow');
  await expect(edges).toHaveCount(4);
});

test('deep-chain graph renders 6 nodes and 5 edges', async ({ page }) => {
  await loadGraph(page, 'deep-chain.vine');
  // 6 nodes × 2 circles = 12 circles
  const circles = page.locator('svg circle');
  await expect(circles).toHaveCount(12);
  // Linear chain of 6 → 5 edges
  const edges = page.locator('svg path.anim-edge-flow');
  await expect(edges).toHaveCount(5);
});

test('edge flow animation class is present', async ({ page }) => {
  await loadGraph(page, 'simple.vine');
  const edge = page.locator('svg path.anim-edge-flow').first();
  await expect(edge).toBeVisible();
  await expect(edge).toHaveClass(/anim-edge-flow/);
});
