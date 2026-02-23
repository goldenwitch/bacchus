import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

import {
  VineError,
  VineParseError,
  VineValidationError,
  getTask,
  getDescendants,
  getSummary,
  filterByStatus,
  searchTasks,
  addTask,
  removeTask,
  setStatus,
  updateTask,
  addDependency,
  removeDependency,
  isValidStatus,
  VALID_STATUSES,
  EMPTY_ANNOTATIONS,
} from '@bacchus/core';
import type { Task, Status } from '@bacchus/core';

import { readGraph, writeGraph } from './io.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatTask(task: Task): Record<string, unknown> {
  const base = {
    id: task.id,
    kind: task.kind,
    shortName: task.shortName,
    description: task.description,
    dependencies: [...task.dependencies],
    decisions: [...task.decisions],
  };
  if (task.kind === 'task') {
    return {
      ...base,
      status: task.status,
      attachments: task.attachments.map((a) => ({
        class: a.class,
        mime: a.mime,
        uri: a.uri,
      })),
    };
  }
  return { ...base, vine: task.vine };
}

function formatError(error: unknown, file: string): string {
  if (error instanceof VineParseError) {
    return `Parse error (line ${String(error.line)}): ${error.message}`;
  }
  if (error instanceof VineValidationError) {
    return `Validation error [${error.constraint}]: ${error.message}`;
  }
  if (error instanceof VineError) {
    return error.message;
  }
  if (error instanceof Error && 'code' in error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') return `File not found: ${file}`;
    if (code === 'EACCES') return `Permission denied: ${file}`;
  }
  if (error instanceof Error) return error.message;
  return String(error);
}

function ok(text: string) {
  return { content: [{ type: 'text' as const, text }] };
}

function fail(text: string) {
  return { content: [{ type: 'text' as const, text }], isError: true as const };
}

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

export async function startServer(): Promise<void> {
  const server = new McpServer({ name: '@bacchus/mcp', version: '0.1.0' });

  // ── Read-only tools ─────────────────────────────────────────────────

  server.registerTool(
    'vine_validate',
    {
      description:
        'Parse and validate a .vine file, returning the task count on success.',
      inputSchema: { file: z.string() },
    },
    ({ file }) => {
      try {
        const graph = readGraph(file);
        return ok(`Valid — ${String(graph.tasks.size)} task(s).`);
      } catch (error: unknown) {
        return fail(formatError(error, file));
      }
    },
  );

  server.registerTool(
    'vine_show',
    {
      description:
        'Return a summary of the .vine graph: root, totals, and per-status breakdown.',
      inputSchema: { file: z.string() },
    },
    ({ file }) => {
      try {
        const graph = readGraph(file);
        const summary = getSummary(graph);
        const lines = [
          `Root: ${summary.rootName} (${summary.rootId})`,
          `Total tasks: ${String(summary.total)}`,
          `Leaf tasks: ${String(summary.leafCount)}`,
          '',
          'Status breakdown:',
          ...VALID_STATUSES.map(
            (s) => `  ${s}: ${String(summary.byStatus[s])}`,
          ),
        ];
        return ok(lines.join('\n'));
      } catch (error: unknown) {
        return fail(formatError(error, file));
      }
    },
  );

  server.registerTool(
    'vine_list',
    {
      description:
        'List tasks in a .vine file, optionally filtered by status or a search string.',
      inputSchema: {
        file: z.string(),
        status: z.string().optional(),
        search: z.string().optional(),
      },
    },
    ({ file, status, search }) => {
      try {
        const graph = readGraph(file);
        let tasks: Task[];

        if (status !== undefined) {
          if (!isValidStatus(status)) {
            return fail(
              `Invalid status "${status}". Valid values: ${VALID_STATUSES.join(', ')}`,
            );
          }
          tasks = filterByStatus(graph, status);
        } else if (search !== undefined) {
          tasks = searchTasks(graph, search);
        } else {
          tasks = [...graph.tasks.values()];
        }

        return ok(JSON.stringify(tasks.map(formatTask), null, 2));
      } catch (error: unknown) {
        return fail(formatError(error, file));
      }
    },
  );

  server.registerTool(
    'vine_get_task',
    {
      description: 'Return full details of a single task by its ID.',
      inputSchema: { file: z.string(), id: z.string() },
    },
    ({ file, id }) => {
      try {
        const graph = readGraph(file);
        const task = getTask(graph, id);
        return ok(JSON.stringify(formatTask(task), null, 2));
      } catch (error: unknown) {
        return fail(formatError(error, file));
      }
    },
  );

  server.registerTool(
    'vine_get_descendants',
    {
      description:
        'Return IDs and names of all tasks that transitively depend on the given task.',
      inputSchema: { file: z.string(), id: z.string() },
    },
    ({ file, id }) => {
      try {
        const graph = readGraph(file);
        const descendants = getDescendants(graph, id);
        const result = descendants.map((t) => ({
          id: t.id,
          shortName: t.shortName,
        }));
        return ok(JSON.stringify(result, null, 2));
      } catch (error: unknown) {
        return fail(formatError(error, file));
      }
    },
  );

  server.registerTool(
    'vine_search',
    {
      description:
        'Case-insensitive text search across task names and descriptions.',
      inputSchema: { file: z.string(), query: z.string() },
    },
    ({ file, query }) => {
      try {
        const graph = readGraph(file);
        const results = searchTasks(graph, query);
        return ok(JSON.stringify(results.map(formatTask), null, 2));
      } catch (error: unknown) {
        return fail(formatError(error, file));
      }
    },
  );

  // ── Mutation tools ──────────────────────────────────────────────────

  server.registerTool(
    'vine_add_task',
    {
      description:
        'Add a new task to the .vine graph and write the file back to disk.',
      inputSchema: {
        file: z.string(),
        id: z.string(),
        name: z.string(),
        status: z.string().optional(),
        description: z.string().optional(),
        dependsOn: z.array(z.string()).optional(),
      },
    },
    ({ file, id, name, status, description, dependsOn }) => {
      try {
        const statusValue: Status =
          status !== undefined
            ? isValidStatus(status)
              ? status
              : (() => {
                  throw new VineError(
                    `Invalid status "${status}". Valid values: ${VALID_STATUSES.join(', ')}`,
                  );
                })()
            : 'notstarted';

        let graph = readGraph(file);
        graph = addTask(graph, {
          kind: 'task',
          id,
          shortName: name,
          description: description ?? '',
          status: statusValue,
          dependencies: dependsOn ?? [],
          decisions: [],
          attachments: [],
          annotations: EMPTY_ANNOTATIONS,
        });
        writeGraph(file, graph);
        return ok(`Task "${id}" added.`);
      } catch (error: unknown) {
        return fail(formatError(error, file));
      }
    },
  );

  server.registerTool(
    'vine_remove_task',
    {
      description:
        'Remove a task from the .vine graph and write the file back to disk.',
      inputSchema: { file: z.string(), id: z.string() },
    },
    ({ file, id }) => {
      try {
        let graph = readGraph(file);
        graph = removeTask(graph, id);
        writeGraph(file, graph);
        return ok(`Task "${id}" removed.`);
      } catch (error: unknown) {
        return fail(formatError(error, file));
      }
    },
  );

  server.registerTool(
    'vine_set_status',
    {
      description:
        'Update the status of a task and write the file back to disk.',
      inputSchema: { file: z.string(), id: z.string(), status: z.string() },
    },
    ({ file, id, status }) => {
      try {
        if (!isValidStatus(status)) {
          return fail(
            `Invalid status "${status}". Valid values: ${VALID_STATUSES.join(', ')}`,
          );
        }
        let graph = readGraph(file);
        graph = setStatus(graph, id, status);
        writeGraph(file, graph);
        return ok(`Task "${id}" status set to "${status}".`);
      } catch (error: unknown) {
        return fail(formatError(error, file));
      }
    },
  );

  server.registerTool(
    'vine_update_task',
    {
      description:
        'Update task metadata (name, description, decisions) and write back to disk.',
      inputSchema: {
        file: z.string(),
        id: z.string(),
        name: z.string().optional(),
        description: z.string().optional(),
        decisions: z.array(z.string()).optional(),
      },
    },
    ({ file, id, name, description, decisions }) => {
      try {
        const fields: Partial<
          Pick<Task, 'shortName' | 'description' | 'decisions'>
        > = {
          ...(name !== undefined ? { shortName: name } : undefined),
          ...(description !== undefined ? { description } : undefined),
          ...(decisions !== undefined ? { decisions } : undefined),
        };

        let graph = readGraph(file);
        graph = updateTask(graph, id, fields);
        writeGraph(file, graph);
        return ok(`Task "${id}" updated.`);
      } catch (error: unknown) {
        return fail(formatError(error, file));
      }
    },
  );

  server.registerTool(
    'vine_add_dependency',
    {
      description:
        'Add a dependency edge between two tasks and write the file back to disk.',
      inputSchema: { file: z.string(), taskId: z.string(), depId: z.string() },
    },
    ({ file, taskId, depId }) => {
      try {
        let graph = readGraph(file);
        graph = addDependency(graph, taskId, depId);
        writeGraph(file, graph);
        return ok(`Dependency added: "${taskId}" now depends on "${depId}".`);
      } catch (error: unknown) {
        return fail(formatError(error, file));
      }
    },
  );

  server.registerTool(
    'vine_remove_dependency',
    {
      description:
        'Remove a dependency edge between two tasks and write the file back to disk.',
      inputSchema: {
        file: z.string(),
        taskId: z.string(),
        depId: z.string(),
      },
    },
    ({ file, taskId, depId }) => {
      try {
        let graph = readGraph(file);
        graph = removeDependency(graph, taskId, depId);
        writeGraph(file, graph);
        return ok(
          `Dependency removed: "${taskId}" no longer depends on "${depId}".`,
        );
      } catch (error: unknown) {
        return fail(formatError(error, file));
      }
    },
  );

  // ── Start ───────────────────────────────────────────────────────────

  const transport = new StdioServerTransport();
  await server.connect(transport);
}
