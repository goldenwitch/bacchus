import { describe, it, expect, vi } from 'vitest';
import { parse } from '@bacchus/core';
import type {
  ChatService,
  ChatEvent,
  ChatMessage,
  ToolDefinition,
} from '../../src/lib/chat/types.js';
import { ChatOrchestrator } from '../../src/lib/chat/orchestrator.js';
import type { OrchestratorEvent } from '../../src/lib/chat/orchestrator.js';

const SAMPLE_VINE = `[leaf] Leaf Task (complete)
A leaf.

[root] Root Task (started)
The root.
-> leaf
`;

/**
 * Create a mock ChatService that returns scripted responses.
 */
function mockService(responses: ChatEvent[][]): ChatService {
  let callIndex = 0;
  return {
    async *sendMessage(
      _messages: readonly ChatMessage[],
      _tools: readonly ToolDefinition[],
      _systemPrompt: string,
    ): AsyncGenerator<ChatEvent, void, unknown> {
      const events = responses[callIndex] ?? [];
      callIndex++;
      for (const event of events) {
        yield event;
      }
    },
  };
}

async function collectEvents(
  gen: AsyncGenerator<OrchestratorEvent, void, unknown>,
): Promise<OrchestratorEvent[]> {
  const events: OrchestratorEvent[] = [];
  for await (const event of gen) {
    events.push(event);
  }
  return events;
}

describe('ChatOrchestrator', () => {
  it('sends a message and streams text response', async () => {
    const service = mockService([
      [
        { type: 'text', content: 'Hello! ' },
        { type: 'text', content: 'How can I help?' },
        { type: 'done', stopReason: 'end_turn' },
      ],
    ]);

    const orchestrator = new ChatOrchestrator(service, null);
    const events = await collectEvents(orchestrator.send('Hi'));

    const textEvents = events.filter((e) => e.type === 'text');
    expect(textEvents).toHaveLength(2);
    expect(events.some((e) => e.type === 'done')).toBe(true);
  });

  it('executes tool calls and continues the loop', async () => {
    const graph = parse(SAMPLE_VINE);
    const service = mockService([
      // First LLM call: returns a tool call
      [
        {
          type: 'tool_call',
          call: { id: 'tc1', name: 'get_graph', input: {} },
        },
        { type: 'done', stopReason: 'tool_use' },
      ],
      // Second LLM call (after tool results): returns text
      [
        { type: 'text', content: 'Here is the graph.' },
        { type: 'done', stopReason: 'end_turn' },
      ],
    ]);

    const orchestrator = new ChatOrchestrator(service, graph);
    const events = await collectEvents(orchestrator.send('Show me the graph'));

    expect(events.some((e) => e.type === 'tool_exec')).toBe(true);
    expect(events.some((e) => e.type === 'text')).toBe(true);
    expect(events.some((e) => e.type === 'done')).toBe(true);
  });

  it('emits graph_update when a tool modifies the graph', async () => {
    const graph = parse(SAMPLE_VINE);
    const service = mockService([
      [
        {
          type: 'tool_call',
          call: {
            id: 'tc1',
            name: 'set_status',
            input: { id: 'leaf', status: 'blocked' },
          },
        },
        { type: 'done', stopReason: 'tool_use' },
      ],
      [
        { type: 'text', content: 'Done.' },
        { type: 'done', stopReason: 'end_turn' },
      ],
    ]);

    const orchestrator = new ChatOrchestrator(service, graph);
    const events = await collectEvents(orchestrator.send('Block the leaf'));

    const graphUpdates = events.filter((e) => e.type === 'graph_update');
    expect(graphUpdates).toHaveLength(1);
    if (graphUpdates[0]?.type === 'graph_update') {
      expect(graphUpdates[0].graph.tasks.get('leaf')?.status).toBe('blocked');
    }
  });

  it('maintains conversation history', async () => {
    const service = mockService([
      [
        { type: 'text', content: 'First reply.' },
        { type: 'done', stopReason: 'end_turn' },
      ],
      [
        { type: 'text', content: 'Second reply.' },
        { type: 'done', stopReason: 'end_turn' },
      ],
    ]);

    const orchestrator = new ChatOrchestrator(service, null);
    await collectEvents(orchestrator.send('Hello'));
    await collectEvents(orchestrator.send('Again'));

    const messages = orchestrator.getMessages();
    // user, assistant, user, assistant
    expect(messages).toHaveLength(4);
    expect(messages[0]?.role).toBe('user');
    expect(messages[1]?.role).toBe('assistant');
    expect(messages[2]?.role).toBe('user');
    expect(messages[3]?.role).toBe('assistant');
  });

  it('clears history', async () => {
    const service = mockService([
      [
        { type: 'text', content: 'Ok.' },
        { type: 'done', stopReason: 'end_turn' },
      ],
    ]);

    const orchestrator = new ChatOrchestrator(service, null);
    await collectEvents(orchestrator.send('Hi'));
    expect(orchestrator.getMessages().length).toBeGreaterThan(0);

    orchestrator.clearHistory();
    expect(orchestrator.getMessages()).toHaveLength(0);
  });

  it('emits error on service failure', async () => {
    const service: ChatService = {
      // eslint-disable-next-line require-yield
      async *sendMessage(): AsyncGenerator<ChatEvent, void, unknown> {
        throw new Error('Network failure');
      },
    };

    const orchestrator = new ChatOrchestrator(service, null);
    const events = await collectEvents(orchestrator.send('Hi'));

    const errors = events.filter((e) => e.type === 'error');
    expect(errors).toHaveLength(1);
    if (errors[0]?.type === 'error') {
      expect(errors[0].message).toContain('Network failure');
    }
  });
});
