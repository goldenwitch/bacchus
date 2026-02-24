# AGENTS.md — Executing VINE Task Graphs

This document describes how AI agents execute `.vine` task graphs using the VINE MCP tools. A `.vine` file is a directed acyclic graph of tasks — agents traverse it bottom-up, completing leaf tasks first and propagating upward until the root is done.

For the VINE format specification, see [docs/VINE/v1.2.0.md](docs/VINE/v1.2.0.md).  
For the full MCP tool reference, see [docs/MCP.md](docs/MCP.md).

---

## Quick Start

```
1. Call vine_next_tasks to get the execution frontier
2. Pick up ready_to_start tasks in parallel (spawn sub-agents)
3. Each sub-agent: do the work → record artifacts/decisions → set status
4. Call vine_next_tasks again → newly unblocked tasks appear
5. Mark ready_to_complete tasks as complete
6. Expand needs_expansion ref nodes
7. Repeat until root is complete
```

---

## Tool Summary

| Category      | Tool                     | Description                                                          |
| ------------- | ------------------------ | -------------------------------------------------------------------- |
| **Execution** | `vine_next_tasks`        | Returns the execution frontier: ready, completable, and expandable.  |
| **Read-only** | `vine_validate`          | Parse and validate a `.vine` file.                                   |
|               | `vine_show`              | High-level graph summary.                                            |
|               | `vine_list`              | List tasks (optional status/search filters).                         |
|               | `vine_get_task`          | Full detail for one task by ID.                                      |
|               | `vine_get_descendants`   | Transitive downstream subtree.                                       |
|               | `vine_search`            | Case-insensitive text search.                                        |
| **Mutations** | `vine_set_status`        | Update a task's status.                                              |
|               | `vine_update_task`       | Update name, description, or decisions.                              |
|               | `vine_add_task`          | Add a task.                                                          |
|               | `vine_remove_task`       | Remove a task and clean up edges.                                    |
|               | `vine_add_dependency`    | Add a dependency edge.                                               |
|               | `vine_remove_dependency` | Remove a dependency edge.                                            |
| **Ref nodes** | `vine_expand_ref`        | Expand a ref by inlining a child graph.                              |
|               | `vine_add_ref`           | Add a reference node.                                                |
|               | `vine_update_ref_uri`    | Update a ref node's URI.                                             |
|               | `vine_get_refs`          | List all reference nodes.                                            |

---

## The Execution Model

### Core Loop

The execution of a `.vine` file follows a simple loop driven by `vine_next_tasks`:

```
┌─────────────────────────────────────────────────┐
│                vine_next_tasks                  │
│                                                 │
│  Returns:                                       │
│    ready_to_start    → tasks to pick up NOW     │
│    ready_to_complete → reviewing tasks to close │
│    needs_expansion   → ref nodes to inline      │
│    progress          → completion stats         │
└──────────────────┬──────────────────────────────┘
                   │
       ┌───────────┼───────────────┐
       ▼           ▼               ▼
  ┌─────────┐ ┌──────────┐ ┌────────────┐
  │ Start   │ │ Complete │ │  Expand    │
  │ tasks   │ │ reviewed │ │  refs      │
  │ (||)    │ │ tasks    │ │            │
  └────┬────┘ └─────┬────┘ └──────┬─────┘
       │            │              │
       └────────────┴──────────────┘
                    │
                    ▼
            vine_next_tasks
              (repeat)
```

### Step-by-Step

1. **Get the frontier**: Call `vine_next_tasks` with the `.vine` file path. It returns:
   - **`ready_to_start`** — tasks whose dependencies are all `complete` or `reviewing`, and whose own status is `notstarted` or `planning`. These are safe to begin.
   - **`ready_to_complete`** — tasks in `reviewing` where at least one dependant has advanced to `started` or beyond. The consumer has picked up the output; the reviewing task is done.
   - **`needs_expansion`** — ref nodes on the frontier. These proxy external `.vine` files and must be expanded before inner tasks become visible.
   - **`progress`** — `{ total, complete, percentage, root_id, root_status, by_status }`.

2. **Handle ref nodes first**: For each entry in `needs_expansion`, call `vine_expand_ref` to inline the child graph, then re-call `vine_next_tasks` — the newly-inlined tasks will now appear in `ready_to_start`.

3. **Pick up ready tasks in parallel**: Spawn a sub-agent for each `ready_to_start` task. Each sub-agent:

   a. **Sets status to `started`** — `vine_set_status(file, id, "started")`

   b. **Reads the task** — `vine_get_task(file, id)` to get the full description, decisions, and any existing attachments/guidance.

   c. **Does the work** — executes whatever the task describes. This is the domain-specific part: writing code, running tests, drafting a document, etc.

   d. **Records artifacts** — as work products are created, call `vine_update_task` to add `> decision` notes explaining choices made. If the task produces files, reference them in the description or as attachments.

   e. **Sets status to `reviewing`** — `vine_set_status(file, id, "reviewing")` when the work is believed complete but hasn't been consumed by dependants yet.

4. **Complete reviewed tasks**: After `vine_next_tasks` returns tasks in `ready_to_complete`, mark each one as `complete` via `vine_set_status(file, id, "complete")`. This signals that dependants have consumed the output.

5. **Repeat**: Call `vine_next_tasks` again. Newly unblocked tasks appear in `ready_to_start`. Continue until `progress.root_status === "complete"`.

### Status Lifecycle

```
notstarted ──► started ──► reviewing ──► complete
     │                         ▲
     └──► planning ────────────┘
              │
              ▼
           blocked (needs intervention)
```

| Status       | Meaning                                                    |
| ------------ | ---------------------------------------------------------- |
| `notstarted` | Ready to begin (or waiting for dependencies).              |
| `planning`   | Planning started but work hasn't begun.                    |
| `started`    | Actively being worked on.                                  |
| `reviewing`  | Work believed complete; waiting for dependants to confirm. |
| `complete`   | Done. Dependants can rely on this task's output.           |
| `blocked`    | Stuck — needs human or external intervention.              |

### The Reviewing → Complete Handoff

The `reviewing` status is the key coordination mechanism between tasks:

1. A leaf task finishes its work and moves to `reviewing`.
2. `vine_next_tasks` sees that the leaf's dependants now have their dependencies satisfied (since `reviewing` satisfies dependencies). The dependants appear in `ready_to_start`.
3. A dependant picks up the work, reads the leaf's output (artifacts, decisions), and sets itself to `started`.
4. On the next `vine_next_tasks` call, the leaf appears in `ready_to_complete` — because a dependant has started consuming its output.
5. The orchestrator marks the leaf `complete`.

This means the `.vine` file itself is the shared state. Every agent reads and writes it.

---

## Parallelization with Sub-Agents

The execution model is inherently parallel. At any point, `vine_next_tasks` may return multiple tasks in `ready_to_start`. These should be distributed across sub-agents for concurrent execution.

### Orchestrator / Sub-Agent Pattern

```
┌──────────────────────────────────────────────────────┐
│                  Orchestrator Agent                   │
│                                                      │
│  1. vine_next_tasks(file) → frontier                 │
│  2. For each ready task: spawn sub-agent             │
│  3. Wait for sub-agents to complete                  │
│  4. vine_next_tasks(file) → next frontier            │
│  5. Mark ready_to_complete tasks as complete         │
│  6. Expand any needs_expansion refs                  │
│  7. Repeat until root is complete                    │
└──────────┬───────────┬───────────┬───────────────────┘
           │           │           │
           ▼           ▼           ▼
      ┌─────────┐ ┌─────────┐ ┌─────────┐
      │ Sub-    │ │ Sub-    │ │ Sub-    │
      │ Agent 1 │ │ Agent 2 │ │ Agent 3 │
      │         │ │         │ │         │
      │ • read  │ │ • read  │ │ • read  │
      │   task  │ │   task  │ │   task  │
      │ • work  │ │ • work  │ │ • work  │
      │ • write │ │ • write │ │ • write │
      │   vine  │ │   vine  │ │   vine  │
      └─────────┘ └─────────┘ └─────────┘
```

### Orchestrator Pseudocode

```
function execute(file):
    loop:
        frontier = vine_next_tasks(file)

        if frontier.progress.root_status == "complete":
            return "Done"

        # Phase 1: Expand any ref nodes
        for ref in frontier.needs_expansion:
            vine_expand_ref(file, ref.id, ref.vine)

        if frontier.needs_expansion is not empty:
            continue  # re-evaluate frontier after expansion

        # Phase 2: Complete reviewed tasks
        for task in frontier.ready_to_complete:
            vine_set_status(file, task.id, "complete")

        # Phase 3: Start ready tasks in parallel
        sub_agents = []
        for task in frontier.ready_to_start:
            agent = spawn_sub_agent(file, task)
            sub_agents.append(agent)

        wait_for_all(sub_agents)
```

### Sub-Agent Pseudocode

```
function execute_task(file, task_id):
    # 1. Claim the task
    vine_set_status(file, task_id, "started")

    # 2. Read full context
    task = vine_get_task(file, task_id)

    # 3. Do the work described in task.description
    #    Use task.decisions for prior context
    #    Use task.attachments for guidance/artifacts
    result = do_work(task)

    # 4. Record decisions made during execution
    vine_update_task(file, task_id, decisions=[
        ...task.decisions,
        "> Used approach X because of Y"
    ])

    # 5. Mark as reviewing
    vine_set_status(file, task_id, "reviewing")
```

### Concurrency Notes

- **File-level serialization**: The `.vine` file is the single source of truth. Sub-agents should read-modify-write atomically. In practice, MCP tool calls are serialized per-file through the server, so concurrent sub-agents calling `vine_set_status` on different tasks in the same file are safe.
- **No premature completion**: A task should only move to `reviewing` when its work is genuinely done. The orchestrator uses `ready_to_complete` — not a timer — to decide when to finalize.
- **Blocked tasks**: If a sub-agent encounters an obstacle, it should `vine_set_status(file, id, "blocked")` and add a `> decision` explaining why. The orchestrator can surface this to a human.

---

## Expanding Reference Nodes

Ref nodes are proxies for external `.vine` files. They let you compose large plans from smaller, reusable sub-graphs.

During execution, when a ref node appears in `needs_expansion`:

1. Call `vine_expand_ref(file, ref_id, child_file)` — this inlines the child graph's tasks into the parent, replacing the ref node.
2. The child root's tasks become concrete tasks with prefixed IDs (e.g., `ref-id/child-task`).
3. Re-call `vine_next_tasks` — the inlined tasks now appear in the frontier.

Example: if `project.vine` contains `ref [infra] Infrastructure (./infra.vine)`, after expansion the tasks from `infra.vine` appear as `infra/setup-vpc`, `infra/configure-dns`, etc.

---

## Worked Example: `prompts/pr-ready.vine`

The `prompts/pr-ready.vine` file models a PR readiness checklist. Here's how an agent executes it:

### The Graph

```
pr-ready
  → review
  → ci-green
    → open-pr
      → typecheck  ─┐
      → lint        ─┤
      → format-check┤ → changes → branch
      → test        ─┤
      → e2e         ─┤
      → build-vscode┘
```

### Execution Trace

**Round 1** — `vine_next_tasks` returns:
```json
{ "ready_to_start": [{ "id": "branch", ... }] }
```
One sub-agent picks up `branch`:
- Sets `branch` → `started`
- Creates a feature branch from latest main
- Adds decision: `> Branched from main at abc123`
- Sets `branch` → `reviewing`

**Round 2** — `vine_next_tasks` returns:
```json
{
  "ready_to_start": [{ "id": "changes", ... }],
  "ready_to_complete": [{ "id": "branch", ... }]
}
```
- Mark `branch` → `complete`
- Sub-agent picks up `changes`:
  - Writes code, makes commits
  - Adds decisions: `> Refactored X for clarity`, `> Added tests for edge case Y`
  - Sets `changes` → `reviewing`

**Round 3** — `vine_next_tasks` returns:
```json
{
  "ready_to_start": [
    { "id": "typecheck" },
    { "id": "lint" },
    { "id": "format-check" },
    { "id": "test" },
    { "id": "e2e" },
    { "id": "build-vscode" }
  ],
  "ready_to_complete": [{ "id": "changes" }]
}
```
- Mark `changes` → `complete`
- **Six sub-agents in parallel**, each running their respective check:
  - `typecheck`: runs `yarn typecheck`, records pass/fail
  - `lint`: runs `yarn lint`, records result
  - `format-check`: runs `yarn format:check`
  - `test`: runs `yarn test`, adds artifact for coverage
  - `e2e`: runs `yarn e2e`, adds artifact for report
  - `build-vscode`: runs `yarn build:vscode`
- Each sets their task → `reviewing` on success, `blocked` on failure

**Round 4** — All CI checks reviewing. `vine_next_tasks` returns:
```json
{
  "ready_to_start": [{ "id": "open-pr" }],
  "ready_to_complete": []
}
```
- Sub-agent for `open-pr`:
  - Opens a PR with a clear description
  - Adds decision: `> PR #42 opened against main`
  - Sets `open-pr` → `reviewing`

**Round 5** — `open-pr` dependant (`ci-green`) starts:
```json
{
  "ready_to_start": [{ "id": "ci-green" }],
  "ready_to_complete": [
    { "id": "typecheck" }, { "id": "lint" },
    { "id": "format-check" }, { "id": "test" },
    { "id": "e2e" }, { "id": "build-vscode" },
    { "id": "open-pr" }
  ]
}
```
- Mark all `ready_to_complete` tasks → `complete`
- Sub-agent for `ci-green`: verifies GitHub Actions pass, sets → `reviewing`

**Rounds 6–7** — `review` picks up, then `pr-ready` closes out. Root is `complete`.

---

## Conventions

### Artifacts as Evidence

When a task produces work products, reference them so downstream tasks can consume them:

```
vine_update_task(file, "test", decisions=[
    "> All 48 tests passing",
    "> Coverage: 94% lines, 88% branches"
])
```

For files, add them as attachment lines in the task description or reference them in decisions.

### Decisions as Breadcrumbs

Every non-trivial choice should be recorded as a `> decision` line:

```
vine_update_task(file, "changes", decisions=[
    "> Used getActionableTasks pure function in @bacchus/core",
    "> Kept vine_next_tasks read-only for MCP stateless model",
    "> Ref expansion is flagged, not automatic"
])
```

These serve as context for upstream tasks and as an audit trail.

### Atomic Progress

- Update the `.vine` file **as you go** — don't batch status changes.
- Set `started` immediately when picking up a task.
- Set `reviewing` as soon as work is complete, before moving on.
- This ensures `vine_next_tasks` always reflects the true state of work.

### Error Recovery

If a task fails:
1. Set status to `blocked` with a decision explaining the failure.
2. The orchestrator can: retry, escalate to a human, or skip (if optional like `build-vscode`).
3. Blocked tasks never appear in `ready_to_complete` — they require explicit intervention.

---

## Project Structure Reference

```
packages/
  core/     — Parser, serializer, graph queries, mutations (pure functions)
  mcp/      — MCP server (stdio, 17 tools, @modelcontextprotocol/sdk)
  cli/      — Command-line interface for .vine files
  ui/       — Browser app for visualization (Svelte + D3)
  vscode/   — VS Code extension (bundles MCP server)

prompts/
  pr-ready.vine  — PR readiness checklist (example executable prompt)

examples/
  *.vine         — Example graphs for testing and demonstration
```

For contributing to the codebase itself, see [CONTRIBUTING.md](CONTRIBUTING.md).
