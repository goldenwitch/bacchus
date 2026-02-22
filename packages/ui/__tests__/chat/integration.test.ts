/**
 * Integration tests for the ChatOrchestrator + AnthropicChatService.
 *
 * These tests call the **live** Anthropic API and are skipped when the
 * `ANTHROPIC_API_KEY` environment variable is not set.
 *
 * Enable locally:
 *   ./setup.ps1 -Key "sk-ant-..."      (saves key to .env)
 *
 * Enable in CI:
 *   Set the ANTHROPIC_API_KEY repository secret (runs on push-to-main only).
 */

import { describe, it, expect } from 'vitest';
import { parse } from '@bacchus/core';
import { AnthropicChatService } from '../../src/lib/chat/anthropic.js';
import { ChatOrchestrator } from '../../src/lib/chat/orchestrator.js';
import type { OrchestratorEvent } from '../../src/lib/chat/orchestrator.js';
import type { ChatLogger } from '../../src/lib/chat/types.js';

const API_KEY = process.env.ANTHROPIC_API_KEY ?? '';

/** Structured logger that writes to stderr so vitest captures it. */
const testLogger: ChatLogger = {
  log(level, message, data) {
    const timestamp = new Date().toISOString();
    const prefix = `[${timestamp}] [${level.toUpperCase()}]`;
    if (data) {
      console.error(`${prefix} ${message}`, JSON.stringify(data, null, 2));
    } else {
      console.error(`${prefix} ${message}`);
    }
  },
};

/** Collect all events from the orchestrator generator. */
async function collectEvents(
  gen: AsyncGenerator<OrchestratorEvent, void, unknown>,
): Promise<OrchestratorEvent[]> {
  const events: OrchestratorEvent[] = [];
  for await (const event of gen) {
    testLogger.log(
      'info',
      `Event: ${event.type}`,
      'content' in event
        ? {
            content:
              typeof event.content === 'string'
                ? event.content.slice(0, 100)
                : '...',
          }
        : undefined,
    );
    events.push(event);
  }
  return events;
}

describe.skipIf(!API_KEY)('Chat integration (live Anthropic API)', () => {
  const SEED_VINE = `vine 1.1.0
---
[root] Release (notstarted)
Ship the release.
-> build
---
[build] Build Project (started)
Compile the source code.
`;

  it(
    'orchestrator executes a full tool-use loop: prompt → tool calls → graph mutation → done',
    { timeout: 120_000 },
    async () => {
      const service = new AnthropicChatService({
        apiKey: API_KEY,
        model: 'claude-sonnet-4-20250514',
        logger: testLogger,
      });

      const graph = parse(SEED_VINE);
      const orchestrator = new ChatOrchestrator(service, graph, testLogger);

      const events = await collectEvents(
        orchestrator.send(
          'Add a new task called "Deploy" with id "deploy" that depends on "build", and set its status to notstarted. Then mark the "build" task as complete.',
        ),
      );

      // Must contain at least one tool_exec (tool was called)
      const toolExecs = events.filter((e) => e.type === 'tool_exec');
      expect(toolExecs.length).toBeGreaterThanOrEqual(1);

      // Must contain at least one graph_update (graph was mutated)
      const graphUpdates = events.filter((e) => e.type === 'graph_update');
      expect(graphUpdates.length).toBeGreaterThanOrEqual(1);

      // Conversation must end with a done event
      const doneEvents = events.filter((e) => e.type === 'done');
      expect(doneEvents).toHaveLength(1);

      // No error events
      const errorEvents = events.filter((e) => e.type === 'error');
      expect(errorEvents).toHaveLength(0);

      // The final graph should contain the new "deploy" task
      const lastGraphUpdate = graphUpdates[graphUpdates.length - 1]!;
      expect(lastGraphUpdate.type).toBe('graph_update');
      if (lastGraphUpdate.type === 'graph_update') {
        const finalGraph = lastGraphUpdate.graph;
        const taskIds = finalGraph.order.map((id) => id);
        expect(taskIds).toContain('deploy');

        // "deploy" depends on "build"
        const deployTask = finalGraph.tasks.get('deploy');
        expect(deployTask).toBeDefined();
        expect(deployTask!.dependencies).toContain('build');
      }
    },
  );

  it('streams text content from the model', { timeout: 60_000 }, async () => {
    const service = new AnthropicChatService({
      apiKey: API_KEY,
      model: 'claude-sonnet-4-20250514',
      logger: testLogger,
    });

    const orchestrator = new ChatOrchestrator(service, null, testLogger);

    const events = await collectEvents(
      orchestrator.send('Say "hello" and nothing else.'),
    );

    // Should have at least one text event
    const textEvents = events.filter((e) => e.type === 'text');
    expect(textEvents.length).toBeGreaterThanOrEqual(1);

    // Combined text should contain "hello" (case-insensitive)
    const fullText = textEvents
      .map((e) => (e.type === 'text' ? e.content : ''))
      .join('');
    expect(fullText.toLowerCase()).toContain('hello');

    // Must end with done
    expect(events[events.length - 1]!.type).toBe('done');
  });
});
