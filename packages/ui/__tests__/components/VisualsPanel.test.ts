import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/svelte';
import VisualsPanel from '../../src/lib/components/VisualsPanel.svelte';
import { getDefaults, VISUALS_SLIDER_DEFS } from '../../src/lib/visuals.js';

// Polyfill Element.animate for jsdom
if (typeof Element.prototype.animate !== 'function') {
  Element.prototype.animate = function () {
    return { cancel: () => {}, finish: () => {}, play: () => {}, pause: () => {}, reverse: () => {}, onfinish: null, finished: Promise.resolve() } as unknown as Animation;
  };
}

function defaultProps() {
  return {
    config: getDefaults(),
    onchange: vi.fn(),
    onspritechange: vi.fn(),
    onreset: vi.fn(),
  };
}

describe('VisualsPanel', () => {
  afterEach(() => { cleanup(); });
  beforeEach(() => { vi.clearAllMocks(); });

  it('renders all sliders', () => {
    const { container } = render(VisualsPanel, { props: defaultProps() });
    const sliders = container.querySelectorAll('input[type="range"]');
    expect(sliders).toHaveLength(VISUALS_SLIDER_DEFS.length);
  });

  it('renders group headers including Sprite', () => {
    const { getByText } = render(VisualsPanel, { props: defaultProps() });
    // Data-driven groups
    const groups = new Set(VISUALS_SLIDER_DEFS.map((d) => d.group));
    for (const group of groups) {
      expect(getByText(group)).toBeInTheDocument();
    }
    // Hardcoded Sprite section
    expect(getByText('Sprite')).toBeInTheDocument();
  });

  it('slider fires onchange callback', async () => {
    const props = defaultProps();
    const { container } = render(VisualsPanel, { props });
    const slider = container.querySelector('input[type="range"]')!;
    await fireEvent.input(slider, { target: { value: '0.5' } });
    expect(props.onchange).toHaveBeenCalledTimes(1);
  });

  it('reset button fires onreset callback', async () => {
    const props = defaultProps();
    const { getByRole } = render(VisualsPanel, { props });
    const btn = getByRole('button', { name: /reset defaults/i });
    await fireEvent.click(btn);
    expect(props.onreset).toHaveBeenCalledTimes(1);
  });

  it('apply sprite button fires onspritechange', async () => {
    const props = defaultProps();
    const { getByRole } = render(VisualsPanel, { props });
    const applyBtn = getByRole('button', { name: /apply sprite/i });
    await fireEvent.click(applyBtn);
    expect(props.onspritechange).toHaveBeenCalledTimes(1);
  });

  it('clear sprite button fires onspritechange with empty string', async () => {
    const props = defaultProps();
    props.config = { ...props.config, globalSpriteOverride: './test.svg' };
    const { getByRole } = render(VisualsPanel, { props });
    const clearBtn = getByRole('button', { name: /clear sprite override/i });
    await fireEvent.click(clearBtn);
    expect(props.onspritechange).toHaveBeenCalledWith('');
  });

  it('displays formatted slider values', () => {
    const { container } = render(VisualsPanel, { props: defaultProps() });
    const valueSpans = container.querySelectorAll('.panel-slider-value');
    expect(valueSpans.length).toBe(VISUALS_SLIDER_DEFS.length);
    for (const span of valueSpans) {
      expect(span.textContent!.trim()).toMatch(/^-?\d+(\.\d+)?$/);
    }
  });
});
