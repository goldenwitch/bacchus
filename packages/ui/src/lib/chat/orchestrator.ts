import type { VineGraph } from '@bacchus/core';
import { serialize, getRoot } from '@bacchus/core';
import type {
  ChatService,
  ChatMessage,
  ToolCall,
  ToolResult,
} from './types.js';
import { GRAPH_TOOLS, executeToolCall } from './tools.js';
import { buildToolFeedback, type ToolFeedbackDetail } from './toolFeedback.js';

// ---------------------------------------------------------------------------
// Orchestrator events — emitted to the UI
// ---------------------------------------------------------------------------

export type OrchestratorEvent =
  | { readonly type: 'text'; readonly content: string }
  | {
      readonly type: 'tool_exec';
      readonly name: string;
      readonly result: string;
      readonly isError: boolean;
      readonly call: ToolCall;
      readonly detail: ToolFeedbackDetail;
    }
  | { readonly type: 'graph_update'; readonly graph: VineGraph }
  | { readonly type: 'done' }
  | { readonly type: 'error'; readonly message: string };

// ---------------------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------------------

function buildSystemPrompt(graph: VineGraph | null): string {
  const vineSpec = `You are a task planning assistant for Bacchus, a tool that visualizes task graphs in the VINE format.

## VINE Format
Every .vine file starts with a magic line (vine 1.0.0) and a preamble section.
Task blocks are separated by delimiter lines (--- by default):
  [id] Short Name (status)
  Description text
  -> dependency-id
  > Decision note
  @artifact mime/type uri
  @guidance mime/type uri
  @file mime/type uri

Status keywords: complete, started, reviewing, planning, notstarted, blocked
Task ids: alphanumeric and hyphens only, must be unique.
The first task in the file is the root task.
Constraints: no cycles, no islands (every task must connect to root), all dependency refs must exist.
Tasks can have attachments: @artifact (products of work), @guidance (context/constraints), @file (other resources). Use the add_attachment and remove_attachment tools to manage them.

## Your Role
Help users create and modify task graphs through conversation. Use the provided tools to make changes — do NOT output raw VINE text in your messages. Always use tools for modifications.

When creating a new graph from scratch, use the replace_graph tool with valid VINE text.
When modifying an existing graph, prefer granular tools (add_task, remove_task, set_status, etc.) for precision.
Use get_graph to inspect the current state before making changes.

Keep responses concise. After making changes, briefly summarize what you did.`;

  if (graph) {
    const taskCount = String(graph.order.length);
    const rootTask = getRoot(graph);
    const currentGraph = serialize(graph);
    return `${vineSpec}

## Current Graph
The user has a graph loaded with ${taskCount} tasks. Root: "${rootTask.shortName}" (${rootTask.id}).

Current VINE text:
\`\`\`vine
${currentGraph}\`\`\``;
  }

  return `${vineSpec}

## Current Graph
No graph is loaded. If the user wants to create a plan, use the replace_graph tool to create one from scratch.`;
}

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

/** Maximum tool-use loop iterations to prevent runaway agents. */
const MAX_TOOL_ROUNDS = 10;

/**
 * Manages the agentic conversation loop between the user, the LLM,
 * and the graph mutation tools.
 */
export class ChatOrchestrator {
  private readonly service: ChatService;
  private messages: ChatMessage[] = [];
  private graph: VineGraph | null;

  constructor(service: ChatService, graph: VineGraph | null) {
    this.service = service;
    this.graph = graph;
  }

  /**
   * Update the graph reference (e.g. when the user loads a new file externally).
   */
  setGraph(graph: VineGraph | null): void {
    this.graph = graph;
  }

  /**
   * Get the current conversation history.
   */
  getMessages(): readonly ChatMessage[] {
    return this.messages;
  }

  /**
   * Clear conversation history.
   */
  clearHistory(): void {
    this.messages = [];
  }

  /**
   * Restore conversation history (e.g. from a saved session).
   */
  setMessages(messages: ChatMessage[]): void {
    this.messages = messages;
  }

  /**
   * Send a user message and stream orchestrator events.
   *
   * The generator handles the full tool-use loop: it calls the LLM,
   * executes any tool calls, feeds results back, and repeats until
   * the LLM responds with text only.
   */
  async *send(
    userMessage: string,
  ): AsyncGenerator<OrchestratorEvent, void, unknown> {
    // Append user message to history
    this.messages.push({ role: 'user', content: userMessage });

    let rounds = 0;

    while (rounds < MAX_TOOL_ROUNDS) {
      rounds++;

      const systemPrompt = buildSystemPrompt(this.graph);
      let assistantText = '';
      const toolCalls: ToolCall[] = [];
      let stopReason = '';

      try {
        for await (const event of this.service.sendMessage(
          this.messages,
          GRAPH_TOOLS,
          systemPrompt,
        )) {
          switch (event.type) {
            case 'text':
              assistantText += event.content;
              yield { type: 'text', content: event.content };
              break;
            case 'tool_call':
              toolCalls.push(event.call);
              break;
            case 'done':
              stopReason = event.stopReason;
              break;
          }
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        yield { type: 'error', message };
        return;
      }

      // Record the assistant message (with any tool calls)
      const assistantMsg: ChatMessage =
        toolCalls.length > 0
          ? { role: 'assistant', content: assistantText, toolCalls }
          : { role: 'assistant', content: assistantText };
      this.messages.push(assistantMsg);

      // If no tool calls, the conversation turn is complete
      if (toolCalls.length === 0 || stopReason !== 'tool_use') {
        yield { type: 'done' };
        return;
      }

      // Execute tool calls and collect results
      const toolResults: ToolResult[] = [];

      for (const call of toolCalls) {
        // Capture pre-mutation graph for feedback detail
        const preGraph = this.graph;
        const execResult = executeToolCall(this.graph, call);
        const detail = buildToolFeedback(call, preGraph, execResult.result);

        // Update graph if the tool changed it
        if (execResult.graph !== this.graph) {
          this.graph = execResult.graph;
          if (execResult.graph) {
            yield { type: 'graph_update', graph: execResult.graph };
          }
        }

        yield {
          type: 'tool_exec',
          name: call.name,
          result: execResult.result,
          isError: execResult.isError,
          call,
          detail,
        };

        toolResults.push({
          toolCallId: call.id,
          result: execResult.result,
          isError: execResult.isError,
        });
      }

      // Append tool results as a message and loop back to the LLM
      this.messages.push({
        role: 'user',
        content: '',
        toolResults,
      });
    }

    yield {
      type: 'error',
      message:
        'Maximum tool-use rounds exceeded. Please try a simpler request.',
    };
  }
}
