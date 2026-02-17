import { describe, it, expect } from 'vitest';
import { parse } from '@bacchus/core';
import { buildToolFeedback } from '../../src/lib/chat/toolFeedback.js';
import type { ToolCall } from '../../src/lib/chat/types.js';

const SAMPLE_VINE = `[leaf] Leaf Task (complete)
A leaf.

[root] Root Task (started)
The root.
-> leaf
`;

function call(name: string, input: Record<string, unknown> = {}): ToolCall {
  return { id: `call-${name}`, name, input };
}

describe('buildToolFeedback', () => {
  it('builds get_graph feedback', () => {
    const graph = parse(SAMPLE_VINE);
    const detail = buildToolFeedback(call('get_graph'), graph, '...');
    expect(detail.kind).toBe('get_graph');
    if (detail.kind === 'get_graph') {
      expect(detail.taskCount).toBe(2);
    }
  });

  it('builds get_graph feedback with null graph', () => {
    const detail = buildToolFeedback(call('get_graph'), null, '...');
    if (detail.kind === 'get_graph') {
      expect(detail.taskCount).toBe(0);
    }
  });

  it('builds add_task feedback', () => {
    const detail = buildToolFeedback(
      call('add_task', {
        id: 'new',
        shortName: 'New Task',
        status: 'planning',
        dependencies: ['leaf'],
      }),
      null,
      'Added task "new"',
    );
    expect(detail.kind).toBe('add_task');
    if (detail.kind === 'add_task') {
      expect(detail.id).toBe('new');
      expect(detail.shortName).toBe('New Task');
      expect(detail.status).toBe('planning');
      expect(detail.dependencies).toEqual(['leaf']);
    }
  });

  it('defaults add_task status to notstarted', () => {
    const detail = buildToolFeedback(
      call('add_task', { id: 'x', shortName: 'X' }),
      null,
      '',
    );
    if (detail.kind === 'add_task') {
      expect(detail.status).toBe('notstarted');
    }
  });

  it('builds remove_task feedback', () => {
    const detail = buildToolFeedback(
      call('remove_task', { id: 'leaf' }),
      null,
      'Removed',
    );
    expect(detail.kind).toBe('remove_task');
    if (detail.kind === 'remove_task') {
      expect(detail.id).toBe('leaf');
    }
  });

  it('builds set_status feedback with old status from pre-graph', () => {
    const graph = parse(SAMPLE_VINE);
    const detail = buildToolFeedback(
      call('set_status', { id: 'leaf', status: 'blocked' }),
      graph,
      'Set "leaf" status to blocked',
    );
    expect(detail.kind).toBe('set_status');
    if (detail.kind === 'set_status') {
      expect(detail.id).toBe('leaf');
      expect(detail.oldStatus).toBe('complete');
      expect(detail.newStatus).toBe('blocked');
    }
  });

  it('builds set_status feedback with null old status when no graph', () => {
    const detail = buildToolFeedback(
      call('set_status', { id: 'leaf', status: 'blocked' }),
      null,
      '',
    );
    if (detail.kind === 'set_status') {
      expect(detail.oldStatus).toBeNull();
    }
  });

  it('builds update_task feedback listing changed fields', () => {
    const detail = buildToolFeedback(
      call('update_task', {
        id: 'leaf',
        shortName: 'New Name',
        description: 'New desc',
      }),
      null,
      'Updated',
    );
    expect(detail.kind).toBe('update_task');
    if (detail.kind === 'update_task') {
      expect(detail.id).toBe('leaf');
      expect(detail.changedFields).toContain('name');
      expect(detail.changedFields).toContain('description');
    }
  });

  it('builds add_dependency feedback', () => {
    const detail = buildToolFeedback(
      call('add_dependency', { taskId: 'root', dependencyId: 'leaf' }),
      null,
      '',
    );
    expect(detail.kind).toBe('add_dependency');
    if (detail.kind === 'add_dependency') {
      expect(detail.taskId).toBe('root');
      expect(detail.dependencyId).toBe('leaf');
    }
  });

  it('builds remove_dependency feedback', () => {
    const detail = buildToolFeedback(
      call('remove_dependency', { taskId: 'root', dependencyId: 'leaf' }),
      null,
      '',
    );
    expect(detail.kind).toBe('remove_dependency');
    if (detail.kind === 'remove_dependency') {
      expect(detail.taskId).toBe('root');
      expect(detail.dependencyId).toBe('leaf');
    }
  });

  it('builds replace_graph feedback parsing task count from result', () => {
    const detail = buildToolFeedback(
      call('replace_graph', { vineText: '...' }),
      null,
      'Graph replaced (5 tasks)',
    );
    expect(detail.kind).toBe('replace_graph');
    if (detail.kind === 'replace_graph') {
      expect(detail.taskCount).toBe(5);
    }
  });

  it('returns unknown for unrecognized tool', () => {
    const detail = buildToolFeedback(call('mystery_tool'), null, 'something');
    expect(detail.kind).toBe('unknown');
    if (detail.kind === 'unknown') {
      expect(detail.toolName).toBe('mystery_tool');
    }
  });
});
