import type { VineGraph, Status } from '@bacchus/core';
import type { ToolCall } from './types.js';

// ---------------------------------------------------------------------------
// Structured detail types — one variant per tool
// ---------------------------------------------------------------------------

export type ToolFeedbackDetail =
  | { readonly kind: 'get_graph'; readonly taskCount: number }
  | {
      readonly kind: 'add_task';
      readonly id: string;
      readonly shortName: string;
      readonly status: Status;
      readonly dependencies: readonly string[];
    }
  | { readonly kind: 'remove_task'; readonly id: string }
  | {
      readonly kind: 'set_status';
      readonly id: string;
      readonly oldStatus: Status | null;
      readonly newStatus: Status;
    }
  | {
      readonly kind: 'update_task';
      readonly id: string;
      readonly changedFields: readonly string[];
    }
  | {
      readonly kind: 'add_dependency';
      readonly taskId: string;
      readonly dependencyId: string;
    }
  | {
      readonly kind: 'remove_dependency';
      readonly taskId: string;
      readonly dependencyId: string;
    }
  | {
      readonly kind: 'replace_graph';
      readonly taskCount: number;
    }
  | { readonly kind: 'unknown'; readonly toolName: string };

// ---------------------------------------------------------------------------
// Builder — extract structured detail from tool call + context
// ---------------------------------------------------------------------------

/**
 * Build a {@link ToolFeedbackDetail} from a tool call and the graph state
 * **before** the tool was executed. The `preGraph` is needed to capture
 * "old" values for mutations like `set_status`.
 */
export function buildToolFeedback(
  call: ToolCall,
  preGraph: VineGraph | null,
  resultText: string,
): ToolFeedbackDetail {
  switch (call.name) {
    case 'get_graph':
      return {
        kind: 'get_graph',
        taskCount: preGraph?.order.length ?? 0,
      };

    case 'add_task':
      return {
        kind: 'add_task',
        id: str(call.input.id),
        shortName: str(call.input.shortName),
        status: isValidStatus(call.input.status)
          ? call.input.status
          : 'notstarted',
        dependencies: Array.isArray(call.input.dependencies)
          ? (call.input.dependencies as string[])
          : [],
      };

    case 'remove_task':
      return {
        kind: 'remove_task',
        id: str(call.input.id),
      };

    case 'set_status': {
      const id = str(call.input.id);
      const oldStatus = preGraph?.tasks.get(id)?.status ?? null;
      return {
        kind: 'set_status',
        id,
        oldStatus,
        newStatus: isValidStatus(call.input.status)
          ? call.input.status
          : 'notstarted',
      };
    }

    case 'update_task': {
      const changedFields: string[] = [];
      if (typeof call.input.shortName === 'string') changedFields.push('name');
      if (typeof call.input.description === 'string')
        changedFields.push('description');
      if (Array.isArray(call.input.decisions)) changedFields.push('decisions');
      return {
        kind: 'update_task',
        id: str(call.input.id),
        changedFields,
      };
    }

    case 'add_dependency':
      return {
        kind: 'add_dependency',
        taskId: str(call.input.taskId),
        dependencyId: str(call.input.dependencyId),
      };

    case 'remove_dependency':
      return {
        kind: 'remove_dependency',
        taskId: str(call.input.taskId),
        dependencyId: str(call.input.dependencyId),
      };

    case 'replace_graph': {
      // Parse task count from result text like "Graph replaced (5 tasks)"
      const match = /\((\d+) tasks?\)/.exec(resultText);
      return {
        kind: 'replace_graph',
        taskCount: match ? Number(match[1]) : 0,
      };
    }

    default:
      return { kind: 'unknown', toolName: call.name };
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Safely coerce an unknown value to a string (avoids no-base-to-string). */
function str(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

const VALID_STATUSES: ReadonlySet<string> = new Set([
  'complete',
  'notstarted',
  'planning',
  'blocked',
  'started',
]);

function isValidStatus(value: unknown): value is Status {
  return typeof value === 'string' && VALID_STATUSES.has(value);
}
