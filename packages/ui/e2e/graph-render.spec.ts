import { test, expect } from '@playwright/test';
import { loadGraph } from './helpers/e2e-helpers.js';

test('renders correct number of nodes for simple graph', async ({ page }) => {
  await loadGraph(page, 'simple.vine');
  // simple.vine has 3 tasks
  const nodes = page.locator('svg[role="group"] g[role="button"]');
  await expect(nodes).toHaveCount(3);
});

test('renders correct number of edges for simple graph', async ({ page }) => {
  await loadGraph(page, 'simple.vine');
  // simple.vine: mid→leaf, root→mid = 2 edges
  const edgePaths = page.locator('svg[role="group"] path[marker-end]');
  await expect(edgePaths).toHaveCount(2);
});

test('each node shows correct emoji for its status', async ({ page }) => {
  await loadGraph(page, 'five-status.vine');
  // five-status.vine has one task per status
  const svgText = await page.locator('svg[role="group"]').innerHTML();
  expect(svgText).toContain('🌿'); // complete
  expect(svgText).toContain('🔨'); // started
  expect(svgText).toContain('📋'); // notstarted
  expect(svgText).toContain('💭'); // planning
  expect(svgText).toContain('\u{1F451}'); // root node (blocked task is root, shows crown)
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
  // 1 node
  const nodes = page.locator('svg[role="group"] g[role="button"]');
  await expect(nodes).toHaveCount(1);
  // 0 edges
  const edges = page.locator('svg[role="group"] path[marker-end]');
  await expect(edges).toHaveCount(0);
});

test('diamond graph renders 4 nodes and 4 edges', async ({ page }) => {
  await loadGraph(page, 'diamond.vine');
  // 4 nodes
  const nodes = page.locator('svg[role="group"] g[role="button"]');
  await expect(nodes).toHaveCount(4);
  // leaf→left, leaf→right, left→root, right→root = 4 edges
  const edges = page.locator('svg[role="group"] path[marker-end]');
  await expect(edges).toHaveCount(4);
});

test('deep-chain graph renders 6 nodes and 5 edges', async ({ page }) => {
  await loadGraph(page, 'deep-chain.vine');
  // 6 nodes
  const nodes = page.locator('svg[role="group"] g[role="button"]');
  await expect(nodes).toHaveCount(6);
  // Linear chain of 6 → 5 edges
  const edges = page.locator('svg[role="group"] path[marker-end]');
  await expect(edges).toHaveCount(5);
});

test('edge flow animation class is present', async ({ page }) => {
  await loadGraph(page, 'simple.vine');
  // Click a node to highlight its connected edges
  await page.locator('svg[role="group"] g[role="button"]').first().click();
  await page.waitForTimeout(300);
  const edge = page.locator('svg[role="group"] path.anim-edge-flow').first();
  await expect(edge).toBeVisible();
  await expect(edge).toHaveClass(/anim-edge-flow/);
});
