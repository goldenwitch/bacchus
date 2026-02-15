import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/svelte';
import { tick } from 'svelte';
import type { Task } from '@bacchus/core';
import Tooltip from '../../src/lib/components/Tooltip.svelte';

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'test-task',
    shortName: 'Test Task',
    description: 'A test task description',
    status: 'started',
    dependencies: [],
    decisions: [],
    ...overrides,
  };
}

describe('Tooltip', () => {
  afterEach(() => {
    cleanup();
  });

  it('not rendered when task is null', async () => {
    render(Tooltip, { props: { task: null, x: 0, y: 0 } });
    await tick();
    expect(document.querySelector('.tooltip')).not.toBeInTheDocument();
  });

  it('renders status emoji and capitalized label', async () => {
    render(Tooltip, { props: { task: makeTask(), x: 100, y: 200 } });
    await tick();
    const tooltip = document.querySelector('.tooltip')!;
    expect(tooltip).toBeInTheDocument();
    const statusLine = tooltip.querySelector('.status-line')!;
    expect(statusLine).toHaveTextContent('🔨 Started');
  });

  it('renders full description text (CSS handles truncation)', async () => {
    const longDesc = 'A'.repeat(100);
    render(Tooltip, {
      props: { task: makeTask({ description: longDesc }), x: 0, y: 0 },
    });
    await tick();
    const descLine = document.querySelector('.desc-line')!;
    expect(descLine.textContent).toBe(longDesc);
  });

  it('does not truncate description ≤80 characters', async () => {
    const shortDesc = 'Short description';
    render(Tooltip, {
      props: { task: makeTask({ description: shortDesc }), x: 0, y: 0 },
    });
    await tick();
    const descLine = document.querySelector('.desc-line')!;
    expect(descLine.textContent).toBe(shortDesc);
  });

  it('positioned at mouse x+12, y+12', async () => {
    render(Tooltip, { props: { task: makeTask(), x: 50, y: 75 } });
    await tick();
    const tooltip = document.querySelector('.tooltip') as HTMLElement;
    expect(tooltip.style.left).toBe('62px');
    expect(tooltip.style.top).toBe('87px');
  });

  it('shows correct info for each status', async () => {
    const statusExpected: Array<{ status: Task['status']; emoji: string; label: string }> = [
      { status: 'complete', emoji: '🌿', label: 'Complete' },
      { status: 'started', emoji: '🔨', label: 'Started' },
      { status: 'notstarted', emoji: '📋', label: 'Not Started' },
      { status: 'planning', emoji: '💭', label: 'Planning' },
      { status: 'blocked', emoji: '🚧', label: 'Blocked' },
    ];

    for (const { status, emoji, label } of statusExpected) {
      const { unmount } = render(Tooltip, {
        props: { task: makeTask({ status }), x: 0, y: 0 },
      });
      await tick();
      const statusLine = document.querySelector('.status-line')!;
      expect(statusLine.textContent).toContain(`${emoji} ${label}`);
      unmount();
    }
  });
});
