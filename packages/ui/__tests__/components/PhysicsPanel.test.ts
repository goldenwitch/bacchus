import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/svelte';
import PhysicsPanel from '../../src/lib/components/PhysicsPanel.svelte';
import { getDefaults } from '../../src/lib/physics.js';

// Polyfill Element.animate for jsdom
if (typeof Element.prototype.animate !== 'function') {
  Element.prototype.animate = function () {
    return { cancel: () => {}, finish: () => {}, play: () => {}, pause: () => {}, reverse: () => {}, onfinish: null, finished: Promise.resolve() } as unknown as Animation;
  };
}

function defaultProps() {
  return { config: getDefaults(4), onchange: vi.fn(), onreset: vi.fn() };
}

describe('PhysicsPanel', () => {
  afterEach(() => { cleanup(); });
  beforeEach(() => { vi.clearAllMocks(); });

  it('renders all 12 sliders', () => {
    const { container } = render(PhysicsPanel, { props: defaultProps() });
    const sliders = container.querySelectorAll('input[type="range"]');
    expect(sliders).toHaveLength(12);
  });

  it('renders group headers', () => {
    const { getByText } = render(PhysicsPanel, { props: defaultProps() });
    expect(getByText('Repulsion')).toBeInTheDocument();
    expect(getByText('Links')).toBeInTheDocument();
    expect(getByText('Collisions')).toBeInTheDocument();
    expect(getByText('Layout')).toBeInTheDocument();
    expect(getByText('Centering')).toBeInTheDocument();
    expect(getByText('Damping')).toBeInTheDocument();
  });

  it('slider fires onchange callback', async () => {
    const props = defaultProps();
    const { container } = render(PhysicsPanel, { props });
    const slider = container.querySelector('input[type="range"]')!;
    await fireEvent.input(slider, { target: { value: '-500' } });
    expect(props.onchange).toHaveBeenCalledTimes(1);
    const [key, value] = props.onchange.mock.calls[0];
    expect(typeof key).toBe('string');
    expect(typeof value).toBe('number');
  });

  it('reset button fires onreset callback', async () => {
    const props = defaultProps();
    const { getByRole } = render(PhysicsPanel, { props });
    const resetBtn = getByRole('button', { name: /reset defaults/i });
    await fireEvent.click(resetBtn);
    expect(props.onreset).toHaveBeenCalledTimes(1);
  });

  it('displays current config values', () => {
    const config = getDefaults(4);
    const { container } = render(PhysicsPanel, { props: { ...defaultProps(), config } });
    const valueSpans = container.querySelectorAll('.panel-slider-value');
    expect(valueSpans.length).toBe(12);
    for (const span of valueSpans) {
      expect(span.textContent!.trim()).toMatch(/^-?\d+(\.\d+)?$/);
    }
  });

  it('renders strata lines checkbox', () => {
    const { getByRole } = render(PhysicsPanel, { props: defaultProps() });
    const checkbox = getByRole('checkbox', { name: /show strata lines/i });
    expect(checkbox).toBeInTheDocument();
    expect((checkbox as HTMLInputElement).checked).toBe(false);
  });

  it('strata lines checkbox fires ontogglestrata callback', async () => {
    const ontogglestrata = vi.fn();
    const props = { ...defaultProps(), showStrataLines: false, ontogglestrata };
    const { getByRole } = render(PhysicsPanel, { props });
    const checkbox = getByRole('checkbox', { name: /show strata lines/i });
    await fireEvent.change(checkbox);
    expect(ontogglestrata).toHaveBeenCalledTimes(1);
    expect(ontogglestrata).toHaveBeenCalledWith(true);
  });

  it('strata lines checkbox reflects showStrataLines prop', () => {
    const props = { ...defaultProps(), showStrataLines: true };
    const { getByRole } = render(PhysicsPanel, { props });
    const checkbox = getByRole('checkbox', { name: /show strata lines/i });
    expect((checkbox as HTMLInputElement).checked).toBe(true);
  });
});
