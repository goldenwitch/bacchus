import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/svelte';
import PanelSlider from '../../src/lib/components/primitives/PanelSlider.svelte';
import GroupHeader from '../../src/lib/components/primitives/GroupHeader.svelte';
import ResetButton from '../../src/lib/components/primitives/ResetButton.svelte';
import PanelCheckbox from '../../src/lib/components/primitives/PanelCheckbox.svelte';
import TextInput from '../../src/lib/components/primitives/TextInput.svelte';
import PanelBody from '../../src/lib/components/primitives/PanelBody.svelte';

// Polyfill Element.animate for jsdom
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

describe('PanelSlider', () => {
  afterEach(() => {
    cleanup();
  });
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders label and formatted value', () => {
    const { getByText } = render(PanelSlider, {
      props: {
        label: 'Speed',
        value: 42,
        min: 0,
        max: 100,
        step: 1,
        onchange: vi.fn(),
      },
    });
    expect(getByText('Speed')).toBeInTheDocument();
    expect(getByText('42')).toBeInTheDocument();
  });

  it('renders the range input with correct attributes', () => {
    const { container } = render(PanelSlider, {
      props: {
        label: 'Speed',
        value: 50,
        min: 0,
        max: 100,
        step: 5,
        onchange: vi.fn(),
      },
    });
    const input = container.querySelector('input[type="range"]')!;
    expect(input).toBeTruthy();
    expect(input.getAttribute('min')).toBe('0');
    expect(input.getAttribute('max')).toBe('100');
    expect(input.getAttribute('step')).toBe('5');
    expect(input.getAttribute('aria-label')).toBe('Speed');
  });

  it('fires onchange with numeric value', async () => {
    const onchange = vi.fn();
    const { container } = render(PanelSlider, {
      props: { label: 'Speed', value: 50, min: 0, max: 100, step: 1, onchange },
    });
    const input = container.querySelector('input[type="range"]')!;
    await fireEvent.input(input, { target: { value: '75' } });
    expect(onchange).toHaveBeenCalledTimes(1);
    expect(onchange).toHaveBeenCalledWith(75);
  });

  it('uses custom formatFn when provided', () => {
    const { getByText } = render(PanelSlider, {
      props: {
        label: 'Charge',
        value: -500,
        min: -1000,
        max: 0,
        step: 10,
        onchange: vi.fn(),
        formatFn: (v: number) => `${String(Math.abs(v))} units`,
      },
    });
    expect(getByText('500 units')).toBeInTheDocument();
  });

  it('auto-formats based on step precision', () => {
    const { getByText } = render(PanelSlider, {
      props: {
        label: 'Fine',
        value: 0.123,
        min: 0,
        max: 1,
        step: 0.01,
        onchange: vi.fn(),
      },
    });
    expect(getByText('0.12')).toBeInTheDocument();
  });
});

describe('GroupHeader', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders uppercase label text', () => {
    const { container } = render(GroupHeader, {
      props: { label: 'Repulsion' },
    });
    const header = container.querySelector('.panel-group-header')!;
    expect(header).toBeTruthy();
    expect(header.textContent).toBe('Repulsion');
  });
});

describe('ResetButton', () => {
  afterEach(() => {
    cleanup();
  });
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders with default label', () => {
    const { getByRole } = render(ResetButton, { props: { onclick: vi.fn() } });
    const btn = getByRole('button', { name: /reset defaults/i });
    expect(btn).toBeInTheDocument();
  });

  it('renders with custom label', () => {
    const { getByRole } = render(ResetButton, {
      props: { label: 'Clear All', onclick: vi.fn() },
    });
    expect(getByRole('button', { name: /clear all/i })).toBeInTheDocument();
  });

  it('fires onclick callback', async () => {
    const onclick = vi.fn();
    const { getByRole } = render(ResetButton, { props: { onclick } });
    await fireEvent.click(getByRole('button', { name: /reset defaults/i }));
    expect(onclick).toHaveBeenCalledTimes(1);
  });
});

describe('PanelCheckbox', () => {
  afterEach(() => {
    cleanup();
  });
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders unchecked by default', () => {
    const { getByRole } = render(PanelCheckbox, {
      props: { checked: false, label: 'Enable', onchange: vi.fn() },
    });
    const cb = getByRole('checkbox', { name: /enable/i });
    expect(cb).toBeInTheDocument();
    expect((cb as HTMLInputElement).checked).toBe(false);
  });

  it('renders checked when prop is true', () => {
    const { getByRole } = render(PanelCheckbox, {
      props: { checked: true, label: 'Enable', onchange: vi.fn() },
    });
    expect(
      (getByRole('checkbox', { name: /enable/i }) as HTMLInputElement).checked,
    ).toBe(true);
  });

  it('fires onchange with toggled value', async () => {
    const onchange = vi.fn();
    const { getByRole } = render(PanelCheckbox, {
      props: { checked: false, label: 'Enable', onchange },
    });
    await fireEvent.change(getByRole('checkbox', { name: /enable/i }));
    expect(onchange).toHaveBeenCalledTimes(1);
    expect(onchange).toHaveBeenCalledWith(true);
  });

  it('uses custom ariaLabel when provided', () => {
    const { getByRole } = render(PanelCheckbox, {
      props: {
        checked: false,
        label: 'Lines',
        onchange: vi.fn(),
        ariaLabel: 'Show strata lines',
      },
    });
    expect(
      getByRole('checkbox', { name: /show strata lines/i }),
    ).toBeInTheDocument();
  });
});

describe('TextInput', () => {
  afterEach(() => {
    cleanup();
  });
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders with placeholder', () => {
    const { container } = render(TextInput, {
      props: { placeholder: 'Enter URL...' },
    });
    const input = container.querySelector('input')!;
    expect(input.getAttribute('placeholder')).toBe('Enter URL...');
  });

  it('fires onsubmit on Enter key', async () => {
    const onsubmit = vi.fn();
    const { container } = render(TextInput, {
      props: { onsubmit, ariaLabel: 'URL input' },
    });
    const input = container.querySelector('input')!;
    await fireEvent.keyDown(input, { key: 'Enter' });
    expect(onsubmit).toHaveBeenCalledTimes(1);
  });

  it('does not fire onsubmit on non-Enter key', async () => {
    const onsubmit = vi.fn();
    const { container } = render(TextInput, {
      props: { onsubmit },
    });
    const input = container.querySelector('input')!;
    await fireEvent.keyDown(input, { key: 'Tab' });
    expect(onsubmit).not.toHaveBeenCalled();
  });

  it('renders with aria-label', () => {
    const { container } = render(TextInput, {
      props: { ariaLabel: 'API Key' },
    });
    const input = container.querySelector('input')!;
    expect(input.getAttribute('aria-label')).toBe('API Key');
  });

  it('renders password type', () => {
    const { container } = render(TextInput, {
      props: { type: 'password' },
    });
    expect(container.querySelector('input')!.getAttribute('type')).toBe(
      'password',
    );
  });
});

describe('PanelBody', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders children content inside .panel-body wrapper', () => {
    const { container, getByText } = render(PanelBody, {
      props: { children: ((/** @type {any} */ _anchor: any) => {}) as any },
    });
    const wrapper = container.querySelector('.panel-body');
    expect(wrapper).toBeTruthy();
  });

  it('applies default width of 230px', () => {
    const { container } = render(PanelBody, {
      props: { children: (() => {}) as any },
    });
    const wrapper = container.querySelector('.panel-body') as HTMLElement;
    expect(wrapper.style.width).toBe('230px');
  });

  it('applies custom width when provided', () => {
    const { container } = render(PanelBody, {
      props: { width: '340px', children: (() => {}) as any },
    });
    const wrapper = container.querySelector('.panel-body') as HTMLElement;
    expect(wrapper.style.width).toBe('340px');
  });

  it('has the panel-body class for scroll styling', () => {
    const { container } = render(PanelBody, {
      props: { children: (() => {}) as any },
    });
    const wrapper = container.querySelector('.panel-body');
    expect(wrapper).toBeTruthy();
    expect(wrapper!.classList.contains('panel-body')).toBe(true);
  });
});
