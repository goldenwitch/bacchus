import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import type { Task, VineGraph } from '@bacchus/core';
import Sidebar from '../../src/lib/components/Sidebar.svelte';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'test-task',
    shortName: 'Test Task',
    description: 'A test description for the task.',
    status: 'started',
    dependencies: [],
    decisions: [],
    ...overrides,
  };
}

function makeGraph(tasks: Task[] = []): VineGraph {
  const map = new Map(tasks.map((t) => [t.id, t]));
  return { tasks: map, order: tasks.map((t) => t.id) };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Sidebar', () => {
  it('not rendered when task is null', () => {
    const { container } = render(Sidebar, {
      props: { task: null, graph: makeGraph() },
    });
    expect(container.querySelector('aside')).toBeNull();
  });

  it('renders status pill with emoji and status text', () => {
    const task = makeTask({ status: 'started' });
    const { container } = render(Sidebar, {
      props: { task, graph: makeGraph([task]) },
    });
    const pill = container.querySelector('.status-pill');
    expect(pill).not.toBeNull();
    expect(pill!.textContent).toContain('🔨');
    expect(pill!.textContent).toContain('Started');
  });

  it('status pill has colored background', () => {
    const task = makeTask({ status: 'started' });
    const { container } = render(Sidebar, {
      props: { task, graph: makeGraph([task]) },
    });
    const pill = container.querySelector('.status-pill') as HTMLElement;
    expect(pill).not.toBeNull();
    // jsdom normalises hex to rgb, so accept either form
    const bg = pill.style.background || pill.getAttribute('style') || '';
    expect(bg).toMatch(/facc15|rgb\(250,\s*204,\s*21\)/);
  });

  it('renders shortName as heading', () => {
    const task = makeTask({ shortName: 'My Heading' });
    const { container } = render(Sidebar, {
      props: { task, graph: makeGraph([task]) },
    });
    const heading = container.querySelector('h2');
    expect(heading).not.toBeNull();
    expect(heading!.textContent).toBe('My Heading');
  });

  it('renders description paragraph', () => {
    const task = makeTask({ description: 'Detailed info here.' });
    const { container } = render(Sidebar, {
      props: { task, graph: makeGraph([task]) },
    });
    const desc = container.querySelector('p.description');
    expect(desc).not.toBeNull();
    expect(desc!.textContent).toBe('Detailed info here.');
  });

  it('renders decisions as bullet list', () => {
    const task = makeTask({ decisions: ['Alpha', 'Beta', 'Gamma'] });
    const { container } = render(Sidebar, {
      props: { task, graph: makeGraph([task]) },
    });
    const items = container.querySelectorAll('.decisions ul li');
    expect(items).toHaveLength(3);
    expect(items[0].textContent).toBe('Alpha');
    expect(items[1].textContent).toBe('Beta');
    expect(items[2].textContent).toBe('Gamma');
  });

  it('does not render decisions section when empty', () => {
    const task = makeTask({ decisions: [] });
    const { container } = render(Sidebar, {
      props: { task, graph: makeGraph([task]) },
    });
    expect(container.querySelector('.decisions-label')).toBeNull();
  });

  it('renders id watermark', () => {
    const task = makeTask({ id: 'unique-id-42' });
    const { container } = render(Sidebar, {
      props: { task, graph: makeGraph([task]) },
    });
    const watermark = container.querySelector('.watermark');
    expect(watermark).not.toBeNull();
    expect(watermark!.textContent).toBe('unique-id-42');
  });

  it('click on sidebar does not propagate', async () => {
    const task = makeTask();

    const { container } = render(Sidebar, {
      props: { task, graph: makeGraph([task]) },
    });

    const aside = container.querySelector('aside')!;
    expect(aside).not.toBeNull();

    // Dispatch a real DOM event (bubbles: true) and check that
    // the component's onclick handler calls stopPropagation.
    const event = new MouseEvent('click', { bubbles: true, cancelable: true });
    const stopSpy = vi.spyOn(event, 'stopPropagation');
    aside.dispatchEvent(event);

    expect(stopSpy).toHaveBeenCalled();
  });
});
