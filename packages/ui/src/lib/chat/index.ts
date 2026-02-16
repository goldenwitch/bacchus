// @bacchus/ui chat module — LLM-powered graph planning

// Types
export type {
  ChatRole,
  ChatMessage,
  ChatEvent,
  ChatService,
  ToolCall,
  ToolResult,
  ToolDefinition,
} from './types.js';

// Anthropic provider
export { AnthropicChatService } from './anthropic.js';

// Graph tools
export { GRAPH_TOOLS, executeToolCall } from './tools.js';
export type { ToolExecResult } from './tools.js';

// Orchestrator
export { ChatOrchestrator } from './orchestrator.js';
export type { OrchestratorEvent } from './orchestrator.js';

// API key management
export { getApiKey, setApiKey, clearApiKey } from './apikey.js';
