# Chat Planner

The Chat Planner is an AI-powered conversational interface for creating and editing VINE task graphs. It lives in the `@bacchus/ui` package as a toggleable left-side panel.

## Architecture

```
┌─────────────┐     ┌──────────────────┐     ┌────────────────┐
│  ChatPanel   │────▶│  ChatOrchestrator │────▶│  ChatService   │
│  (Svelte)    │◀────│  (tool-use loop)  │◀────│  (Anthropic)   │
└─────────────┘     └──────────────────┘     └────────────────┘
       │                     │
       │ onupdate            │ executeToolCall
       ▼                     ▼
┌─────────────┐     ┌────────────────┐
│  App.svelte  │     │  @bacchus/core  │
│  (vineGraph)│     │  (mutations)   │
└─────────────┘     └────────────────┘
```

### Components

| Module | Path | Role |
| --- | --- | --- |
| `ChatService` | `src/lib/chat/types.ts` | Provider-agnostic interface for LLM communication |
| `AnthropicChatService` | `src/lib/chat/anthropic.ts` | Anthropic Messages API implementation with SSE streaming |
| `GRAPH_TOOLS` | `src/lib/chat/tools.ts` | Tool definitions mapping `@bacchus/core` mutations to LLM tool schemas |
| `executeToolCall` | `src/lib/chat/tools.ts` | Dispatches tool calls to core mutation functions |
| `ChatOrchestrator` | `src/lib/chat/orchestrator.ts` | Manages the agentic conversation loop (send → tool calls → results → repeat) |
| `ChatPanel` | `src/lib/components/ChatPanel.svelte` | Svelte UI component — messages, input, API key entry |
| API key utils | `src/lib/chat/apikey.ts` | localStorage-backed key management |

## Tool-Use Strategy

The LLM interacts with the graph through structured tool calls rather than generating raw VINE text. Each tool maps to a validated `@bacchus/core` mutation function:

| Tool | Core Function | Description |
| --- | --- | --- |
| `get_graph` | `serialize()` | Returns current graph as VINE text |
| `add_task` | `addTask()` | Add a new task |
| `remove_task` | `removeTask()` | Remove a task (not root) |
| `set_status` | `setStatus()` | Change task status |
| `update_task` | `updateTask()` | Update name/description/decisions |
| `add_dependency` | `addDependency()` | Add a dependency edge |
| `remove_dependency` | `removeDependency()` | Remove a dependency edge |
| `replace_graph` | `parse()` | Replace entire graph with VINE text |

Every mutation is validated before returning — cycles, missing references, and structural violations are caught and returned as error strings so the LLM can self-correct.

## ChatService Interface

The `ChatService` interface abstracts away the LLM provider:

```typescript
interface ChatService {
  sendMessage(
    messages: readonly ChatMessage[],
    tools: readonly ToolDefinition[],
    systemPrompt: string,
  ): AsyncGenerator<ChatEvent, void, unknown>;
}
```

To swap providers, implement this interface for the new API. The `AnthropicChatService` implementation handles:
- Message format mapping (ChatMessage → Anthropic format)
- Tool definition mapping (ToolDefinition → Anthropic tool schema)
- SSE stream parsing (content_block_start/delta/stop events)
- Tool-use content blocks (tool_use / tool_result)

## API Key Management

The Anthropic API key is stored in `localStorage` under the key `bacchus:anthropic-key`. The `ChatPanel` component prompts for the key on first open. Key management functions:

```typescript
getApiKey(): string | null   // Read stored key
setApiKey(key: string): void // Store key
clearApiKey(): void          // Remove key
```

The key is sent directly to the Anthropic API from the browser using the `anthropic-dangerous-direct-browser-access` header. No backend proxy is required.

## Orchestrator Loop

The `ChatOrchestrator` manages the agentic conversation:

1. User sends a message
2. Orchestrator builds a system prompt with VINE format spec + current graph state
3. Calls `ChatService.sendMessage()` with conversation history and tools
4. If the LLM returns tool calls:
   - Executes each via `executeToolCall()`
   - Emits `graph_update` events for UI updates
   - Appends tool results to conversation history
   - Loops back to step 3
5. If the LLM returns text only → emits text events and `done`
6. Safety limit: max 10 tool-use rounds per user message

## UI Integration

The chat panel integrates with the existing Svelte component hierarchy:

- **GraphView** → passes `graph` and `onupdate` to ChatPanel
- **ChatPanel** → calls `onupdate(newGraph)` when tools modify the graph
- **App.svelte** → receives update, sets `vineGraph = newGraph`
- Svelte reactivity re-derives the D3 simulation from the new graph

The panel is accessible from:
- **Toolbar**: Chat bubble toggle button (in graph view)
- **Landing Screen**: "Plan with AI" button (creates graph from scratch)

## Configuration

| Setting | Default | Location |
| --- | --- | --- |
| Model | `claude-opus-4-6-20250219` | `AnthropicChatService` constructor |
| API URL | `https://api.anthropic.com` | `AnthropicChatService` constructor |
| Max tokens | 4096 | `AnthropicChatService.sendMessage()` |
| Max tool rounds | 10 | `ChatOrchestrator` |
| API key storage | `bacchus:anthropic-key` | localStorage |
