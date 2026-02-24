# @bacchus/mcp

stdio-based MCP server exposing the VINE task graph API for AI tool-use. Built on [`@modelcontextprotocol/sdk`](https://github.com/modelcontextprotocol/typescript-sdk), reuses `@bacchus/core` pure functions with isolated file I/O.

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

## Tool Reference

The server exposes 12 tools. All tools accept a `file` parameter (path to a `.vine` file, absolute or relative to cwd/registered roots). Relative paths without an extension are automatically resolved with `.vine` appended.

### Read-Only Tools

#### `vine_validate`

Parse and validate a `.vine` file. Use this first when opening an unfamiliar file to confirm it is well-formed.

| Parameter | Type | Required | Description |
| --------- | ---- | -------- | ----------- |
| `file` | string | Yes | Path to the `.vine` file |

**Returns**: `"Valid — <n> task(s)."` on success, or a parse/validation error message.

---

#### `vine_show`

Return a high-level summary: root task, total/leaf counts, and per-status breakdown.

| Parameter | Type | Required | Description |
| --------- | ---- | -------- | ----------- |
| `file` | string | Yes | Path to the `.vine` file |

**Returns**: Multi-line text with root info, task counts, and status breakdown.

---

#### `vine_list`

List tasks, optionally filtered by status or a search string.

| Parameter | Type | Required | Description |
| --------- | ---- | -------- | ----------- |
| `file` | string | Yes | Path to the `.vine` file |
| `status` | string | No | Filter by status (`complete`, `started`, `reviewing`, `planning`, `notstarted`, `blocked`) |
| `search` | string | No | Case-insensitive text search across names and descriptions |

**Returns**: JSON array of task objects.

---

#### `vine_get_task`

Return full details of a single task by ID, including description, status, dependencies, decisions, and attachments.

| Parameter | Type | Required | Description |
| --------- | ---- | -------- | ----------- |
| `file` | string | Yes | Path to the `.vine` file |
| `id` | string | Yes | Task ID |

**Returns**: JSON object with all task fields.

---

#### `vine_get_descendants`

Return all tasks that transitively depend on the given task (its full downstream subtree). Useful for assessing the blast radius of a change.

| Parameter | Type | Required | Description |
| --------- | ---- | -------- | ----------- |
| `file` | string | Yes | Path to the `.vine` file |
| `id` | string | Yes | Task ID |

**Returns**: JSON array of `{ id, shortName }` objects.

---

#### `vine_search`

Case-insensitive text search across task names and descriptions. Returns matching tasks with full detail.

| Parameter | Type | Required | Description |
| --------- | ---- | -------- | ----------- |
| `file` | string | Yes | Path to the `.vine` file |
| `query` | string | Yes | Search string |

**Returns**: JSON array of matching task objects.

---

### Mutation Tools

All mutation tools read the file, apply the change using `@bacchus/core` pure functions, and write the result back to disk.

#### `vine_add_task`

Add a new task to the graph.

| Parameter | Type | Required | Description |
| --------- | ---- | -------- | ----------- |
| `file` | string | Yes | Path to the `.vine` file |
| `id` | string | Yes | Unique task identifier |
| `name` | string | Yes | Short task name |
| `status` | string | No | Status (default: `notstarted`). Valid values: `complete`, `started`, `reviewing`, `planning`, `notstarted`, `blocked` |
| `description` | string | No | Task description text |
| `dependsOn` | string[] | No | List of dependency task IDs |

**Returns**: `'Task "<id>" added.'`

---

#### `vine_remove_task`

Remove a task and all references to it from the graph. Dependency edges pointing to the removed task are dropped from other tasks.

| Parameter | Type | Required | Description |
| --------- | ---- | -------- | ----------- |
| `file` | string | Yes | Path to the `.vine` file |
| `id` | string | Yes | Task ID to remove |

**Returns**: `'Task "<id>" removed.'`

---

#### `vine_set_status`

Update a task's status.

| Parameter | Type | Required | Description |
| --------- | ---- | -------- | ----------- |
| `file` | string | Yes | Path to the `.vine` file |
| `id` | string | Yes | Task ID |
| `status` | string | Yes | New status. Valid values: `complete`, `started`, `reviewing`, `planning`, `notstarted`, `blocked` |

**Returns**: `'Task "<id>" status set to "<status>".'`

---

#### `vine_update_task`

Update a task's name, description, and/or decisions list. Does **not** change status — use `vine_set_status` for that. Pass only the fields you want to change; omitted fields are left untouched.

| Parameter | Type | Required | Description |
| --------- | ---- | -------- | ----------- |
| `file` | string | Yes | Path to the `.vine` file |
| `id` | string | Yes | Task ID |
| `name` | string | No | New short name |
| `description` | string | No | New description |
| `decisions` | string[] | No | New decisions list (replaces existing) |

**Returns**: `'Task "<id>" updated.'`

---

#### `vine_add_dependency`

Add a dependency edge: `taskId` depends on `depId`. The validator rejects cycles, so this is safe to call speculatively.

| Parameter | Type | Required | Description |
| --------- | ---- | -------- | ----------- |
| `file` | string | Yes | Path to the `.vine` file |
| `taskId` | string | Yes | Task that will gain the dependency |
| `depId` | string | Yes | Task being depended on |

**Returns**: `'Dependency added: "<taskId>" now depends on "<depId>".'`

---

#### `vine_remove_dependency`

Remove a dependency edge: `taskId` no longer depends on `depId`. Only removes the edge, not the tasks themselves.

| Parameter | Type | Required | Description |
| --------- | ---- | -------- | ----------- |
| `file` | string | Yes | Path to the `.vine` file |
| `taskId` | string | Yes | Task that will lose the dependency |
| `depId` | string | Yes | Task being un-depended |

**Returns**: `'Dependency removed: "<taskId>" no longer depends on "<depId>".'`

---

## I/O Layer

File reads and writes are isolated in [io.ts](../packages/mcp/src/io.ts), keeping all tool handlers free of direct filesystem calls:

| Function | Signature | Description |
| -------- | --------- | ----------- |
| `readGraph` | `(filePath: string) → VineGraph` | Reads a `.vine` file from disk, parses it via `@bacchus/core`'s `parse()` |
| `writeGraph` | `(filePath: string, graph: VineGraph) → void` | Serializes via `@bacchus/core`'s `serialize()` and writes to disk |
| `resolvePath` | `(file: string) → string` | Resolves relative/extensionless paths against cwd and registered roots |
| `setRoots` | `(dirs: readonly string[]) → void` | Registers additional root directories for path resolution |
| `getRoots` | `() → readonly string[]` | Returns the current registered roots |

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

| Error Class | Formatting |
| ----------- | ---------- |
| `VineParseError` | `"Parse error (line <n>): <message>"` |
| `VineValidationError` | `"Validation error [<constraint>]: <message>"` |
| `VineError` | `error.message` directly |
| Node.js `ENOENT` | `"File not found: <path>"` (with resolved path if different) |
| Node.js `EACCES` | `"Permission denied: <path>"` |
| Other errors | `error.message` or `String(error)` |

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

### Read-Only Operations

Each tool's underlying `@bacchus/core` function is exercised against a 4-task sample fixture:

- `vine_validate` — parse returns valid graph with correct task count
- `vine_show` — `getSummary` returns correct root, totals, and per-status breakdown
- `vine_list` — lists all tasks; `filterByStatus` and `searchTasks` filter correctly
- `vine_get_task` — `getTask` returns correct details
- `vine_get_descendants` — `getDescendants` returns transitive dependants
- `vine_search` — `searchTasks` finds tasks by keyword

### Mutation Operations

Each mutation is exercised as write → re-read → verify:

- `vine_add_task` — adds task, verifies new count
- `vine_remove_task` — removes non-root task, verifies absence
- `vine_set_status` — changes status, verifies new value
- `vine_update_task` — updates name/description, verifies fields
- `vine_add_dependency` — adds edge, verifies dependency list
- `vine_remove_dependency` — removes edge, verifies absence

### Error Handling

- Duplicate ID → `VineError`
- Remove root → `VineError`
- Invalid status → rejected by `isValidStatus`
- Unknown task ID → `VineError`
- Invalid `.vine` content → `VineParseError`

### Protocol-Level Tests

The VS Code package includes [mcp-protocol.test.ts](../packages/vscode/__tests__/mcp-protocol.test.ts) which tests end-to-end MCP communication: spawns `dist/server.js` via `StdioClientTransport`, calls `tools/list`, and exercises tools over the wire.

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
│    ├─ Tool handlers (12 tools)               │
│    │   ├─ Read: validate, show, list,        │
│    │   │        get_task, get_descendants,    │
│    │   │        search                        │
│    │   └─ Write: add_task, remove_task,      │
│    │            set_status, update_task,      │
│    │            add_dependency,               │
│    │            remove_dependency             │
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

| Package | Role |
| ------- | ---- |
| `@bacchus/core` | VINE parser, serializer, graph queries, and mutations |
| `@modelcontextprotocol/sdk` | MCP server framework (JSON-RPC, tool registration, transport) |
| `zod` | Input schema validation for tool parameters |
