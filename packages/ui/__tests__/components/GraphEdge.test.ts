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
  it('renders path with quadratic Bézier', () => {
    const { container } = render(GraphEdge, { props: defaultProps() });
    const path = container.querySelector('path:not([d^="M 0 0 L"])');
    expect(path).not.toBeNull();
    const d = path!.getAttribute('d') ?? '';
    expect(d).toContain('Q');
  });

  it('renders arrowhead marker', () => {
    const { container } = render(GraphEdge, { props: defaultProps() });
    const marker = container.querySelector('marker');
    expect(marker).not.toBeNull();
  });

  it('normal opacity is 0.6', () => {
    const { container } = render(GraphEdge, { props: defaultProps() });
    const path = container.querySelector('path.anim-edge-flow');
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
    const path = container.querySelector('path.anim-edge-flow');
    expect(path).not.toBeNull();
    expect(path!.getAttribute('opacity')).toBe('0.15');
  });

  it('invisible edge has opacity 0', () => {
    const { container } = render(GraphEdge, {
      props: defaultProps({ visible: false }),
    });
    const path = container.querySelector('path.anim-edge-flow');
    expect(path).not.toBeNull();
    expect(path!.getAttribute('opacity')).toBe('0');
  });

  it('has edge-flow animation class', () => {
    const { container } = render(GraphEdge, { props: defaultProps() });
    const path = container.querySelector('.anim-edge-flow');
    expect(path).not.toBeNull();
  });

  it('color prop controls stroke', () => {
    const { container } = render(GraphEdge, {
      props: defaultProps({ color: '#ff0000' }),
    });
    const path = container.querySelector('path.anim-edge-flow');
    expect(path).not.toBeNull();
    expect(path!.getAttribute('stroke')).toBe('#ff0000');
  });

  it('path has transition styles', () => {
    const { container } = render(GraphEdge, { props: defaultProps() });
    const path = container.querySelector('path.anim-edge-flow') as SVGElement;
    expect(path).not.toBeNull();
    const style = path.getAttribute('style') ?? '';
    expect(style).toContain('transition');
  });
});
