import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/svelte';
import GraphEdge from '../../src/lib/components/GraphEdge.svelte';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function defaultProps(overrides: Record<string, unknown> = {}) {
  return {
    sourceX: 0,
    sourceY: 0,
    targetX: 200,
    targetY: 100,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GraphEdge', () => {
  it('renders vine path with cubic Bézier segments', () => {
    const { container } = render(GraphEdge, { props: defaultProps() });
    const path = container.querySelector('path[stroke]');
    expect(path).not.toBeNull();
    const d = path!.getAttribute('d') ?? '';
    expect(d).toContain('C');
  });

  it('renders leaf-shaped arrowhead marker', () => {
    const { container } = render(GraphEdge, { props: defaultProps() });
    const marker = container.querySelector('marker');
    expect(marker).not.toBeNull();
    const leafPath = marker!.querySelector('path');
    expect(leafPath).not.toBeNull();
    expect(leafPath!.getAttribute('fill')).toBe('var(--color-vine-leaf)');
  });

  it('normal opacity is 0.6', () => {
    const { container } = render(GraphEdge, { props: defaultProps() });
    const path = container.querySelector('path[stroke]');
    expect(path).not.toBeNull();
    expect(path!.getAttribute('opacity')).toBe('0.6');
  });

  it('highlighted edge has opacity 1.0', () => {
    const { container } = render(GraphEdge, {
      props: defaultProps({ highlighted: true }),
    });
    const path = container.querySelector('path.anim-edge-flow');
    expect(path).not.toBeNull();
    expect(path!.getAttribute('opacity')).toBe('1');
  });

  it('dimmed edge has opacity 0.15', () => {
    const { container } = render(GraphEdge, {
      props: defaultProps({ dimmed: true }),
    });
    const path = container.querySelector('path[stroke]');
    expect(path).not.toBeNull();
    expect(path!.getAttribute('opacity')).toBe('0.15');
  });

  it('invisible edge has opacity 0', () => {
    const { container } = render(GraphEdge, {
      props: defaultProps({ visible: false }),
    });
    const path = container.querySelector('path[stroke]');
    expect(path).not.toBeNull();
    expect(path!.getAttribute('opacity')).toBe('0');
  });

  it('has edge-flow animation class when highlighted', () => {
    const { container } = render(GraphEdge, { props: defaultProps({ highlighted: true }) });
    const path = container.querySelector('.anim-edge-flow');
    expect(path).not.toBeNull();
  });

  it('does not have edge-flow animation class when not highlighted', () => {
    const { container } = render(GraphEdge, { props: defaultProps() });
    const path = container.querySelector('.anim-edge-flow');
    expect(path).toBeNull();
  });

  it('color prop controls stroke', () => {
    const { container } = render(GraphEdge, {
      props: defaultProps({ color: '#ff0000' }),
    });
    const path = container.querySelector('path[stroke]');
    expect(path).not.toBeNull();
    expect(path!.getAttribute('stroke')).toBe('#ff0000');
  });

  it('path has transition styles', () => {
    const { container } = render(GraphEdge, { props: defaultProps() });
    const path = container.querySelector('path[stroke]') as SVGElement;
    expect(path).not.toBeNull();
    const style = path.getAttribute('style') ?? '';
    expect(style).toContain('transition');
  });

  it('default stroke uses vine color var', () => {
    const { container } = render(GraphEdge, { props: defaultProps() });
    const path = container.querySelector('path[stroke]');
    expect(path).not.toBeNull();
    expect(path!.getAttribute('stroke')).toBe('var(--color-vine)');
  });

  it('renders leaf decorations along the vine', () => {
    const { container } = render(GraphEdge, {
      props: defaultProps({ sourceId: 'a', targetId: 'b' }),
    });
    // Leaf decorations use the sway animation class
    const leafGroups = container.querySelectorAll('.anim-vine-leaf-sway');
    expect(leafGroups.length).toBeGreaterThanOrEqual(1);
    // Each leaf group contains a leaf path
    for (const g of leafGroups) {
      const leafPath = g.querySelector('path');
      expect(leafPath).not.toBeNull();
      expect(leafPath!.getAttribute('fill')).toBe('var(--color-vine-leaf)');
    }
  });

  it('renders tendril decorations along the vine', () => {
    const { container } = render(GraphEdge, {
      props: defaultProps({ sourceId: 'a', targetId: 'b' }),
    });
    const tendrilGroups = container.querySelectorAll('.anim-vine-tendril-sway');
    expect(tendrilGroups.length).toBeGreaterThanOrEqual(1);
    // Each tendril is a stroke-only path (no fill)
    for (const g of tendrilGroups) {
      const tendrilPath = g.querySelector('path');
      expect(tendrilPath).not.toBeNull();
      expect(tendrilPath!.getAttribute('fill')).toBe('none');
      expect(tendrilPath!.getAttribute('stroke')).toBe('var(--color-vine-leaf)');
    }
  });

  it('decoration count scales with edge distance', () => {
    // Short edge
    const { container: short } = render(GraphEdge, {
      props: defaultProps({ sourceX: 0, sourceY: 0, targetX: 50, targetY: 0, sourceId: 'a', targetId: 'b' }),
    });
    const shortDecos = short.querySelectorAll('.anim-vine-leaf-sway, .anim-vine-tendril-sway');

    // Long edge
    const { container: long } = render(GraphEdge, {
      props: defaultProps({ sourceX: 0, sourceY: 0, targetX: 600, targetY: 0, sourceId: 'c', targetId: 'd' }),
    });
    const longDecos = long.querySelectorAll('.anim-vine-leaf-sway, .anim-vine-tendril-sway');

    expect(longDecos.length).toBeGreaterThan(shortDecos.length);
  });

  it('vine path has round line caps', () => {
    const { container } = render(GraphEdge, { props: defaultProps() });
    const path = container.querySelector('path[stroke]');
    expect(path).not.toBeNull();
    expect(path!.getAttribute('stroke-linecap')).toBe('round');
  });
});
