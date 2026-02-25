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
  getRefs,
  expandVineRef,
  parse,
  isValidStatus,
  VALID_STATUSES,
  applyBatch,
} from '@bacchus/core';
import type { Task, Operation, Status } from '@bacchus/core';

import {
  readGraph,
  writeGraph,
  readFileContent,
  resolvePath,
  setRoots,
  getRoots,
} from './io.js';

import { SPEC_BRIEF } from './spec-brief.js';
import { SPEC_FULL } from './spec-full.js';

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
  const server = new McpServer({ name: '@bacchus/mcp', version: '1.0.0' });

  // ── Resources ───────────────────────────────────────────────────────

  server.registerResource(
    'vine-spec-brief',
    'vine://spec/brief',
    { title: 'VINE Specification (Brief)', description: 'Condensed VINE format specification with execution guide and tool reference. Read this first for contextless .vine execution.', mimeType: 'text/markdown' },
    (uri) => ({ contents: [{ uri: uri.href, text: SPEC_BRIEF }] }),
  );

  server.registerResource(
    'vine-spec-full',
    'vine://spec/full',
    { title: 'VINE Specification (Full)', description: 'Complete VINE v1.2.0 format specification with ABNF grammar, expansion algorithm, and serialization rules.', mimeType: 'text/markdown' },
    (uri) => ({ contents: [{ uri: uri.href, text: SPEC_FULL }] }),
  );

  // ── Tools ───────────────────────────────────────────────────────────

  server.registerTool(
    'vine_read',
    {
      description:
        'Query a .vine task graph. The action parameter selects the query type:\n\n' +
        '• summary — High-level overview: root task, total/leaf counts, per-status breakdown. Use to orient yourself.\n' +
        '• list — All tasks, optionally filtered by status or search query. Returns full task detail.\n' +
        '• task — Full detail for one task by ID (description, status, dependencies, decisions, attachments).\n' +
        '• descendants — IDs and names of all tasks transitively depending on the given task (blast radius).\n' +
        '• search — Case-insensitive text search across task names and descriptions.\n' +
        '• refs — List all reference nodes (proxies for external .vine files).\n' +
        '• validate — Parse and validate the file, returning task count on success.',
      inputSchema: {
        file: z.string(),
        action: z.enum(['summary', 'list', 'task', 'descendants', 'search', 'refs', 'validate']),
        id: z.string().optional(),
        status: z.string().optional(),
        query: z.string().optional(),
      },
    },
    async ({ file, action, id, status, query }) => {
      await fetchRoots(server);
      try {
        const graph = readGraph(file);

        switch (action) {
          case 'validate':
            return ok(`Valid — ${String(graph.tasks.size)} task(s).`);

          case 'summary': {
            const summary = getSummary(graph);
            const lines = [
              `Root: ${summary.rootName} (${summary.rootId})`,
              `Total tasks: ${String(summary.total)}`,
              `Leaf tasks: ${String(summary.leafCount)}`,
              '',
              'Status breakdown:',
              ...VALID_STATUSES.map((s) => `  ${s}: ${String(summary.byStatus[s])}`),
            ];
            return ok(lines.join('\n'));
          }

          case 'list': {
            let tasks: Task[];
            if (status !== undefined) {
              if (!isValidStatus(status)) {
                return fail(`Invalid status "${status}". Valid values: ${VALID_STATUSES.join(', ')}`);
              }
              tasks = filterByStatus(graph, status);
            } else if (query !== undefined) {
              tasks = searchTasks(graph, query);
            } else {
              tasks = [...graph.tasks.values()];
            }
            return ok(JSON.stringify(tasks.map(formatTask), null, 2));
          }

          case 'task': {
            if (!id) return fail('id is required for action "task".');
            const task = getTask(graph, id);
            return ok(JSON.stringify(formatTask(task), null, 2));
          }

          case 'descendants': {
            if (!id) return fail('id is required for action "descendants".');
            const descs = getDescendants(graph, id);
            const result = descs.map((t) => ({ id: t.id, shortName: t.shortName }));
            return ok(JSON.stringify(result, null, 2));
          }

          case 'search': {
            if (!query) return fail('query is required for action "search".');
            const results = searchTasks(graph, query);
            return ok(JSON.stringify(results.map(formatTask), null, 2));
          }

          case 'refs': {
            const refs = getRefs(graph);
            const result = refs.map((r) => ({
              id: r.id,
              shortName: r.shortName,
              vine: r.vine,
              dependencies: [...r.dependencies],
            }));
            return ok(JSON.stringify(result, null, 2));
          }

          default:
            return fail(`Unknown action "${String(action)}".`);
        }
      } catch (error: unknown) {
        return fail(formatError(error, file));
      }
    },
  );

  server.registerTool(
    'vine_next',
    {
      description:
        'Return the execution frontier of a .vine graph — the set of tasks that can be acted on right now.\n\n' +
        'Returns:\n' +
        '• ready_to_start — Tasks whose dependencies are all satisfied (complete/reviewing) and status is notstarted/planning. Pick these up, set to started, do work, set to reviewing.\n' +
        '• ready_to_complete — Tasks in reviewing where a dependant has started consuming output. Mark these complete.\n' +
        '• needs_expansion — Ref nodes on the frontier. Call vine_expand to inline before inner tasks become visible.\n' +
        '• progress — { total, complete, percentage, root_id, root_status, by_status }.\n\n' +
        'Orchestration loop: call vine_next → expand refs → complete reviewed → start ready → do work → repeat until root is complete.',
      inputSchema: { file: z.string() },
    },
    async ({ file }) => {
      await fetchRoots(server);
      try {
        const graph = readGraph(file);
        const { ready, completable, expandable, progress } = getActionableTasks(graph);
        const result = {
          ready_to_start: ready.map(formatTask),
          ready_to_complete: completable.map(formatTask),
          needs_expansion: expandable.map((r) => ({
            id: r.id, shortName: r.shortName, vine: r.vine,
            dependencies: [...r.dependencies],
          })),
          progress: {
            total: progress.total, complete: progress.complete,
            percentage: progress.percentage, root_id: progress.rootId,
            root_status: progress.rootStatus, by_status: progress.byStatus,
          },
        };
        return ok(JSON.stringify(result, null, 2));
      } catch (error: unknown) {
        return fail(formatError(error, file));
      }
    },
  );

  server.registerTool(
    'vine_write',
    {
      description:
        'Apply one or more mutations to a .vine graph atomically. Operations are applied in order; the graph is validated once at the end and written to disk.\n\n' +
        'Each element in the operations array is an object with an "op" field:\n' +
        '• add_task — { op, id, name, status?, description?, dependsOn?: string[] }\n' +
        '• remove_task — { op, id }\n' +
        '• set_status — { op, id, status } (complete|started|reviewing|planning|notstarted|blocked)\n' +
        '• update — { op, id, name?, description?, decisions?: string[] }\n' +
        '• add_dep — { op, taskId, depId }\n' +
        '• remove_dep — { op, taskId, depId }\n' +
        '• add_ref — { op, id, name, vine, description?, dependsOn?: string[], decisions?: string[] }\n' +
        '• update_ref_uri — { op, id, uri }\n\n' +
        'Batch semantics: because validation runs only after all operations, you can add a task and wire it into the graph in one call (solving the island-rule constraint).',
      inputSchema: {
        file: z.string(),
        operations: z.array(z.record(z.string(), z.unknown())).min(1),
      },
    },
    async ({ file, operations }) => {
      await fetchRoots(server);
      try {
        // Validate and coerce operations
        const ops: Operation[] = operations.map((raw, i) => {
          const o = raw;
          if (typeof o.op !== 'string') {
            throw new VineError(`Operation ${String(i)}: missing "op" field.`);
          }
          switch (o.op) {
            case 'add_task': {
              if (typeof o.id !== 'string') throw new VineError(`Operation ${String(i)}: add_task requires "id".`);
              if (typeof o.name !== 'string') throw new VineError(`Operation ${String(i)}: add_task requires "name".`);
              const base: { op: 'add_task'; id: string; name: string; description?: string; dependsOn?: string[]; status?: Status } = {
                op: 'add_task',
                id: o.id,
                name: o.name,
              };
              if (o.status !== undefined) {
                if (typeof o.status !== 'string') throw new VineError(`Operation ${String(i)}: status must be a string.`);
                if (!isValidStatus(o.status)) {
                  throw new VineError(`Operation ${String(i)}: invalid status "${o.status}". Valid: ${VALID_STATUSES.join(', ')}`);
                }
                base.status = o.status;
              }
              if (typeof o.description === 'string') base.description = o.description;
              if (Array.isArray(o.dependsOn)) base.dependsOn = o.dependsOn as string[];
              return base;
            }
            case 'remove_task': {
              if (typeof o.id !== 'string') throw new VineError(`Operation ${String(i)}: remove_task requires "id".`);
              return { op: 'remove_task' as const, id: o.id } satisfies Operation;
            }
            case 'set_status': {
              if (typeof o.id !== 'string') throw new VineError(`Operation ${String(i)}: set_status requires "id".`);
              if (typeof o.status !== 'string') throw new VineError(`Operation ${String(i)}: set_status requires "status".`);
              if (!isValidStatus(o.status)) {
                throw new VineError(`Operation ${String(i)}: invalid status "${o.status}". Valid: ${VALID_STATUSES.join(', ')}`);
              }
              return { op: 'set_status', id: o.id, status: o.status };
            }
            case 'update': {
              if (typeof o.id !== 'string') throw new VineError(`Operation ${String(i)}: update requires "id".`);
              const upd: { op: 'update'; id: string; name?: string; description?: string; decisions?: string[] } = {
                op: 'update',
                id: o.id,
              };
              if (typeof o.name === 'string') upd.name = o.name;
              if (typeof o.description === 'string') upd.description = o.description;
              if (Array.isArray(o.decisions)) upd.decisions = o.decisions as string[];
              return upd;
            }
            case 'add_dep': {
              if (typeof o.taskId !== 'string') throw new VineError(`Operation ${String(i)}: add_dep requires "taskId".`);
              if (typeof o.depId !== 'string') throw new VineError(`Operation ${String(i)}: add_dep requires "depId".`);
              return { op: 'add_dep', taskId: o.taskId, depId: o.depId } satisfies Operation;
            }
            case 'remove_dep': {
              if (typeof o.taskId !== 'string') throw new VineError(`Operation ${String(i)}: remove_dep requires "taskId".`);
              if (typeof o.depId !== 'string') throw new VineError(`Operation ${String(i)}: remove_dep requires "depId".`);
              return { op: 'remove_dep', taskId: o.taskId, depId: o.depId } satisfies Operation;
            }
            case 'add_ref': {
              if (typeof o.id !== 'string') throw new VineError(`Operation ${String(i)}: add_ref requires "id".`);
              if (typeof o.name !== 'string') throw new VineError(`Operation ${String(i)}: add_ref requires "name".`);
              if (typeof o.vine !== 'string') throw new VineError(`Operation ${String(i)}: add_ref requires "vine".`);
              const ref: { op: 'add_ref'; id: string; name: string; vine: string; description?: string; dependsOn?: string[]; decisions?: string[] } = {
                op: 'add_ref',
                id: o.id,
                name: o.name,
                vine: o.vine,
              };
              if (typeof o.description === 'string') ref.description = o.description;
              if (Array.isArray(o.dependsOn)) ref.dependsOn = o.dependsOn as string[];
              if (Array.isArray(o.decisions)) ref.decisions = o.decisions as string[];
              return ref;
            }
            case 'update_ref_uri': {
              if (typeof o.id !== 'string') throw new VineError(`Operation ${String(i)}: update_ref_uri requires "id".`);
              if (typeof o.uri !== 'string') throw new VineError(`Operation ${String(i)}: update_ref_uri requires "uri".`);
              return { op: 'update_ref_uri', id: o.id, uri: o.uri } satisfies Operation;
            }
            default:
              throw new VineError(`Operation ${String(i)}: unknown op "${o.op}".`);
          }
        });

        let graph = readGraph(file);
        graph = applyBatch(graph, ops);
        writeGraph(file, graph);

        const summary = ops.map((o) => {
          switch (o.op) {
            case 'add_task': return `added task "${o.id}"`;
            case 'remove_task': return `removed task "${o.id}"`;
            case 'set_status': return `set "${o.id}" → ${o.status}`;
            case 'update': return `updated "${o.id}"`;
            case 'add_dep': return `added dep ${o.taskId} → ${o.depId}`;
            case 'remove_dep': return `removed dep ${o.taskId} → ${o.depId}`;
            case 'add_ref': return `added ref "${o.id}"`;
            case 'update_ref_uri': return `updated ref URI for "${o.id}"`;
          }
        });
        return ok(`${String(ops.length)} operation(s) applied: ${summary.join('; ')}.`);
      } catch (error: unknown) {
        return fail(formatError(error, file));
      }
    },
  );

  server.registerTool(
    'vine_expand',
    {
      description:
        'Expand a reference node by inlining an external .vine graph. The ref node is replaced with the child graph\'s tasks. Child IDs are prefixed (using child\'s prefix metadata or the ref ID). Call vine_next after expanding to see newly-unblocked tasks.',
      inputSchema: {
        file: z.string(),
        ref_id: z.string(),
        child_file: z.string(),
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

  // ── Start ───────────────────────────────────────────────────────────

  const transport = new StdioServerTransport();
  await server.connect(transport);
}
