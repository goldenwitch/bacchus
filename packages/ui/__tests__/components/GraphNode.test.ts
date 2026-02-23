import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import type { ConcreteTask } from '@bacchus/core';
import type { SimNode } from '../../src/lib/types.js';
import { STATUS_MAP } from '../../src/lib/status.js';
import GraphNode from '../../src/lib/components/GraphNode.svelte';

// ---------------------------------------------------------------------------
// Mock sound module
// ---------------------------------------------------------------------------
vi.mock('../../src/lib/sound.js', () => ({
  playPop: vi.fn(),
  playHover: vi.fn(),
  playWhoosh: vi.fn(),
  initAudio: vi.fn(),
  isMuted: vi.fn(() => false),
  setMuted: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSimNode(
  overrides: Partial<SimNode & { task?: Partial<ConcreteTask> }> = {},
): SimNode {
  const task: ConcreteTask = {
    kind: 'task',
    id: overrides.id ?? 'node-1',
    shortName: overrides.task?.shortName ?? 'Test Node',
    description: overrides.task?.description ?? 'Test description',
    status: overrides.task?.status ?? 'started',
    dependencies: overrides.task?.dependencies ?? [],
    decisions: overrides.task?.decisions ?? [],
    attachments: [],
    annotations: new Map(),
  };
  return {
    id: task.id,
    task,
    depth: overrides.depth ?? 0,
    x: overrides.x ?? 100,
    y: overrides.y ?? 100,
  };
}

function defaultProps(overrides: Record<string, unknown> = {}) {
  return {
    node: makeSimNode(),
    focused: false,
    dimmed: false,
    visible: true,
    onfocus: vi.fn(),
    onhoverstart: vi.fn(),
    onhoverend: vi.fn(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GraphNode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders outer glow circle with status color', () => {
    const node = makeSimNode({ task: { status: 'started' } });
    const { container } = render(GraphNode, { props: defaultProps({ node }) });
    const circles = container.querySelectorAll('circle');
    // circles[0]=outer glow, circles[1]=emoji badge
    const outerCircle = circles[0];
    expect(outerCircle).toBeDefined();
    expect(outerCircle.getAttribute('stroke')).toBe(STATUS_MAP.started.color);
  });

  it('renders sprite <use> element with tint filter', () => {
    const node = makeSimNode({ task: { status: 'started' } });
    const { container } = render(GraphNode, { props: defaultProps({ node }) });
    const useEl = container.querySelector('use');
    expect(useEl).not.toBeNull();
    expect(useEl!.getAttribute('href')).toBe('#sprite-default');
    const filter = useEl!.getAttribute('filter') ?? '';
    expect(filter).toContain('sprite-tint-');
  });

  it('renders emoji badge for status', () => {
    const node = makeSimNode({ task: { status: 'started' } });
    const { container } = render(GraphNode, { props: defaultProps({ node }) });
    const texts = container.querySelectorAll('text');
    const emojiText = Array.from(texts).find((t) =>
      t.textContent?.includes('🔨'),
    );
    expect(emojiText).toBeDefined();
  });

  it('renders floating label with shortName', () => {
    const node = makeSimNode({ task: { shortName: 'Deploy Service' } });
    const { container } = render(GraphNode, { props: defaultProps({ node }) });
    const texts = container.querySelectorAll('text');
    const label = Array.from(texts).find(
      (t) =>
        t.textContent?.includes('Deploy') && t.textContent?.includes('Service'),
    );
    expect(label).toBeDefined();
  });

  it('radius between 30 and 60', () => {
    const node = makeSimNode({ task: { shortName: 'Hi' } });
    const { container } = render(GraphNode, { props: defaultProps({ node }) });
    const circles = container.querySelectorAll('circle');
    // circles[0]=outer glow, circles[1]=hit area, circles[2]=emoji badge
    const outerR = Number(circles[0].getAttribute('r'));
    expect(outerR).toBeGreaterThanOrEqual(36);
    expect(outerR).toBeLessThanOrEqual(66);
    const badgeR = Number(circles[2].getAttribute('r'));
    expect(badgeR).toBe(12);
  });

  it('click calls onfocus', async () => {
    const onfocus = vi.fn();
    const node = makeSimNode();
    const { container } = render(GraphNode, {
      props: defaultProps({ node, onfocus }),
    });
    const gElement = container.querySelector('g');
    expect(gElement).not.toBeNull();
    await fireEvent.click(gElement!);
    expect(onfocus).toHaveBeenCalledWith(node.id);
  });

  it('hover calls onhoverstart, leave calls onhoverend', async () => {
    const onhoverstart = vi.fn();
    const onhoverend = vi.fn();
    const node = makeSimNode();
    const { container } = render(GraphNode, {
      props: defaultProps({ node, onhoverstart, onhoverend }),
    });
    const gElement = container.querySelector('g');
    expect(gElement).not.toBeNull();

    await fireEvent.pointerEnter(gElement!);
    expect(onhoverstart).toHaveBeenCalledWith(node.id, expect.any(Object));

    await fireEvent.pointerLeave(gElement!);
    expect(onhoverend).toHaveBeenCalled();
  });

  it('dimmed node has opacity 0.45', () => {
    const node = makeSimNode();
    const { container } = render(GraphNode, {
      props: defaultProps({ node, dimmed: true }),
    });
    const gElement = container.querySelector('g');
    expect(gElement).not.toBeNull();
    expect(gElement!.getAttribute('opacity')).toBe('0.45');
  });

  it('focused node has full opacity', () => {
    const node = makeSimNode();
    const { container } = render(GraphNode, {
      props: defaultProps({ node, focused: true, dimmed: false }),
    });
    const gElement = container.querySelector('g');
    expect(gElement).not.toBeNull();
    expect(gElement!.getAttribute('opacity')).toBe('1');
  });

  it('renders specular highlight and inner shadow overlays via sprite', () => {
    const node = makeSimNode();
    const { container } = render(GraphNode, { props: defaultProps({ node }) });
    // The sprite <use> element replaces specular/shadow/rim circles
    const useEl = container.querySelector('use');
    expect(useEl).not.toBeNull();
    expect(useEl!.getAttribute('href')).toBe('#sprite-default');
  });

  it('started nodes have glow pulse animation', () => {
    const node = makeSimNode({ task: { status: 'started' } });
    const { container } = render(GraphNode, { props: defaultProps({ node }) });
    const circles = container.querySelectorAll('circle');
    // circles[0] is the outer glow ring
    const outerCircle = circles[0];
    expect(outerCircle.classList.contains('anim-glow-pulse')).toBe(true);
  });

  it('complete nodes have shimmer animation on sprite', () => {
    const node = makeSimNode({ task: { status: 'complete' } });
    const { container } = render(GraphNode, { props: defaultProps({ node }) });
    const useEl = container.querySelector('use');
    expect(useEl).not.toBeNull();
    expect(useEl!.classList.contains('anim-completion-shimmer')).toBe(true);
  });

  it('renders text glow filter in per-node defs', () => {
    const node = makeSimNode();
    const { container } = render(GraphNode, { props: defaultProps({ node }) });
    // textGlow filter in defs
    const textGlowFilter = container.querySelector('filter[id^="textGlow-"]');
    expect(textGlowFilter).not.toBeNull();
    expect(textGlowFilter!.innerHTML).toContain('fedropshadow');
    // Glow blur filter for outer ring
    const glowFilter = container.querySelector('filter[id^="glow-"]');
    expect(glowFilter).not.toBeNull();
  });

  it('sprite system replaces procedural gradients', () => {
    const node = makeSimNode();
    const { container } = render(GraphNode, { props: defaultProps({ node }) });
    // No more per-node radialGradient or linearGradient — sprites use shared defs
    const radialGrads = container.querySelectorAll('radialGradient');
    expect(radialGrads.length).toBe(0);
    const linearGrad = container.querySelector('linearGradient');
    expect(linearGrad).toBeNull();
  });

  it('label text uses Fredoka bubble font', () => {
    const node = makeSimNode();
    const { container } = render(GraphNode, { props: defaultProps({ node }) });
    const label = container.querySelector('.anim-label-bob');
    expect(label).not.toBeNull();
    expect(label!.getAttribute('font-family')).toBe('var(--font-bubble)');
    // Dynamic font-size and font-weight from CSS vars (jsdom defaults)
    expect(label!.getAttribute('font-size')).toBe('14');
    expect(label!.getAttribute('font-weight')).toBe('400');
    // Text glow filter attribute
    expect(label!.getAttribute('filter')).toContain('textGlow');
  });

  it('all labels have bob animation', () => {
    const node = makeSimNode();
    const { container } = render(GraphNode, { props: defaultProps({ node }) });
    const label = container.querySelector('.anim-label-bob');
    expect(label).not.toBeNull();
    expect(label!.tagName.toLowerCase()).toBe('text');
  });

  it('visible=false starts at scale 0', () => {
    const node = makeSimNode();
    const { container } = render(GraphNode, {
      props: defaultProps({ node, visible: false }),
    });
    // The inner g should have transform with scale(0)
    const groups = container.querySelectorAll('g');
    const scaleGroup = Array.from(groups).find((g) => {
      const transform = g.getAttribute('transform') ?? '';
      return transform.includes('scale');
    });
    expect(scaleGroup).toBeDefined();
    expect(scaleGroup!.getAttribute('transform')).toContain('scale(0)');
  });
});
