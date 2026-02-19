import type { VineGraph, Task, Status } from '@bacchus/core';
import {
  addTask,
  removeTask,
  setStatus,
  updateTask,
  addDependency,
  removeDependency,
  parse,
  serialize,
  isValidStatus,
  getTask,
} from '@bacchus/core';
import type { ToolCall, ToolDefinition } from './types.js';

// ---------------------------------------------------------------------------
// Tool definitions — JSON schemas for the LLM
// ---------------------------------------------------------------------------

export const GRAPH_TOOLS: readonly ToolDefinition[] = [
  {
    name: 'get_graph',
    description:
      'Get the current task graph as VINE text. Call this before making changes to understand the current state.',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'add_task',
    description:
      'Add a new task to the graph. The task id must be unique (alphanumeric and hyphens). Status defaults to "notstarted". The task is inserted before the root.',
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: 'Unique id for the task (alphanumeric and hyphens only)',
        },
        shortName: {
          type: 'string',
          description: 'Short display name for the task',
        },
        status: {
          type: 'string',
          enum: ['complete', 'notstarted', 'planning', 'blocked', 'started', 'reviewing'],
          description: 'Task status (defaults to "notstarted")',
        },
        description: {
          type: 'string',
          description: 'Description of the task',
        },
        dependencies: {
          type: 'array',
          items: { type: 'string' },
          description: 'Array of task ids this task depends on',
        },
        decisions: {
          type: 'array',
          items: { type: 'string' },
          description: 'Array of decision notes for the task',
        },
      },
      required: ['id', 'shortName'],
    },
  },
  {
    name: 'remove_task',
    description:
      'Remove a task from the graph. Cannot remove the root task. Also cleans up dependency references.',
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: 'The id of the task to remove',
        },
      },
      required: ['id'],
    },
  },
  {
    name: 'set_status',
    description: 'Change the status of an existing task.',
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: 'The id of the task to update',
        },
        status: {
          type: 'string',
          enum: ['complete', 'notstarted', 'planning', 'blocked', 'started', 'reviewing'],
          description: 'The new status',
        },
      },
      required: ['id', 'status'],
    },
  },
  {
    name: 'update_task',
    description:
      'Update metadata on an existing task (name, description, decisions). Does not change id, status, or dependencies.',
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: 'The id of the task to update',
        },
        shortName: {
          type: 'string',
          description: 'New short name',
        },
        description: {
          type: 'string',
          description: 'New description',
        },
        decisions: {
          type: 'array',
          items: { type: 'string' },
          description: 'New decision notes (replaces existing)',
        },
      },
      required: ['id'],
    },
  },
  {
    name: 'add_dependency',
    description:
      'Add a dependency edge. The task (taskId) will depend on the target (dependencyId). Cannot create cycles.',
    inputSchema: {
      type: 'object',
      properties: {
        taskId: {
          type: 'string',
          description: 'The task that gains a new dependency',
        },
        dependencyId: {
          type: 'string',
          description: 'The task being depended on',
        },
      },
      required: ['taskId', 'dependencyId'],
    },
  },
  {
    name: 'remove_dependency',
    description: 'Remove a dependency edge between two tasks.',
    inputSchema: {
      type: 'object',
      properties: {
        taskId: {
          type: 'string',
          description: 'The task that has the dependency',
        },
        dependencyId: {
          type: 'string',
          description: 'The dependency to remove',
        },
      },
      required: ['taskId', 'dependencyId'],
    },
  },
  {
    name: 'replace_graph',
    description:
      'Replace the entire graph with new VINE text. Use this to create a graph from scratch or to make bulk changes. The text must be valid VINE format.',
    inputSchema: {
      type: 'object',
      properties: {
        vineText: {
          type: 'string',
          description: 'Complete VINE-format text for the new graph',
        },
      },
      required: ['vineText'],
    },
  },
  {
    name: 'add_attachment',
    description:
      'Add an attachment to a task. Attachments associate external resources ' +
      '(artifacts, guidance documents, or files) with a task.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        taskId: {
          type: 'string',
          description: 'ID of the task to add the attachment to.',
        },
        attachmentClass: {
          type: 'string',
          enum: ['artifact', 'guidance', 'file'],
          description:
            'Classification: artifact (product of work), guidance (context/constraints), file (other resource).',
        },
        mimeType: {
          type: 'string',
          description: 'MIME type of the attachment (e.g., "application/pdf", "text/html").',
        },
        uri: {
          type: 'string',
          description: 'URI of the attachment resource.',
        },
      },
      required: ['taskId', 'attachmentClass', 'mimeType', 'uri'],
    },
  },
  {
    name: 'remove_attachment',
    description: 'Remove an attachment from a task by its URI.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        taskId: {
          type: 'string',
          description: 'ID of the task to remove the attachment from.',
        },
        uri: {
          type: 'string',
          description: 'URI of the attachment to remove.',
        },
      },
      required: ['taskId', 'uri'],
    },
  },
] as const;

// ---------------------------------------------------------------------------
// Tool execution
// ---------------------------------------------------------------------------

/**
 * Result of executing a tool call.
 */
export interface ToolExecResult {
  readonly graph: VineGraph | null;
  readonly result: string;
  readonly isError: boolean;
}

/**
 * Execute a tool call against the current graph.
 *
 * Returns the (possibly updated) graph and a human-readable result string.
 * If the tool call fails validation, the error is returned as the result
 * so the LLM can self-correct.
 */
export function executeToolCall(
  graph: VineGraph | null,
  call: ToolCall,
): ToolExecResult {
  try {
    switch (call.name) {
      case 'get_graph': {
        if (!graph) {
          return {
            graph,
            result: 'No graph loaded. Use replace_graph to create one.',
            isError: false,
          };
        }
        return { graph, result: serialize(graph), isError: false };
      }

      case 'add_task': {
        if (!graph) {
          return {
            graph,
            result:
              'No graph loaded. Use replace_graph first to create the initial graph.',
            isError: true,
          };
        }
        const input = call.input;
        if (typeof input.id !== 'string' || typeof input.shortName !== 'string') {
          return { graph, result: 'Invalid input: "id" and "shortName" must be strings.', isError: true };
        }
        const task: Task = {
          id: input.id,
          shortName: input.shortName,
          status:
            typeof input.status === 'string'
              ? (input.status as Status)
              : 'notstarted',
          description:
            typeof input.description === 'string' ? input.description : '',
          dependencies: Array.isArray(input.dependencies)
            ? (input.dependencies as string[])
            : [],
          decisions: Array.isArray(input.decisions)
            ? (input.decisions as string[])
            : [],
          attachments: [],
        };
        // Patch root to depend on the new task so it doesn't become an island.
        // addTask inserts before root; we need root -> new-task for connectivity.
        const rootId = graph.order[0];
        const root = graph.tasks.get(rootId);
        if (root && rootId !== task.id) {
          const patchedRoot: Task = {
            ...root,
            dependencies: [...root.dependencies, task.id],
          };
          const patchedTasks = new Map(graph.tasks);
          patchedTasks.set(rootId, patchedRoot);
          const patchedGraph: VineGraph = {
            tasks: patchedTasks,
            order: graph.order,
          };
          const updated = addTask(patchedGraph, task);
          return {
            graph: updated,
            result: `Added task "${task.id}" (${task.shortName})`,
            isError: false,
          };
        }
        const updated = addTask(graph, task);
        return {
          graph: updated,
          result: `Added task "${task.id}" (${task.shortName})`,
          isError: false,
        };
      }

      case 'remove_task': {
        if (!graph) {
          return { graph, result: 'No graph loaded.', isError: true };
        }
        if (typeof call.input.id !== 'string') {
          return { graph, result: 'Invalid input: "id" must be a string.', isError: true };
        }
        const id = call.input.id;
        const updated = removeTask(graph, id);
        return {
          graph: updated,
          result: `Removed task "${id}"`,
          isError: false,
        };
      }

      case 'set_status': {
        if (!graph) {
          return { graph, result: 'No graph loaded.', isError: true };
        }
        if (typeof call.input.id !== 'string') {
          return { graph, result: 'Invalid input: "id" must be a string.', isError: true };
        }
        if (typeof call.input.status !== 'string' || !isValidStatus(call.input.status)) {
          return { graph, result: 'Invalid input: "status" must be a valid status.', isError: true };
        }
        const id = call.input.id;
        const status = call.input.status;
        const updated = setStatus(graph, id, status);
        return {
          graph: updated,
          result: `Set "${id}" status to ${status}`,
          isError: false,
        };
      }

      case 'update_task': {
        if (!graph) {
          return { graph, result: 'No graph loaded.', isError: true };
        }
        if (typeof call.input.id !== 'string') {
          return { graph, result: 'Invalid input: "id" must be a string.', isError: true };
        }
        const id = call.input.id;
        const fields: {
          shortName?: string;
          description?: string;
          decisions?: string[];
        } = {};
        if (typeof call.input.shortName === 'string')
          fields.shortName = call.input.shortName;
        if (typeof call.input.description === 'string')
          fields.description = call.input.description;
        if (Array.isArray(call.input.decisions))
          fields.decisions = call.input.decisions as string[];
        const updated = updateTask(graph, id, fields);
        return {
          graph: updated,
          result: `Updated task "${id}"`,
          isError: false,
        };
      }

      case 'add_dependency': {
        if (!graph) {
          return { graph, result: 'No graph loaded.', isError: true };
        }
        if (typeof call.input.taskId !== 'string' || typeof call.input.dependencyId !== 'string') {
          return { graph, result: 'Invalid input: "taskId" and "dependencyId" must be strings.', isError: true };
        }
        const taskId = call.input.taskId;
        const depId = call.input.dependencyId;
        const updated = addDependency(graph, taskId, depId);
        return {
          graph: updated,
          result: `Added dependency: "${taskId}" -> "${depId}"`,
          isError: false,
        };
      }

      case 'remove_dependency': {
        if (!graph) {
          return { graph, result: 'No graph loaded.', isError: true };
        }
        if (typeof call.input.taskId !== 'string' || typeof call.input.dependencyId !== 'string') {
          return { graph, result: 'Invalid input: "taskId" and "dependencyId" must be strings.', isError: true };
        }
        const taskId = call.input.taskId;
        const depId = call.input.dependencyId;
        const updated = removeDependency(graph, taskId, depId);
        return {
          graph: updated,
          result: `Removed dependency: "${taskId}" -> "${depId}"`,
          isError: false,
        };
      }

      case 'replace_graph': {
        if (typeof call.input.vineText !== 'string') {
          return { graph, result: 'Invalid input: "vineText" must be a string.', isError: true };
        }
        const vineText = call.input.vineText;
        const newGraph = parse(vineText);
        return {
          graph: newGraph,
          result: `Graph replaced (${String(newGraph.order.length)} tasks)`,
          isError: false,
        };
      }

      case 'add_attachment': {
        if (!graph) {
          return { graph, result: 'No graph loaded.', isError: true };
        }
        const { taskId, attachmentClass, mimeType, uri } = call.input as {
          taskId: string;
          attachmentClass: 'artifact' | 'guidance' | 'file';
          mimeType: string;
          uri: string;
        };
        const task = getTask(graph, taskId);
        const newAttachment = { class: attachmentClass, mime: mimeType, uri };
        const existingAttachments = task.attachments;
        if (existingAttachments.some((a) => a.uri === uri)) {
          return { graph, result: `Attachment with URI "${uri}" already exists on task "${taskId}".`, isError: true };
        }
        const updated = updateTask(graph, taskId, {
          attachments: [...existingAttachments, newAttachment],
        });
        return {
          graph: updated,
          result: `Added ${attachmentClass} attachment (${mimeType}) to task "${taskId}": ${uri}`,
          isError: false,
        };
      }
      case 'remove_attachment': {
        if (!graph) {
          return { graph, result: 'No graph loaded.', isError: true };
        }
        const { taskId, uri } = call.input as { taskId: string; uri: string };
        const task = getTask(graph, taskId);
        const existingAttachments = task.attachments;
        const filtered = existingAttachments.filter((a) => a.uri !== uri);
        if (filtered.length === existingAttachments.length) {
          return { graph, result: `No attachment with URI "${uri}" found on task "${taskId}".`, isError: true };
        }
        const updated = updateTask(graph, taskId, { attachments: filtered });
        return {
          graph: updated,
          result: `Removed attachment "${uri}" from task "${taskId}".`,
          isError: false,
        };
      }

      default:
        return { graph, result: `Unknown tool: ${call.name}`, isError: true };
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { graph, result: `Error: ${message}`, isError: true };
  }
}
