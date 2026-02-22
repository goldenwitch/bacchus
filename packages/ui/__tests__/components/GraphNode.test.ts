import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import type { Task } from '@bacchus/core';
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
  overrides: Partial<SimNode & { task?: Partial<Task> }> = {},
): SimNode {
  const task: Task = {
    id: overrides.id ?? 'node-1',
    shortName: overrides.task?.shortName ?? 'Test Node',
    description: overrides.task?.description ?? 'Test description',
    status: overrides.task?.status ?? 'started',
    dependencies: overrides.task?.dependencies ?? [],
    decisions: overrides.task?.decisions ?? [],
    attachments: [],
    vine: undefined,
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
    // circles[0]=outer glow, circles[1]=inner fill, circles[2]=specular,
    // circles[3]=shadow, circles[4]=iridescent rim, circles[5]=emoji badge
    const outerCircle = circles[0];
    expect(outerCircle).toBeDefined();
    expect(outerCircle.getAttribute('stroke')).toBe(STATUS_MAP.started.color);
  });

  it('renders inner fill circle with glass gradient', () => {
    const node = makeSimNode({ task: { status: 'started' } });
    const { container } = render(GraphNode, { props: defaultProps({ node }) });
    const circles = container.querySelectorAll('circle');
    // circles[1]=inner fill
    const innerCircle = circles[1];
    expect(innerCircle).toBeDefined();
    const fill = innerCircle.getAttribute('fill') ?? '';
    expect(fill).toContain('url(#glassGrad');
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
    // circles[0]=outer glow, circles[1]=inner fill, circles[2]=specular,
    // circles[3]=shadow, circles[4]=iridescent rim, circles[5]=emoji badge
    const outerR = Number(circles[0].getAttribute('r'));
    expect(outerR).toBeGreaterThanOrEqual(36);
    expect(outerR).toBeLessThanOrEqual(66);
    const innerR = Number(circles[1].getAttribute('r'));
    expect(innerR).toBeGreaterThanOrEqual(30);
    expect(innerR).toBeLessThanOrEqual(60);
    const badgeR = Number(circles[5].getAttribute('r'));
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

  it('renders specular highlight and inner shadow overlays', () => {
    const node = makeSimNode();
    const { container } = render(GraphNode, { props: defaultProps({ node }) });
    const circles = container.querySelectorAll('circle');
    // circles[2]=specular, circles[3]=shadow
    const specularFill = circles[2].getAttribute('fill') ?? '';
    expect(specularFill).toContain('url(#specular-');
    const shadowFill = circles[3].getAttribute('fill') ?? '';
    expect(shadowFill).toContain('url(#innerShadow-');
    // circles[4]=iridescent rim
    const rimStroke = circles[4].getAttribute('stroke') ?? '';
    expect(rimStroke).toContain('url(#iridescentRim-');
  });

  it('started nodes have glow pulse animation', () => {
    const node = makeSimNode({ task: { status: 'started' } });
    const { container } = render(GraphNode, { props: defaultProps({ node }) });
    const circles = container.querySelectorAll('circle');
    // circles[0] is the outer glow ring
    const outerCircle = circles[0];
    expect(outerCircle.classList.contains('anim-glow-pulse')).toBe(true);
  });

  it('complete nodes have shimmer animation', () => {
    const node = makeSimNode({ task: { status: 'complete' } });
    const { container } = render(GraphNode, { props: defaultProps({ node }) });
    const circles = container.querySelectorAll('circle');
    // circles[1] is the inner fill circle (same index for all bubble configs)
    const innerCircle = circles[1];
    expect(innerCircle.classList.contains('anim-completion-shimmer')).toBe(
      true,
    );
  });

  it('renders radial gradient defs for glass effect', () => {
    const node = makeSimNode();
    const { container } = render(GraphNode, { props: defaultProps({ node }) });
    const radialGrads = container.querySelectorAll('radialGradient');
    // glassGrad, specular, innerShadow
    expect(radialGrads.length).toBe(3);
    const glassGrad = Array.from(radialGrads).find((g) =>
      g.id.includes('glassGrad'),
    );
    expect(glassGrad).toBeDefined();
    expect(glassGrad!.querySelectorAll('stop').length).toBe(3);
    // textGlow filter in defs
    const textGlowFilter = container.querySelector('filter[id^="textGlow-"]');
    expect(textGlowFilter).not.toBeNull();
    // feDropShadow is an SVG element; jsdom may not expose it via querySelector,
    // so verify the filter has child content instead.
    expect(textGlowFilter!.innerHTML).toContain('fedropshadow');
  });

  it('renders iridescent rim linear gradient', () => {
    const node = makeSimNode();
    const { container } = render(GraphNode, { props: defaultProps({ node }) });
    const linearGrad = container.querySelector('linearGradient');
    expect(linearGrad).not.toBeNull();
    expect(linearGrad!.id).toContain('iridescentRim');
    expect(linearGrad!.querySelectorAll('stop').length).toBe(5);
  });

  it('inner fill circle uses radial gradient', () => {
    const node = makeSimNode();
    const { container } = render(GraphNode, { props: defaultProps({ node }) });
    const circles = container.querySelectorAll('circle');
    // circles[1] is the inner fill circle
    const fillAttr = circles[1].getAttribute('fill') ?? '';
    expect(fillAttr).toContain('url(#glassGrad');
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
