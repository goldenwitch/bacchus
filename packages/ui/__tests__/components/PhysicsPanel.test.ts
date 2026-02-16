import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/svelte';
import PhysicsPanel from '../../src/lib/components/PhysicsPanel.svelte';
import { getDefaults } from '../../src/lib/physics.js';
import type { PhysicsParamKey } from '../../src/lib/physics.js';

// Polyfill Element.animate for jsdom (used by Svelte slide transition)
if (typeof Element.prototype.animate !== 'function') {
  Element.prototype.animate = function () {
    return {
      cancel: () => {},
      finish: () => {},
      play: () => {},
      pause: () => {},
      reverse: () => {},
      onfinish: null,
      finished: Promise.resolve(),
    } as unknown as Animation;
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function defaultProps() {
  return {
    config: getDefaults(4),
    onchange: vi.fn(),
    onreset: vi.fn(),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PhysicsPanel', () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders collapsed by default', () => {
    const { getByRole } = render(PhysicsPanel, { props: defaultProps() });
    const toggle = getByRole('button', { name: /toggle physics controls/i });
    expect(toggle).toBeInTheDocument();
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(toggle.textContent).toContain('Physics');
  });

  it('expands on click', async () => {
    const { getByRole, container } = render(PhysicsPanel, {
      props: defaultProps(),
    });
    const toggle = getByRole('button', { name: /toggle physics controls/i });

    await fireEvent.click(toggle);

    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    const sliders = container.querySelectorAll('input[type="range"]');
    expect(sliders.length).toBeGreaterThan(0);
  });

  it('renders all 9 sliders when expanded', async () => {
    const { getByRole, container } = render(PhysicsPanel, {
      props: defaultProps(),
    });
    const toggle = getByRole('button', { name: /toggle physics controls/i });

    await fireEvent.click(toggle);

    const sliders = container.querySelectorAll('input[type="range"]');
    expect(sliders).toHaveLength(12);
  });

  it('renders group headers', async () => {
    const { getByRole, getByText } = render(PhysicsPanel, {
      props: defaultProps(),
    });
    const toggle = getByRole('button', { name: /toggle physics controls/i });

    await fireEvent.click(toggle);

    expect(getByText('Repulsion')).toBeInTheDocument();
    expect(getByText('Links')).toBeInTheDocument();
    expect(getByText('Collisions')).toBeInTheDocument();
    expect(getByText('Layout')).toBeInTheDocument();
    expect(getByText('Centering')).toBeInTheDocument();
    expect(getByText('Damping')).toBeInTheDocument();
  });

  it('slider fires onchange callback', async () => {
    const props = defaultProps();
    const { getByRole, container } = render(PhysicsPanel, { props });
    const toggle = getByRole('button', { name: /toggle physics controls/i });

    await fireEvent.click(toggle);

    const slider = container.querySelector('input[type="range"]')!;
    expect(slider).toBeTruthy();

    await fireEvent.input(slider, { target: { value: '-500' } });

    expect(props.onchange).toHaveBeenCalledTimes(1);
    const [key, value] = props.onchange.mock.calls[0];
    expect(typeof key).toBe('string');
    expect(typeof value).toBe('number');
  });

  it('reset button fires onreset callback', async () => {
    const props = defaultProps();
    const { getByRole } = render(PhysicsPanel, { props });
    const toggle = getByRole('button', { name: /toggle physics controls/i });

    await fireEvent.click(toggle);

    const resetBtn = getByRole('button', { name: /reset defaults/i });
    await fireEvent.click(resetBtn);

    expect(props.onreset).toHaveBeenCalledTimes(1);
  });

  it('displays current config values', async () => {
    const config = getDefaults(4);
    const props = { ...defaultProps(), config };
    const { getByRole, container } = render(PhysicsPanel, { props });
    const toggle = getByRole('button', { name: /toggle physics controls/i });

    await fireEvent.click(toggle);

    // Check that formatted values appear in the panel
    const valueSpans = container.querySelectorAll('.physics-slider-value');
    expect(valueSpans.length).toBe(12);

    // Each value span should contain a number string
    for (const span of valueSpans) {
      const text = span.textContent!.trim();
      expect(text).toMatch(/^-?\d+(\.\d+)?$/);
    }
  });

  it('renders strata lines checkbox when expanded', async () => {
    const { getByRole } = render(PhysicsPanel, { props: defaultProps() });
    const toggle = getByRole('button', { name: /toggle physics controls/i });

    await fireEvent.click(toggle);

    const checkbox = getByRole('checkbox', { name: /show strata lines/i });
    expect(checkbox).toBeInTheDocument();
    expect((checkbox as HTMLInputElement).checked).toBe(false);
  });

  it('strata lines checkbox fires ontogglestrata callback', async () => {
    const ontogglestrata = vi.fn();
    const props = { ...defaultProps(), showStrataLines: false, ontogglestrata };
    const { getByRole } = render(PhysicsPanel, { props });
    const toggle = getByRole('button', { name: /toggle physics controls/i });

    await fireEvent.click(toggle);

    const checkbox = getByRole('checkbox', { name: /show strata lines/i });
    await fireEvent.change(checkbox);

    expect(ontogglestrata).toHaveBeenCalledTimes(1);
    expect(ontogglestrata).toHaveBeenCalledWith(true);
  });

  it('strata lines checkbox reflects showStrataLines prop', async () => {
    const props = { ...defaultProps(), showStrataLines: true };
    const { getByRole } = render(PhysicsPanel, { props });
    const toggle = getByRole('button', { name: /toggle physics controls/i });

    await fireEvent.click(toggle);

    const checkbox = getByRole('checkbox', { name: /show strata lines/i });
    expect((checkbox as HTMLInputElement).checked).toBe(true);
  });
});
