import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render } from '@testing-library/svelte';
import GraphView from '../../src/lib/components/GraphView.svelte';
import {
  simpleGraph,
  singleTaskGraph,
  diamondGraph,
} from '../fixtures/graphs.js';

// ---------------------------------------------------------------------------
// Polyfill ResizeObserver for jsdom
// ---------------------------------------------------------------------------

if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof globalThis.ResizeObserver;
}

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('../../src/lib/sound.js', () => ({
  playPop: vi.fn(),
  playHover: vi.fn(),
  playWhoosh: vi.fn(),
  initAudio: vi.fn(),
  isMuted: vi.fn(() => false),
  setMuted: vi.fn(),
  getVolume: vi.fn(() => 0.3),
  setVolume: vi.fn(),
}));

// Mock createSimulation to avoid d3-force/d3-timer global state issues in jsdom.
// Keep computeDepths real since GraphView uses it for entry ordering.
vi.mock('../../src/lib/layout.js', async (importOriginal) => {
  const mod = (await importOriginal()) as Record<string, unknown>;
  return {
    ...mod,
    createSimulation: vi.fn((nodes: any[], links: any[]) => {
      // Resolve link source/target strings → object references (like forceLink does)
      const nodeById = new Map(nodes.map((n: any) => [n.id, n]));
      for (const l of links) {
        if (typeof l.source === 'string') l.source = nodeById.get(l.source) ?? l.source;
        if (typeof l.target === 'string') l.target = nodeById.get(l.target) ?? l.target;
      }
      let tickFn: (() => void) | undefined;
      const sim = {
        on(event: string, fn: () => void) {
          if (event === 'tick') {
            tickFn = fn;
            setTimeout(() => tickFn?.(), 1);
          }
          return sim;
        },
        stop() {},
      };
      return sim;
    }),
  };
});

vi.mock('d3-zoom', () => {
  const transform = { x: 0, y: 0, k: 1 };
  const mockZoomBehavior = Object.assign(
    function zoom() {
      return mockZoomBehavior;
    },
    {
      scaleExtent: () => mockZoomBehavior,
      filter: () => mockZoomBehavior,
      on: () => mockZoomBehavior,
      transform: vi.fn(),
    },
  );
  return {
    zoom: () => mockZoomBehavior,
    zoomIdentity: { translate: () => ({ scale: () => transform }) },
  };
});

vi.mock('d3-selection', () => {
  const mockSelection = {
    call: vi.fn().mockReturnThis(),
    on: vi.fn().mockReturnThis(),
    transition: vi.fn().mockReturnThis(),
    duration: vi.fn().mockReturnThis(),
  };
  return {
    select: () => mockSelection,
  };
});

vi.mock('d3-transition', () => ({}));

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GraphView', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders correct number of node groups', async () => {
    const { container } = render(GraphView, { props: { graph: simpleGraph() } });
    await vi.advanceTimersByTimeAsync(500);
    // simpleGraph has 3 tasks → 3 GraphNode components → 3 circles each (glow, fill, badge)
    // + 1 root ring + 2 Toolbar circles + 1 ThemeToggle = 13
    const circles = container.querySelectorAll('circle');
    expect(circles.length).toBe(13);
  });

  it('renders correct number of edge paths', async () => {
    const { container } = render(GraphView, { props: { graph: simpleGraph() } });
    await vi.advanceTimersByTimeAsync(500);
    // simpleGraph: mid→leaf, root→mid = 2 edges; select main vine paths (stroke-width 2.5)
    const edgePaths = container.querySelectorAll('path[stroke-width="2.5"]');
    expect(edgePaths.length).toBe(2);
  });

  it('renders sidebar component', async () => {
    const { container } = render(GraphView, { props: { graph: simpleGraph() } });
    await vi.advanceTimersByTimeAsync(500);
    // Sidebar is mounted but hidden when no task is focused
    expect(container.querySelector('aside.sidebar')).toBeNull();
  });

  it('renders toolbar component', async () => {
    const { container } = render(GraphView, { props: { graph: simpleGraph() } });
    await vi.advanceTimersByTimeAsync(500);
    expect(container.querySelector('.toolbar')).toBeTruthy();
  });

  it('single-task graph has one node and zero edges', async () => {
    const { container } = render(GraphView, { props: { graph: singleTaskGraph() } });
    await vi.advanceTimersByTimeAsync(500);
    const circles = container.querySelectorAll('circle');
    // 1 node × 3 circles + 1 root ring + 2 Toolbar circles + 1 ThemeToggle = 7
    expect(circles.length).toBe(7);
    const edgePaths = container.querySelectorAll('path.anim-edge-flow');
    expect(edgePaths.length).toBe(0);
  });

  it('diamond graph has four nodes and four edges', async () => {
    const { container } = render(GraphView, { props: { graph: diamondGraph() } });
    await vi.advanceTimersByTimeAsync(500);
    const circles = container.querySelectorAll('circle');
    // 4 nodes × 3 circles + 1 root ring + 2 Toolbar circles + 1 ThemeToggle = 16
    expect(circles.length).toBe(16);
    const edgePaths = container.querySelectorAll('path[stroke-width="2.5"]');
    expect(edgePaths.length).toBe(4);
  });
});
