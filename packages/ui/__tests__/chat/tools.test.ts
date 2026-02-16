import { describe, it, expect } from 'vitest';
import { parse, serialize } from '@bacchus/core';
import type { ToolCall } from '../../src/lib/chat/types.js';
import { GRAPH_TOOLS, executeToolCall } from '../../src/lib/chat/tools.js';

const SAMPLE_VINE = `[leaf] Leaf Task (complete)
A simple leaf task.

[root] Root Task (started)
The root task.
-> leaf
`;

const MULTI_DEP_VINE = `[leaf] Leaf (complete)
A leaf task.

[mid] Middle (started)
Depends on leaf.
-> leaf

[root] Root Task (started)
The root task.
-> mid
-> leaf
`;

function sampleGraph() {
  return parse(SAMPLE_VINE);
}

function call(name: string, input: Record<string, unknown> = {}): ToolCall {
  return { id: `call-${name}`, name, input };
}

describe('GRAPH_TOOLS', () => {
  it('defines the expected set of tools', () => {
    const names = GRAPH_TOOLS.map((t) => t.name);
    expect(names).toContain('get_graph');
    expect(names).toContain('add_task');
    expect(names).toContain('remove_task');
    expect(names).toContain('set_status');
    expect(names).toContain('update_task');
    expect(names).toContain('add_dependency');
    expect(names).toContain('remove_dependency');
    expect(names).toContain('replace_graph');
  });

  it('each tool has name, description, and inputSchema', () => {
    for (const tool of GRAPH_TOOLS) {
      expect(tool.name).toBeTruthy();
      expect(tool.description).toBeTruthy();
      expect(tool.inputSchema).toBeDefined();
      expect(tool.inputSchema.type).toBe('object');
    }
  });
});

describe('executeToolCall', () => {
  describe('get_graph', () => {
    it('returns serialized graph', () => {
      const graph = sampleGraph();
      const result = executeToolCall(graph, call('get_graph'));
      expect(result.isError).toBe(false);
      expect(result.graph).toBe(graph);
      expect(result.result).toBe(serialize(graph));
    });

    it('returns message when no graph is loaded', () => {
      const result = executeToolCall(null, call('get_graph'));
      expect(result.isError).toBe(false);
      expect(result.result).toContain('No graph loaded');
    });
  });

  describe('add_task', () => {
    it('adds a task to the graph', () => {
      const graph = sampleGraph();
      const result = executeToolCall(
        graph,
        call('add_task', {
          id: 'new-task',
          shortName: 'New Task',
          status: 'planning',
        }),
      );
      expect(result.isError).toBe(false);
      expect(result.graph).not.toBe(graph);
      expect(result.graph?.tasks.has('new-task')).toBe(true);
      expect(result.graph?.tasks.get('new-task')?.shortName).toBe('New Task');
      expect(result.graph?.tasks.get('new-task')?.status).toBe('planning');
    });

    it('defaults status to notstarted', () => {
      const graph = sampleGraph();
      const result = executeToolCall(
        graph,
        call('add_task', { id: 'default-task', shortName: 'Default' }),
      );
      expect(result.isError).toBe(false);
      expect(result.graph?.tasks.get('default-task')?.status).toBe(
        'notstarted',
      );
    });

    it('returns error for duplicate id', () => {
      const graph = sampleGraph();
      const result = executeToolCall(
        graph,
        call('add_task', { id: 'leaf', shortName: 'Duplicate' }),
      );
      expect(result.isError).toBe(true);
      expect(result.result).toContain('Error');
    });

    it('returns error when no graph is loaded', () => {
      const result = executeToolCall(
        null,
        call('add_task', { id: 'task', shortName: 'Task' }),
      );
      expect(result.isError).toBe(true);
      expect(result.result).toContain('No graph loaded');
    });
  });

  describe('remove_task', () => {
    it('removes a task', () => {
      const graph = sampleGraph();
      const result = executeToolCall(
        graph,
        call('remove_task', { id: 'leaf' }),
      );
      expect(result.isError).toBe(false);
      expect(result.graph?.tasks.has('leaf')).toBe(false);
    });

    it('returns error for root removal', () => {
      const graph = sampleGraph();
      const result = executeToolCall(
        graph,
        call('remove_task', { id: 'root' }),
      );
      expect(result.isError).toBe(true);
      expect(result.result).toContain('Error');
    });
  });

  describe('set_status', () => {
    it('changes task status', () => {
      const graph = sampleGraph();
      const result = executeToolCall(
        graph,
        call('set_status', { id: 'leaf', status: 'blocked' }),
      );
      expect(result.isError).toBe(false);
      expect(result.graph?.tasks.get('leaf')?.status).toBe('blocked');
    });

    it('returns error for unknown task', () => {
      const graph = sampleGraph();
      const result = executeToolCall(
        graph,
        call('set_status', { id: 'nonexistent', status: 'blocked' }),
      );
      expect(result.isError).toBe(true);
    });
  });

  describe('update_task', () => {
    it('updates task metadata', () => {
      const graph = sampleGraph();
      const result = executeToolCall(
        graph,
        call('update_task', {
          id: 'leaf',
          shortName: 'Updated Leaf',
          description: 'New description',
          decisions: ['Decided something'],
        }),
      );
      expect(result.isError).toBe(false);
      const task = result.graph?.tasks.get('leaf');
      expect(task?.shortName).toBe('Updated Leaf');
      expect(task?.description).toBe('New description');
      expect(task?.decisions).toEqual(['Decided something']);
    });
  });

  describe('add_dependency', () => {
    it('adds a dependency edge', () => {
      // Add a third task first, then add a dependency from it to leaf
      const graph = sampleGraph();
      const withTask = executeToolCall(
        graph,
        call('add_task', { id: 'mid', shortName: 'Middle' }),
      );
      const result = executeToolCall(
        withTask.graph,
        call('add_dependency', { taskId: 'mid', dependencyId: 'leaf' }),
      );
      expect(result.isError).toBe(false);
      expect(result.graph?.tasks.get('mid')?.dependencies).toContain('leaf');
    });

    it('returns error for cycle', () => {
      const graph = sampleGraph();
      // leaf -> root would create a cycle since root -> leaf
      const result = executeToolCall(
        graph,
        call('add_dependency', { taskId: 'leaf', dependencyId: 'root' }),
      );
      expect(result.isError).toBe(true);
      expect(result.result).toContain('Error');
    });
  });

  describe('remove_dependency', () => {
    it('removes a dependency edge', () => {
      // Use a graph where leaf is reachable via root -> mid -> leaf,
      // so removing root -> leaf doesn't create an island
      const graph = parse(MULTI_DEP_VINE);
      const result = executeToolCall(
        graph,
        call('remove_dependency', { taskId: 'root', dependencyId: 'leaf' }),
      );
      expect(result.isError).toBe(false);
      expect(result.graph?.tasks.get('root')?.dependencies).not.toContain(
        'leaf',
      );
      expect(result.graph?.tasks.get('root')?.dependencies).toContain('mid');
    });

    it('returns error for nonexistent edge', () => {
      const graph = sampleGraph();
      const result = executeToolCall(
        graph,
        call('remove_dependency', { taskId: 'leaf', dependencyId: 'root' }),
      );
      expect(result.isError).toBe(true);
    });
  });

  describe('replace_graph', () => {
    it('creates a new graph from VINE text', () => {
      const vineText = `[only] Only Task (planning)
Just one task.
`;
      const result = executeToolCall(null, call('replace_graph', { vineText }));
      expect(result.isError).toBe(false);
      expect(result.graph?.order).toHaveLength(1);
      expect(result.graph?.tasks.get('only')?.shortName).toBe('Only Task');
    });

    it('returns error for invalid VINE text', () => {
      const result = executeToolCall(
        null,
        call('replace_graph', { vineText: 'not valid vine' }),
      );
      expect(result.isError).toBe(true);
      expect(result.result).toContain('Error');
    });
  });

  describe('unknown tool', () => {
    it('returns error for unknown tool name', () => {
      const graph = sampleGraph();
      const result = executeToolCall(graph, call('nonexistent_tool'));
      expect(result.isError).toBe(true);
      expect(result.result).toContain('Unknown tool');
    });
  });
});
