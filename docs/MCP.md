# @bacchus/mcp

stdio-based MCP server exposing the VINE task graph API as 4 tools and 2 MCP resources for AI tool-use. Built on [`@modelcontextprotocol/sdk`](https://github.com/modelcontextprotocol/typescript-sdk), reuses `@bacchus/core` pure functions with isolated file I/O.

---

## Quick Start

The server communicates over stdin/stdout using JSON-RPC (MCP protocol). It is designed for programmatic consumption by AI hosts, not interactive use.

```powershell
# Run standalone (requires built output or tsx)
node packages/mcp/dist/server.js

# Optional: set working directory for relative .vine paths
node packages/mcp/dist/server.js --cwd /path/to/project
```

The `--cwd` flag changes the process working directory and registers it as a root for path resolution — useful for non-VS-Code clients like Claude Desktop.

---

## Resources

The server exposes two MCP resources containing the VINE specification:

### `vine://spec/brief`

Condensed VINE format specification with execution guide and tool reference (~200 lines). Read this first when executing a .vine file contextlessly.

### `vine://spec/full`

Complete VINE v1.2.0 format specification including ABNF grammar, expansion algorithm, serialization rules, and examples (~700 lines).

---

## Tool Reference

The server exposes 4 tools. All tools accept a `file` parameter (path to a `.vine` file, absolute or relative to cwd/registered roots). Relative paths without an extension are automatically resolved with `.vine` appended.

### `vine_read`

Query a .vine task graph. The `action` parameter selects the query type.

| Parameter | Type   | Required | Description                                                               |
| --------- | ------ | -------- | ------------------------------------------------------------------------- |
| `file`    | string | Yes      | Path to the `.vine` file                                                  |
| `action`  | string | Yes      | One of: `summary`, `list`, `task`, `context`, `descendants`, `search`, `refs`, `validate` |
| `id`      | string | No       | Task ID (required for `task` and `descendants`)                           |
| `status`  | string | No       | Status filter (for `list`)                                                |
| `query`   | string | No       | Search query (for `list` or `search`)                                     |

**Actions:**

| Action        | Description                                                                     | Returns                               |
| ------------- | ------------------------------------------------------------------------------- | ------------------------------------- |
| `validate`    | Parse and validate the file                                                      | `"Valid — <n> task(s)."`              |
| `summary`     | Root task, total/leaf counts, per-status breakdown                               | Multi-line text summary               |
| `list`        | All tasks, optionally filtered by `status` or `query`                            | JSON array of task objects            |
| `task`        | Full detail for one task by ID                                                   | JSON task object                      |
| `context`     | Full task detail plus resolved dependencies (status, decisions, attachments) and dependant list | JSON object with `resolved_dependencies` and `dependant_tasks` |
| `descendants` | Transitive downstream subtree (blast radius)                                     | JSON array of `{ id, shortName }`     |
| `search`      | Case-insensitive text search across names and descriptions                       | JSON array of matching task objects    |
| `refs`        | All reference nodes                                                              | JSON array of `{ id, shortName, vine, dependencies }` |

---

### `vine_next`

Return the execution frontier — the set of tasks that can be acted on right now.

| Parameter | Type   | Required | Description              |
| --------- | ------ | -------- | ------------------------ |
| `file`    | string | Yes      | Path to the `.vine` file |

**Returns** (JSON):

| Field               | Description                                                                                           |
| ------------------- | ----------------------------------------------------------------------------------------------------- |
| `ready_to_start`    | Tasks whose deps are all satisfied (complete/reviewing) and status is notstarted/planning             |
| `ready_to_complete` | Tasks in reviewing where a dependant has started consuming output — safe to mark complete              |
| `needs_expansion`   | Ref nodes on the frontier that must be expanded via `vine_expand` before inner tasks become visible   |
| `blocked`           | Tasks with status blocked whose dependencies are all satisfied                                        |
| `progress`          | `{ total, complete, percentage, ready_count, root_id, root_status, by_status }`                       |

**Orchestration loop**: The orchestrator dispatches sub-agents that call `vine_next` themselves, handle housekeeping (expand refs, complete reviewed tasks), pick up one task, do the work, and report back progress. The orchestrator never calls VINE tools directly — it preserves its context for planning and coordination. See [AGENTS.md](../AGENTS.md) for the full pattern.

---

### `vine_write`

Apply one or more mutations atomically. Operations are applied in order; the graph is validated once at the end and written to disk.

| Parameter    | Type    | Required | Description                                        |
| ------------ | ------- | -------- | -------------------------------------------------- |
| `file`       | string  | Yes      | Path to the `.vine` file                           |
| `operations` | array   | Yes      | Array of operation objects (minimum 1)             |

**Operations** (each object has an `op` field):

| Op                | Fields                                                                     | Description                            |
| ----------------- | -------------------------------------------------------------------------- | -------------------------------------- |
| `create`          | `version?`                                                                 | Bootstrap a new .vine file (must be first op) |
| `add_task`        | `id`, `name`, `status?`, `description?`, `dependsOn?: string[]`, `annotations?: Record<string, string[]>` | Add a new concrete task                |
| `remove_task`     | `id`                                                                       | Remove a task and clean up edges       |
| `set_status`      | `id`, `status`                                                             | Change task status                     |
| `update`          | `id`, `name?`, `description?`, `decisions?: string[]`, `attachments?: Attachment[]`, `annotations?: Record<string, string[]>` | Update task metadata                   |
| `claim`           | `id`                                                                       | Set task to started with dependency context    |
| `extract_to_ref`  | `id`, `vine`, `refName?`                                                   | Extract task to child .vine, replace with ref  |
| `add_dep`         | `taskId`, `depId`                                                          | Add a dependency edge                  |
| `remove_dep`      | `taskId`, `depId`                                                          | Remove a dependency edge               |
| `add_ref`         | `id`, `name`, `vine`, `description?`, `dependsOn?: string[]`, `decisions?: string[]` | Add a reference node     |
| `update_ref_uri`  | `id`, `uri`                                                                | Update a ref node's URI                |

**Batch semantics**: Validation runs only after all operations, so you can add a task and wire it into the graph in one call (solving the island-rule constraint that previously made `add_task` fail for disconnected nodes).

**Returns** (JSON): Structured response with:

| Field               | Description                                                                       |
| ------------------- | --------------------------------------------------------------------------------- |
| `summary`           | Human-readable summary of applied operations                                      |
| `progress`          | `{ total, complete, percentage, ready_count, root_id, root_status, by_status }`   |
| `ready_to_start`    | Tasks ready to pick up (same as `vine_next`)                                      |
| `ready_to_complete` | Tasks safe to mark complete                                                       |
| `blocked`           | Blocked tasks with satisfied dependencies                                         |
| `needs_expansion`   | Ref nodes needing expansion                                                       |
| `claimed`           | (When `claim` op used) Full task detail with resolved dependency context           |

---

### `vine_expand`

Expand a reference node by inlining an external .vine graph. The ref node is replaced with the child graph's tasks.

| Parameter    | Type   | Required | Description                              |
| ------------ | ------ | -------- | ---------------------------------------- |
| `file`       | string | Yes      | Path to the parent `.vine` file          |
| `ref_id`     | string | Yes      | ID of the reference node to expand       |
| `child_file` | string | Yes      | Path to the child `.vine` file to inline |

**Returns**: `'Ref "<ref_id>" expanded.'`

---

## I/O Layer

File reads and writes are isolated in [io.ts](../packages/mcp/src/io.ts), keeping all tool handlers free of direct filesystem calls:

| Function      | Signature                                     | Description                                                               |
| ------------- | --------------------------------------------- | ------------------------------------------------------------------------- |
| `readGraph`   | `(filePath: string) → VineGraph`              | Reads a `.vine` file from disk, parses it via `@bacchus/core`'s `parse()` |
| `writeGraph`  | `(filePath: string, graph: VineGraph) → void` | Serializes via `@bacchus/core`'s `serialize()` and writes to disk         |
| `resolvePath` | `(file: string) → string`                     | Resolves relative/extensionless paths against cwd and registered roots    |
| `setRoots`    | `(dirs: readonly string[]) → void`            | Registers additional root directories for path resolution                 |
| `getRoots`    | `() → readonly string[]`                      | Returns the current registered roots                                      |

### Path Resolution Strategy

`resolvePath` tries candidates in order (first match wins):

1. If already absolute and exists → use it
2. Resolve against `process.cwd()` → if exists, use it
3. Resolve against each registered root → if exists, use it
4. Retry steps 1–3 with `.vine` appended (when input has no extension)
5. Fall back to cwd-based resolution

This boundary enables testing (tool handlers are tested against temp directories) and potential future non-filesystem backends.

---

## Error Handling

Errors from `@bacchus/core` are caught by each tool handler and returned as MCP error responses (`isError: true`):

| Error Class           | Formatting                                                   |
| --------------------- | ------------------------------------------------------------ |
| `VineParseError`      | `"Parse error (line <n>): <message>"`                        |
| `VineValidationError` | `"Validation error [<constraint>]: <message>"`               |
| `VineError`           | `error.message` directly                                     |
| Node.js `ENOENT`      | `"File not found: <path>"` (with resolved path if different) |
| Node.js `EACCES`      | `"Permission denied: <path>"`                                |
| Other errors          | `error.message` or `String(error)`                           |

All errors are surfaced as text content with `isError: true`, so AI clients can read and recover from them.

---

## MCP Roots Discovery

On the first tool invocation, the server lazy-fetches the client's workspace roots via `server.listRoots()` (if the client advertises the `roots` capability). Discovered root directories are registered with `setRoots()` so that subsequent `resolvePath` calls can find `.vine` files relative to any workspace root.

---

## Integration with VS Code Extension

The `bacchus-vine` VS Code extension ([docs](VSCodeExtension.md)) bundles this server into its `dist/server.js` output via esbuild. The extension's MCP server definition provider spawns the bundled server as a Node.js child process with stdio transport, setting `cwd` to the first workspace folder. This makes all VINE tools available to Copilot and other AI assistants with zero configuration.

See [VSCodeExtension.md](VSCodeExtension.md) for activation details and architecture.

---

## Testing

Tests live in [server.test.ts](../packages/mcp/__tests__/server.test.ts) and cover all layers:

### I/O & Path Resolution

- `readGraph` / `writeGraph` round-trip: write → read preserves graph structure
- Parse errors (`VineParseError`) on invalid content
- `ENOENT` on missing files
- `resolvePath`: absolute paths, relative to cwd, relative to registered roots, `.vine` extension inference, cwd-over-roots precedence, fallback behavior
- `setRoots` / `getRoots` lifecycle

### `vine_read` Operations

Each action's underlying `@bacchus/core` function is exercised against a 4-task sample fixture:

- `validate` — parse returns valid graph with correct task count
- `summary` — `getSummary` returns correct root, totals, and per-status breakdown
- `list` — lists all tasks; `filterByStatus` and `searchTasks` filter correctly
- `task` — `getTask` returns correct details
- `descendants` — `getDescendants` returns transitive dependants
- `search` — `searchTasks` finds tasks by keyword
- `refs` — `getRefs` returns all reference nodes

### `vine_write` Batch Mutations

Batch operations are exercised via `applyBatch` as write → re-read → verify:

- `add_task` — adds task, verifies new count
- `remove_task` — removes non-root task, verifies absence
- `set_status` — changes status, verifies new value
- `update` — updates name/description/decisions, verifies fields
- `add_dep` — adds edge, verifies dependency list
- `remove_dep` — removes edge, verifies absence
- `add_ref` — adds reference node, verifies presence
- `update_ref_uri` — updates ref URI, verifies new value
- Multi-operation batches — add task + wire dependency in one call

### `vine_next` Execution Frontier

- Returns `ready_to_start`, `ready_to_complete`, `needs_expansion`, and `progress`
- Correctly identifies tasks whose dependencies are satisfied
- Flags ref nodes that need expansion

### `vine_expand` Reference Expansion

- Inlines child graph tasks into parent
- Prefixes child task IDs with ref ID
- Re-wires dependencies correctly

### Resources

- `vine://spec/brief` — returns condensed spec content
- `vine://spec/full` — returns full spec content

### Error Handling

- Duplicate ID → `VineError`
- Remove root → `VineError`
- Invalid status → rejected by `isValidStatus`
- Unknown task ID → `VineError`
- Invalid `.vine` content → `VineParseError`

### Protocol-Level Tests

The VS Code package includes [mcp-protocol.test.ts](../packages/vscode/__tests__/mcp-protocol.test.ts) which tests end-to-end MCP communication: spawns `dist/server.js` via `StdioClientTransport`, calls `tools/list`, and exercises the 4 tools over the wire.

---

## Architecture

```
┌──────────────────────────────────────────────┐
│  AI Host (VS Code / Claude Desktop / etc.)   │
│                                              │
│  MCP Client  ◄─── stdio (JSON-RPC) ───►     │
└──────────────────────────────────────────────┘
                                          │
                                          ▼
┌──────────────────────────────────────────────┐
│  @bacchus/mcp                                │
│                                              │
│  index.ts                                    │
│    └─ --cwd flag handling                    │
│    └─ startServer()                          │
│                                              │
│  server.ts                                   │
│    ├─ McpServer (@modelcontextprotocol/sdk)  │
│    ├─ Resources:                             │
│    │   ├─ vine://spec/brief                  │
│    │   └─ vine://spec/full                   │
│    ├─ Tools (4):                             │
│    │   ├─ vine_read  (unified query)         │
│    │   ├─ vine_next  (execution frontier)    │
│    │   ├─ vine_write (batch mutations)       │
│    │   └─ vine_expand (ref expansion)        │
│    └─ MCP roots discovery                    │
│                                              │
│  io.ts                                       │
│    ├─ readGraph()  ─► parse()                │
│    ├─ writeGraph() ─► serialize()            │
│    └─ resolvePath()                          │
│              │                               │
│              ▼                               │
│       @bacchus/core (pure functions)         │
│              │                               │
│              ▼                               │
│        .vine files on disk                   │
└──────────────────────────────────────────────┘
```

---

## Dependencies

| Package                     | Role                                                          |
| --------------------------- | ------------------------------------------------------------- |
| `@bacchus/core`             | VINE parser, serializer, graph queries, and mutations         |
| `@modelcontextprotocol/sdk` | MCP server framework (JSON-RPC, tool registration, transport) |
| `zod`                       | Input schema validation for tool parameters                   |
