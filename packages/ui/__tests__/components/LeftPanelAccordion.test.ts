import { render, fireEvent, cleanup } from '@testing-library/svelte';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createMockSession } from '../fixtures/chatSessionMock.js';

vi.mock('../../src/lib/chat/session.js', () => ({
  ChatSession: vi.fn().mockImplementation(() => createMockSession()),
}));

import LeftPanelAccordion from '../../src/lib/components/LeftPanelAccordion.svelte';
import { getDefaults } from '../../src/lib/physics.js';
import { getDefaults as getVisualsDefaults } from '../../src/lib/visuals.js';
import { ChatSession } from '../../src/lib/chat/session.js';

if (typeof Element.prototype.animate !== 'function') {
  Element.prototype.animate = vi.fn().mockReturnValue({ onfinish: null, cancel: vi.fn() });
}

function defaultProps() {
  return {
    physicsConfig: getDefaults(4),
    onphysicschange: vi.fn(),
    onphysicsreset: vi.fn(),
    visualsConfig: getVisualsDefaults(),
    onvisualschange: vi.fn(),
    onspritechange: vi.fn(),
    onvisualsreset: vi.fn(),
  };
}

describe('LeftPanelAccordion', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('all three headers render collapsed by default', () => {
    const { getAllByRole } = render(LeftPanelAccordion, {
      props: {
        ...defaultProps(),
        chatAvailable: true,
        chatSession: new ChatSession(),
        onupdate: vi.fn(),
        ontogglechat: vi.fn(),
      },
    });

    const buttons = getAllByRole('button', { expanded: false });
    const toggleButtons = buttons.filter(
      (b) =>
        b.getAttribute('aria-label') === 'Toggle chat planner' ||
        b.getAttribute('aria-label') === 'Toggle physics controls' ||
        b.getAttribute('aria-label') === 'Toggle visual controls',
    );
    expect(toggleButtons).toHaveLength(3);
    for (const btn of toggleButtons) {
      expect(btn.getAttribute('aria-expanded')).toBe('false');
    }
  });

  it('click Physics → Physics expands, others collapsed', async () => {
    const { getByLabelText } = render(LeftPanelAccordion, {
      props: {
        ...defaultProps(),
        chatAvailable: true,
        chatSession: new ChatSession(),
        onupdate: vi.fn(),
        ontogglechat: vi.fn(),
      },
    });

    const physicsToggle = getByLabelText('Toggle physics controls');
    await fireEvent.click(physicsToggle);

    expect(physicsToggle.getAttribute('aria-expanded')).toBe('true');
    expect(getByLabelText('Toggle chat planner').getAttribute('aria-expanded')).toBe('false');
    expect(getByLabelText('Toggle visual controls').getAttribute('aria-expanded')).toBe('false');
  });

  it('click Physics while Physics open → all collapse', async () => {
    const { getByLabelText } = render(LeftPanelAccordion, {
      props: {
        ...defaultProps(),
        chatAvailable: true,
        chatSession: new ChatSession(),
        onupdate: vi.fn(),
        ontogglechat: vi.fn(),
      },
    });

    const physicsToggle = getByLabelText('Toggle physics controls');
    await fireEvent.click(physicsToggle);
    await fireEvent.click(physicsToggle);

    expect(physicsToggle.getAttribute('aria-expanded')).toBe('false');
    expect(getByLabelText('Toggle chat planner').getAttribute('aria-expanded')).toBe('false');
    expect(getByLabelText('Toggle visual controls').getAttribute('aria-expanded')).toBe('false');
  });

  it('click Visuals while Physics open → Physics closes, Visuals opens', async () => {
    const { getByLabelText } = render(LeftPanelAccordion, {
      props: {
        ...defaultProps(),
        chatAvailable: true,
        chatSession: new ChatSession(),
        onupdate: vi.fn(),
        ontogglechat: vi.fn(),
      },
    });

    const physicsToggle = getByLabelText('Toggle physics controls');
    const visualsToggle = getByLabelText('Toggle visual controls');

    await fireEvent.click(physicsToggle);
    await fireEvent.click(visualsToggle);

    expect(physicsToggle.getAttribute('aria-expanded')).toBe('false');
    expect(visualsToggle.getAttribute('aria-expanded')).toBe('true');
  });

  it('chat section hidden when chatAvailable=false', () => {
    const { queryByLabelText, getByLabelText } = render(LeftPanelAccordion, {
      props: defaultProps(),
    });

    expect(queryByLabelText('Toggle chat planner')).toBeNull();
    expect(getByLabelText('Toggle physics controls')).toBeTruthy();
    expect(getByLabelText('Toggle visual controls')).toBeTruthy();
  });

  it('ontogglechat is called when chat header is clicked', async () => {
    const ontogglechat = vi.fn();
    const { getByLabelText } = render(LeftPanelAccordion, {
      props: {
        ...defaultProps(),
        chatAvailable: true,
        chatSession: new ChatSession(),
        onupdate: vi.fn(),
        ontogglechat,
      },
    });

    const chatToggle = getByLabelText('Toggle chat planner');
    await fireEvent.click(chatToggle);

    expect(ontogglechat).toHaveBeenCalledTimes(1);
  });

  it('chat expands when chatOpen prop is true', () => {
    const { getByLabelText } = render(LeftPanelAccordion, {
      props: {
        ...defaultProps(),
        chatAvailable: true,
        chatOpen: true,
        chatSession: new ChatSession(),
        onupdate: vi.fn(),
        ontogglechat: vi.fn(),
      },
    });

    expect(getByLabelText('Toggle chat planner').getAttribute('aria-expanded')).toBe('true');
    expect(getByLabelText('Toggle physics controls').getAttribute('aria-expanded')).toBe('false');
    expect(getByLabelText('Toggle visual controls').getAttribute('aria-expanded')).toBe('false');
  });

  it('clicking Physics while Chat is open fires ontogglechat', async () => {
    const ontogglechat = vi.fn();
    const { getByLabelText } = render(LeftPanelAccordion, {
      props: {
        ...defaultProps(),
        chatAvailable: true,
        chatOpen: true,
        chatSession: new ChatSession(),
        onupdate: vi.fn(),
        ontogglechat,
      },
    });

    const physicsToggle = getByLabelText('Toggle physics controls');
    await fireEvent.click(physicsToggle);

    // Fires callback so parent can close chat
    expect(ontogglechat).toHaveBeenCalledTimes(1);
  });

  it('forwards showStrataLines to PhysicsPanel checkbox', async () => {
    const { getByRole, getByLabelText } = render(LeftPanelAccordion, {
      props: {
        ...defaultProps(),
        showStrataLines: true,
      },
    });
    // Must expand Physics first — collapsed accordion hides body content
    await fireEvent.click(getByLabelText('Toggle physics controls'));
    const checkbox = getByRole('checkbox', { name: /show strata lines/i });
    expect((checkbox as HTMLInputElement).checked).toBe(true);
  });

  it('ontogglestrata callback is forwarded through', async () => {
    const ontogglestrata = vi.fn();
    const { getByRole, getByLabelText } = render(LeftPanelAccordion, {
      props: {
        ...defaultProps(),
        showStrataLines: false,
        ontogglestrata,
      },
    });
    await fireEvent.click(getByLabelText('Toggle physics controls'));
    const checkbox = getByRole('checkbox', { name: /show strata lines/i });
    await fireEvent.change(checkbox);
    expect(ontogglestrata).toHaveBeenCalledWith(true);
  });

  it('container is 340px wide when chat is active', () => {
    const { container } = render(LeftPanelAccordion, {
      props: {
        ...defaultProps(),
        chatAvailable: true,
        chatOpen: true,
        chatSession: new ChatSession(),
        onupdate: vi.fn(),
        ontogglechat: vi.fn(),
      },
    });
    const accordion = container.querySelector('.left-panel-accordion') as HTMLElement;
    expect(accordion.style.width).toBe('340px');
  });

  it('container is 230px wide when physics is active', async () => {
    const { container, getByLabelText } = render(LeftPanelAccordion, {
      props: {
        ...defaultProps(),
        chatAvailable: true,
        chatSession: new ChatSession(),
        onupdate: vi.fn(),
        ontogglechat: vi.fn(),
      },
    });
    await fireEvent.click(getByLabelText('Toggle physics controls'));
    const accordion = container.querySelector('.left-panel-accordion') as HTMLElement;
    expect(accordion.style.width).toBe('230px');
  });
});
