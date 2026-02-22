import { describe, it, expect } from 'vitest';
import { parse, serialize } from '@bacchus/core';
import type { VineGraph, ConcreteTask } from '@bacchus/core';
import type { ToolCall } from '../../src/lib/chat/types.js';
import { GRAPH_TOOLS, executeToolCall } from '../../src/lib/chat/tools.js';

const SAMPLE_VINE = `vine 1.0.0
---
[root] Root Task (started)
The root task.
-> leaf
---
[leaf] Leaf Task (complete)
A simple leaf task.
`;

const MULTI_DEP_VINE = `vine 1.0.0
---
[root] Root Task (started)
The root task.
-> mid
-> leaf
---
[mid] Middle (started)
Depends on leaf.
-> leaf
---
[leaf] Leaf (complete)
A leaf task.
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
    expect(names).toContain('add_ref');
    expect(names).toContain('expand_ref');
    expect(names).toContain('add_attachment');
    expect(names).toContain('remove_attachment');
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
          dependencies: ['leaf'],
          decisions: ['Chose A'],
        }),
      );
      expect(result.isError).toBe(false);
      expect(result.graph).not.toBe(graph);
      expect(result.graph?.tasks.has('new-task')).toBe(true);
      expect(result.graph?.tasks.get('new-task')?.shortName).toBe('New Task');
      expect((result.graph?.tasks.get('new-task') as ConcreteTask | undefined)?.status).toBe('planning');
      expect(result.graph?.tasks.get('new-task')?.dependencies).toContain(
        'leaf',
      );
      expect(result.graph?.tasks.get('new-task')?.decisions).toContain(
        'Chose A',
      );
    });

    it('defaults status to notstarted', () => {
      const graph = sampleGraph();
      const result = executeToolCall(
        graph,
        call('add_task', { id: 'default-task', shortName: 'Default' }),
      );
      expect(result.isError).toBe(false);
      expect((result.graph?.tasks.get('default-task') as ConcreteTask | undefined)?.status).toBe(
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

    it('adds a task to an empty graph without root patching', () => {
      const emptyGraph: VineGraph = { tasks: new Map(), order: [], version: '1.0.0', title: undefined, delimiter: '---', prefix: undefined };
      const result = executeToolCall(
        emptyGraph,
        call('add_task', { id: 'solo', shortName: 'Solo Task' }),
      );
      expect(result.isError).toBe(false);
      expect(result.graph?.tasks.has('solo')).toBe(true);
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

    it('returns error when graph is null', () => {
      const result = executeToolCall(null, call('remove_task', { id: 'a' }));
      expect(result.isError).toBe(true);
      expect(result.result).toContain('No graph loaded');
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
      expect((result.graph?.tasks.get('leaf') as ConcreteTask | undefined)?.status).toBe('blocked');
    });

    it('returns error for unknown task', () => {
      const graph = sampleGraph();
      const result = executeToolCall(
        graph,
        call('set_status', { id: 'nonexistent', status: 'blocked' }),
      );
      expect(result.isError).toBe(true);
    });

    it('returns error when graph is null', () => {
      const result = executeToolCall(
        null,
        call('set_status', { id: 'a', status: 'blocked' }),
      );
      expect(result.isError).toBe(true);
      expect(result.result).toContain('No graph loaded');
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

    it('returns error when graph is null', () => {
      const result = executeToolCall(
        null,
        call('update_task', { id: 'a', shortName: 'X' }),
      );
      expect(result.isError).toBe(true);
      expect(result.result).toContain('No graph loaded');
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

    it('returns error when graph is null', () => {
      const result = executeToolCall(
        null,
        call('add_dependency', { taskId: 'a', dependencyId: 'b' }),
      );
      expect(result.isError).toBe(true);
      expect(result.result).toContain('No graph loaded');
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

    it('returns error when graph is null', () => {
      const result = executeToolCall(
        null,
        call('remove_dependency', { taskId: 'a', dependencyId: 'b' }),
      );
      expect(result.isError).toBe(true);
      expect(result.result).toContain('No graph loaded');
    });
  });

  describe('replace_graph', () => {
    it('creates a new graph from VINE text', () => {
      const vineText = `vine 1.0.0
---
[only] Only Task (planning)
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

  describe('add_ref', () => {
    const REF_VINE = `vine 1.1.0
---
[root] Root Task (started)
The root task.
-> leaf
---
[leaf] Leaf Task (complete)
A simple leaf task.
`;

    function refGraph() {
      return parse(REF_VINE);
    }

    it('adds a ref node to the graph', () => {
      const graph = refGraph();
      const result = executeToolCall(
        graph,
        call('add_ref', {
          id: 'child-ref',
          shortName: 'Child Ref',
          uri: './child.vine',
        }),
      );
      expect(result.isError).toBe(false);
      expect(result.graph?.tasks.has('child-ref')).toBe(true);
      const task = result.graph?.tasks.get('child-ref');
      expect(task?.kind).toBe('ref');
      expect(task?.kind === 'ref' && task.vine).toBe('./child.vine');
      expect(result.result).toContain('Added reference');
      // Root should now depend on the ref node
      expect(result.graph?.tasks.get('root')?.dependencies).toContain('child-ref');
    });

    it('returns error when no graph', () => {
      const result = executeToolCall(
        null,
        call('add_ref', {
          id: 'child-ref',
          shortName: 'Child Ref',
          uri: './child.vine',
        }),
      );
      expect(result.isError).toBe(true);
      expect(result.result).toContain('No graph loaded');
    });

    it('returns error for missing required fields', () => {
      const graph = refGraph();
      const result = executeToolCall(
        graph,
        call('add_ref', { id: 'child-ref' }),
      );
      expect(result.isError).toBe(true);
      expect(result.result).toContain('Invalid input');
    });

    it('ref node with optional deps, decisions, and description', () => {
      const graph = refGraph();
      const result = executeToolCall(
        graph,
        call('add_ref', {
          id: 'child-ref',
          shortName: 'Child Ref',
          uri: './child.vine',
          dependencies: ['leaf'],
          decisions: ['Decided to reference'],
          description: 'A reference to child graph.',
        }),
      );
      expect(result.isError).toBe(false);
      const task = result.graph?.tasks.get('child-ref');
      expect(task?.dependencies).toContain('leaf');
      expect(task?.decisions).toContain('Decided to reference');
      expect(task?.description).toBe('A reference to child graph.');
    });
  });

  describe('expand_ref', () => {
    const REF_VINE = `vine 1.1.0
---
[root] Root Task (started)
The root task.
-> child-ref
---
ref [child-ref] Child Ref (./child.vine)
A reference to child graph.
`;

    const CHILD_VINE = `vine 1.1.0
prefix: cr
---
[task-a] Task A (notstarted)
-> task-b
---
[task-b] Task B (planning)
A child task.
`;

    it('expands a ref node with child graph', () => {
      const graph = parse(REF_VINE);
      const result = executeToolCall(
        graph,
        call('expand_ref', {
          refNodeId: 'child-ref',
          childVineText: CHILD_VINE,
        }),
      );
      expect(result.isError).toBe(false);
      expect(result.result).toContain('Expanded reference');
      expect(result.result).toContain('child-ref');
      expect(result.result).toContain('2 tasks inlined');
    });

    it('returns error when no graph', () => {
      const result = executeToolCall(
        null,
        call('expand_ref', {
          refNodeId: 'child-ref',
          childVineText: CHILD_VINE,
        }),
      );
      expect(result.isError).toBe(true);
      expect(result.result).toContain('No graph loaded');
    });

    it('returns error for invalid child vine text', () => {
      const graph = parse(REF_VINE);
      const result = executeToolCall(
        graph,
        call('expand_ref', {
          refNodeId: 'child-ref',
          childVineText: 'not valid vine',
        }),
      );
      expect(result.isError).toBe(true);
      expect(result.result).toContain('Error');
    });

    it('returns error for missing required fields', () => {
      const graph = parse(REF_VINE);
      const result = executeToolCall(
        graph,
        call('expand_ref', { refNodeId: 'child-ref' }),
      );
      expect(result.isError).toBe(true);
      expect(result.result).toContain('Invalid input');
    });
  });

  describe('add_attachment', () => {
    it('adds an attachment to a task', () => {
      const graph = sampleGraph();
      const result = executeToolCall(
        graph,
        call('add_attachment', {
          taskId: 'leaf',
          attachmentClass: 'artifact',
          mimeType: 'text/plain',
          uri: 'https://example.com/doc.txt',
        }),
      );
      expect(result.isError).toBe(false);
      const task = result.graph?.tasks.get('leaf');
      expect(task?.attachments).toHaveLength(1);
      expect(task?.attachments[0].uri).toBe('https://example.com/doc.txt');
      expect(task?.attachments[0].class).toBe('artifact');
      expect(task?.attachments[0].mime).toBe('text/plain');
      expect(result.result).toContain('Added');
      expect(result.result).toContain('artifact');
    });

    it('returns error when no graph', () => {
      const result = executeToolCall(
        null,
        call('add_attachment', {
          taskId: 'leaf',
          attachmentClass: 'artifact',
          mimeType: 'text/plain',
          uri: 'https://example.com/doc.txt',
        }),
      );
      expect(result.isError).toBe(true);
      expect(result.result).toContain('No graph loaded');
    });

    it('returns error for duplicate URI', () => {
      const graph = sampleGraph();
      // First add
      const first = executeToolCall(
        graph,
        call('add_attachment', {
          taskId: 'leaf',
          attachmentClass: 'artifact',
          mimeType: 'text/plain',
          uri: 'https://example.com/doc.txt',
        }),
      );
      expect(first.isError).toBe(false);
      // Second add with same URI
      const result = executeToolCall(
        first.graph,
        call('add_attachment', {
          taskId: 'leaf',
          attachmentClass: 'guidance',
          mimeType: 'text/html',
          uri: 'https://example.com/doc.txt',
        }),
      );
      expect(result.isError).toBe(true);
      expect(result.result).toContain('already exists');
    });
  });

  describe('remove_attachment', () => {
    it('removes an attachment from a task', () => {
      const graph = sampleGraph();
      // Add an attachment first
      const withAttachment = executeToolCall(
        graph,
        call('add_attachment', {
          taskId: 'leaf',
          attachmentClass: 'artifact',
          mimeType: 'text/plain',
          uri: 'https://example.com/doc.txt',
        }),
      );
      expect(withAttachment.isError).toBe(false);
      // Now remove it
      const result = executeToolCall(
        withAttachment.graph,
        call('remove_attachment', {
          taskId: 'leaf',
          uri: 'https://example.com/doc.txt',
        }),
      );
      expect(result.isError).toBe(false);
      expect(result.graph?.tasks.get('leaf')?.attachments).toHaveLength(0);
      expect(result.result).toContain('Removed attachment');
    });

    it('returns error when no graph', () => {
      const result = executeToolCall(
        null,
        call('remove_attachment', {
          taskId: 'leaf',
          uri: 'https://example.com/doc.txt',
        }),
      );
      expect(result.isError).toBe(true);
      expect(result.result).toContain('No graph loaded');
    });

    it('returns error when attachment not found', () => {
      const graph = sampleGraph();
      const result = executeToolCall(
        graph,
        call('remove_attachment', {
          taskId: 'leaf',
          uri: 'https://example.com/nonexistent.txt',
        }),
      );
      expect(result.isError).toBe(true);
      expect(result.result).toContain('No attachment');
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
