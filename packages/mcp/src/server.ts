import { fileURLToPath } from 'node:url';
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
  getActionableTasks,
  filterByStatus,
  searchTasks,
  addTask,
  removeTask,
  setStatus,
  updateTask,
  addDependency,
  removeDependency,
  addRef,
  updateRefUri,
  getRefs,
  expandVineRef,
  parse,
  isValidStatus,
  VALID_STATUSES,
  EMPTY_ANNOTATIONS,
} from '@bacchus/core';
import type { Task, RefTask, Status } from '@bacchus/core';

import {
  readGraph,
  writeGraph,
  readFileContent,
  resolvePath,
  setRoots,
  getRoots,
} from './io.js';

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
    const resolved = resolvePath(file);
    const extra = resolved !== file ? ` (resolved to ${resolved})` : '';
    if (code === 'ENOENT') return `File not found: ${file}${extra}`;
    if (code === 'EACCES') return `Permission denied: ${file}${extra}`;
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
// MCP roots discovery
// ---------------------------------------------------------------------------

let rootsFetched = false;

/**
 * Lazy-fetch the client's workspace roots (if the client advertises the
 * `roots` capability).  Called once on the first tool invocation so the
 * path resolver can probe additional directories for relative paths.
 */
async function fetchRoots(server: McpServer): Promise<void> {
  if (rootsFetched) return;
  rootsFetched = true;
  try {
    const capabilities = server.server.getClientCapabilities();
    if (capabilities?.roots) {
      const result = await server.server.listRoots();
      const dirs = result.roots
        .map((r: { uri: string }) => r.uri)
        .filter((u: string) => u.startsWith('file://'))
        .map((u: string) => fileURLToPath(u));
      if (dirs.length > 0 && getRoots().length === 0) {
        setRoots(dirs);
      }
    }
  } catch {
    // Client may not support roots — fall back to cwd / --cwd.
  }
}

/** @internal Reset the roots-fetched flag (for tests). */
export function _resetRootsFetched(): void {
  rootsFetched = false;
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
        'Parse and validate a .vine file, returning the task count on success. Use this FIRST when opening an unfamiliar file to confirm it is well-formed, or after a series of mutations to verify the graph is still structurally valid (no cycles, dangling refs, or duplicate IDs).',
      inputSchema: { file: z.string() },
    },
    async ({ file }) => {
      await fetchRoots(server);
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
        'Return a high-level summary of the .vine graph: root task, total/leaf counts, and per-status breakdown. Use this to orient yourself at the start of a conversation — it tells you what the graph is about and how work is distributed across statuses without listing every task.',
      inputSchema: { file: z.string() },
    },
    async ({ file }) => {
      await fetchRoots(server);
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
        'List tasks in a .vine file, optionally filtered by status or a search string. Use this when the user asks for an overview of tasks, wants to see what is blocked/started/complete, or needs to browse tasks matching a keyword. Prefer vine_show for a quick summary and vine_get_task for deep detail on a single task.',
      inputSchema: {
        file: z.string(),
        status: z.string().optional(),
        search: z.string().optional(),
      },
    },
    async ({ file, status, search }) => {
      await fetchRoots(server);
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
      description:
        'Return full details of a single task by its ID, including description, status, dependencies, decisions, and attachments. Use this when the user asks about a specific task or when you need complete context before proposing a mutation. Requires you to already know the task ID (use vine_list or vine_search to discover IDs).',
      inputSchema: { file: z.string(), id: z.string() },
    },
    async ({ file, id }) => {
      await fetchRoots(server);
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
        'Return IDs and names of all tasks that transitively depend on the given task (its full downstream subtree). Use this to assess the blast radius of a change — e.g., "if this task slips, what else is affected?" Also useful for scoping work: "show me everything under the backend milestone."',
      inputSchema: { file: z.string(), id: z.string() },
    },
    async ({ file, id }) => {
      await fetchRoots(server);
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
        'Case-insensitive text search across task names and descriptions. Use this when the user refers to a task by keyword or concept rather than by exact ID — e.g., "find tasks related to authentication." Returns matching tasks with full detail, so it doubles as a filtered vine_list.',
      inputSchema: { file: z.string(), query: z.string() },
    },
    async ({ file, query }) => {
      await fetchRoots(server);
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
    'vine_next_tasks',
    {
      description:
        'Analyse the current execution state of a .vine graph and return the frontier of actionable work. Returns three lists: (1) ready_to_start — tasks whose dependencies are all satisfied and whose status is notstarted or planning, ready to be picked up; (2) ready_to_complete — tasks in reviewing status where at least one dependant has started consuming their output, safe to mark complete; (3) needs_expansion — ref nodes on the frontier that must be expanded (via vine_expand_ref) before their inner tasks become visible. Also returns a progress snapshot (total, complete, percentage, root status, per-status breakdown). Call this tool in a loop: act on the results using mutation tools (vine_set_status, vine_update_task, vine_expand_ref), then call vine_next_tasks again to get the next frontier. The loop terminates when the root task is complete.',
      inputSchema: { file: z.string() },
    },
    async ({ file }) => {
      await fetchRoots(server);
      try {
        const graph = readGraph(file);
        const { ready, completable, expandable, progress } =
          getActionableTasks(graph);

        const result = {
          ready_to_start: ready.map(formatTask),
          ready_to_complete: completable.map(formatTask),
          needs_expansion: expandable.map((r) => ({
            id: r.id,
            shortName: r.shortName,
            vine: r.vine,
            dependencies: [...r.dependencies],
          })),
          progress: {
            total: progress.total,
            complete: progress.complete,
            percentage: progress.percentage,
            root_id: progress.rootId,
            root_status: progress.rootStatus,
            by_status: progress.byStatus,
          },
        };

        return ok(JSON.stringify(result, null, 2));
      } catch (error: unknown) {
        return fail(formatError(error, file));
      }
    },
  );

  // ── Write tools ─────────────────────────────────────────────────────

  server.registerTool(
    'vine_add_task',
    {
      description:
        'Add a new task to the .vine graph and write the file back to disk. Use this when the user wants to create a new work item. Requires a unique ID and name; status defaults to notstarted. Optionally wire dependencies at creation time via dependsOn. The file is validated and saved automatically.',
      inputSchema: {
        file: z.string(),
        id: z.string(),
        name: z.string(),
        status: z.string().optional(),
        description: z.string().optional(),
        dependsOn: z.array(z.string()).optional(),
      },
    },
    async ({ file, id, name, status, description, dependsOn }) => {
      await fetchRoots(server);
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
        'Remove a task and all references to it from the .vine graph, then write back to disk. Use this when a task is cancelled, out of scope, or was added by mistake. Any other task that depended on the removed task will have that dependency edge dropped — check downstream impact with vine_get_descendants first.',
      inputSchema: { file: z.string(), id: z.string() },
    },
    async ({ file, id }) => {
      await fetchRoots(server);
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
        'Update the status of a task and write the file back to disk. Use this when the user reports progress — e.g., "I finished X" (→ complete), "X is stuck" (→ blocked), "start working on X" (→ started). Valid statuses: complete, started, reviewing, planning, notstarted, blocked.',
      inputSchema: { file: z.string(), id: z.string(), status: z.string() },
    },
    async ({ file, id, status }) => {
      await fetchRoots(server);
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
        "Update a task's name, description, and/or decisions list, then write back to disk. Use this to rename tasks, refine descriptions, or record decisions (> lines). Does NOT change status — use vine_set_status for that. Pass only the fields you want to change; omitted fields are left untouched.",
      inputSchema: {
        file: z.string(),
        id: z.string(),
        name: z.string().optional(),
        description: z.string().optional(),
        decisions: z.array(z.string()).optional(),
      },
    },
    async ({ file, id, name, description, decisions }) => {
      await fetchRoots(server);
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
        'Add a dependency edge (taskId depends on depId) and write the file back to disk. Use this when the user specifies a new ordering constraint — e.g., "deploy can\'t start until tests pass." The validator rejects cycles, so this is safe to call speculatively.',
      inputSchema: { file: z.string(), taskId: z.string(), depId: z.string() },
    },
    async ({ file, taskId, depId }) => {
      await fetchRoots(server);
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
        'Remove a dependency edge (taskId no longer depends on depId) and write the file back to disk. Use this when a constraint is no longer needed — e.g., "actually frontend doesn\'t need backend anymore." This only removes the edge, not the tasks themselves.',
      inputSchema: {
        file: z.string(),
        taskId: z.string(),
        depId: z.string(),
      },
    },
    async ({ file, taskId, depId }) => {
      await fetchRoots(server);
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

  // ── Ref tools ────────────────────────────────────────────────────────

  server.registerTool(
    'vine_add_ref',
    {
      description:
        'Add a reference node to a VINE graph. Reference nodes are proxies for external .vine files.',
      inputSchema: {
        file: z.string().describe('Path to the .vine file'),
        id: z.string().describe('Unique ID'),
        name: z.string().describe('Display name'),
        vine: z.string().describe('URI to the external .vine file'),
        description: z.string().optional().describe('Description text'),
        depends_on: z
          .array(z.string())
          .optional()
          .describe('IDs of dependencies'),
        decisions: z.array(z.string()).optional().describe('Decision lines'),
      },
    },
    async ({ file, id, name, vine, description, depends_on, decisions }) => {
      await fetchRoots(server);
      try {
        let graph = readGraph(file);
        const refTask: RefTask = {
          kind: 'ref',
          id,
          shortName: name,
          description: description ?? '',
          vine,
          dependencies: depends_on ?? [],
          decisions: decisions ?? [],
          annotations: EMPTY_ANNOTATIONS,
        };
        graph = addRef(graph, refTask);
        writeGraph(file, graph);
        return ok(`Ref "${id}" added.`);
      } catch (error: unknown) {
        return fail(formatError(error, file));
      }
    },
  );

  server.registerTool(
    'vine_expand_ref',
    {
      description:
        'Expand a reference node by inlining an external VINE graph. The ref node is replaced with the child graph\u2019s content.',
      inputSchema: {
        file: z.string().describe('Path to the parent .vine file'),
        ref_id: z.string().describe('ID of the reference node to expand'),
        child_file: z
          .string()
          .describe('Path to the child .vine file to inline'),
      },
    },
    async ({ file, ref_id, child_file }) => {
      await fetchRoots(server);
      try {
        const parentGraph = readGraph(file);
        const childContent = readFileContent(child_file);
        const childGraph = parse(childContent);
        const expanded = expandVineRef(parentGraph, ref_id, childGraph);
        writeGraph(file, expanded);
        return ok(`Ref "${ref_id}" expanded.`);
      } catch (error: unknown) {
        return fail(formatError(error, file));
      }
    },
  );

  server.registerTool(
    'vine_update_ref_uri',
    {
      description: 'Update the URI of a reference node.',
      inputSchema: {
        file: z.string().describe('Path to the .vine file'),
        id: z.string().describe('ID of the reference node'),
        uri: z.string().describe('New URI for the reference'),
      },
    },
    async ({ file, id, uri }) => {
      await fetchRoots(server);
      try {
        let graph = readGraph(file);
        graph = updateRefUri(graph, id, uri);
        writeGraph(file, graph);
        return ok(`Ref "${id}" URI updated.`);
      } catch (error: unknown) {
        return fail(formatError(error, file));
      }
    },
  );

  server.registerTool(
    'vine_get_refs',
    {
      description: 'List all reference nodes in a VINE graph.',
      inputSchema: {
        file: z.string().describe('Path to the .vine file'),
      },
    },
    async ({ file }) => {
      await fetchRoots(server);
      try {
        const graph = readGraph(file);
        const refs = getRefs(graph);
        const result = refs.map((r) => ({
          id: r.id,
          shortName: r.shortName,
          vine: r.vine,
          dependencies: [...r.dependencies],
        }));
        return ok(JSON.stringify(result, null, 2));
      } catch (error: unknown) {
        return fail(formatError(error, file));
      }
    },
  );

  // ── Start ───────────────────────────────────────────────────────────

  const transport = new StdioServerTransport();
  await server.connect(transport);
}
