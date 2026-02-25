# AGENTS.md — Executing VINE Task Graphs

This document describes how AI agents execute `.vine` task graphs using the VINE MCP tools. A `.vine` file is a directed acyclic graph of tasks — agents traverse it bottom-up, completing leaf tasks first and propagating upward until the root is done.

For the VINE format specification, see [docs/VINE/v1.2.0.md](docs/VINE/v1.2.0.md).  
For the full MCP tool reference, see [docs/MCP.md](docs/MCP.md).

---

## Quick Start

```
1. Read `vine://spec/brief` resource for format knowledge and orchestration guide
2. Dispatch a sub-agent with the .vine file path and instructions to:
   a. Call vine_next to get the execution frontier
   b. Handle housekeeping (expand refs, complete reviewed tasks)
   c. Pick up one ready_to_start task, do the work, set status to reviewing
   d. Report back what was done and current progress
3. Read the sub-agent's report — decide whether to spawn more, escalate, or stop
4. Repeat until sub-agent reports root is complete
```

---

## Tool Summary

| Category       | Tool/Resource       | Description                                                                       |
| -------------- | ------------------- | --------------------------------------------------------------------------------- |
| **Spec**       | `vine://spec/brief` | MCP resource: condensed VINE format + execution guide. Read first.                |
|                | `vine://spec/full`  | MCP resource: complete VINE v1.2.0 spec with ABNF and expansion algorithm.        |
| **Read**       | `vine_read`         | Query the graph: summary, list, task detail, descendants, search, refs, validate. |
| **Execution**  | `vine_next`         | Returns the execution frontier: ready, completable, expandable, progress.         |
| **Mutations**  | `vine_write`        | Batch mutations: add/remove tasks, set status, update, manage deps and refs.      |
| **Expansion**  | `vine_expand`       | Expand a ref node by inlining an external .vine graph.                            |

---

## The Execution Model

### Core Loop

The orchestrator never calls VINE tools directly. Instead, it dispatches sub-agents who interact with the `.vine` file autonomously. The orchestrator preserves its context for planning and coordination.

```
┌──────────────────────────────────────────────────┐
│              Orchestrator Agent                   │
│                                                   │
│  Knows: file path, high-level goal, progress     │
│  Does NOT call: vine_next, vine_read, vine_write │
│                                                   │
│  Loop:                                            │
│    1. Dispatch sub-agent(s) with .vine path       │
│    2. Read sub-agent report (task done, progress) │
│    3. Decide: spawn more? escalate? stop?         │
│    4. Repeat until root_status == "complete"      │
└──────────────────┬───────────────────────────────┘
                   │
       ┌───────────┼───────────────┐
       ▼           ▼               ▼
  ┌──────────┐ ┌──────────┐ ┌──────────┐
  │ Sub-     │ │ Sub-     │ │ Sub-     │
  │ Agent    │ │ Agent    │ │ Agent    │
  │          │ │          │ │          │
  │ vine_next│ │ vine_next│ │ vine_next│
  │ → work   │ │ → work   │ │ → work   │
  │ → report │ │ → report │ │ → report │
  └──────────┘ └──────────┘ └──────────┘
```

### Step-by-Step

1. **Dispatch a sub-agent**: The orchestrator spawns a sub-agent with:
   - The `.vine` file path
   - Instructions to call `vine_next`, handle housekeeping, pick up one task, and report back
   - Any high-level guidance relevant to the current phase

2. **Sub-agent executes autonomously**: The sub-agent runs the full task lifecycle (see [Sub-Agent Workflow](#sub-agent-workflow) below):
   - Calls `vine_next` to discover the execution frontier
   - Expands ref nodes if needed (`vine_expand`)
   - Marks reviewed tasks as complete (`vine_write`)
   - Claims one `ready_to_start` task, does the work, sets status to `reviewing`
   - Reports back: what task was completed, decisions made, and current `progress`

3. **Orchestrator reads the report**: The sub-agent's report contains:
   - Which task was worked on and its outcome
   - Current progress (`{ total, complete, percentage, root_status }`)
   - Any blocked tasks or issues requiring escalation

4. **Orchestrator decides next action**:
   - If `root_status === "complete"` → done
   - If multiple tasks are ready → spawn parallel sub-agents
   - If a task is blocked → escalate to human or retry
   - Otherwise → dispatch another sub-agent

5. **Repeat** until `root_status === "complete"`.

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
2. `vine_next` sees that the leaf's dependants now have their dependencies satisfied (since `reviewing` satisfies dependencies). The dependants appear in `ready_to_start`.
3. A sub-agent picks up a dependant, reads the leaf's output (artifacts, decisions), and sets the dependant to `started`.
4. On the next `vine_next` call, the leaf appears in `ready_to_complete` — because a dependant has started consuming its output.
5. The next sub-agent's housekeeping phase marks the leaf `complete`.

This means the `.vine` file itself is the shared state. Every agent reads and writes it.

---

## Orchestrator / Sub-Agent Pattern

The orchestrator stays lightweight — it never calls VINE tools directly. This preserves the orchestrator's context window for planning, coordination, and error handling. All VINE interaction happens inside sub-agents.

### Why Delegate?

- **Context preservation**: The orchestrator doesn't consume context on graph structures, task details, or frontier data. It stays focused on the big picture.
- **Stateless sub-agents**: Each sub-agent is self-contained. It queries the graph, does one unit of work, and reports back. No state carries between sub-agent invocations.
- **Natural parallelism**: The orchestrator can dispatch multiple sub-agents simultaneously when progress reports indicate multiple tasks are ready.

### Architecture

```
┌──────────────────────────────────────────────────────┐
│                  Orchestrator Agent                   │
│                                                      │
│  Context: file path, goal, progress snapshots        │
│  Does: dispatch, coordinate, escalate                │
│  Does NOT: call vine_next, vine_read, vine_write     │
│                                                      │
│  Loop:                                               │
│    1. Dispatch sub-agent(s) with .vine path          │
│    2. Read report: task done + progress snapshot      │
│    3. If root complete → stop                        │
│    4. If blocked → escalate or retry                 │
│    5. If ready_count > 1 → spawn parallel agents     │
│    6. Else → dispatch next sub-agent                 │
└──────────┬───────────┬───────────┬───────────────────┘
           │           │           │
           ▼           ▼           ▼
      ┌─────────┐ ┌─────────┐ ┌─────────┐
      │ Sub-    │ │ Sub-    │ │ Sub-    │
      │ Agent 1 │ │ Agent 2 │ │ Agent 3 │
      │         │ │         │ │         │
      │ • next  │ │ • next  │ │ • next  │
      │ • house │ │ • house │ │ • house │
      │   keep  │ │   keep  │ │   keep  │
      │ • work  │ │ • work  │ │ • work  │
      │ • report│ │ • report│ │ • report│
      └─────────┘ └─────────┘ └─────────┘
```

### Orchestrator Pseudocode

```
function execute(file):
    loop:
        report = dispatch_sub_agent(file, instructions="""
            1. Call vine_next(file) to get the execution frontier
            2. For each ref in needs_expansion: call vine_expand
            3. For each task in ready_to_complete: vine_write set_status complete
            4. Pick ONE task from ready_to_start
            5. Claim it (set_status started), read it (vine_read task), do the work
            6. Record decisions (vine_write update), set_status reviewing
            7. Call vine_next again for fresh progress
            8. Report back: { task_completed, decisions, progress, blocked_tasks }
        """)

        if report.progress.root_status == "complete":
            return "Done"

        if report.blocked_tasks:
            handle_blocked(report.blocked_tasks)

        if report.progress.ready_count > 1:
            # Multiple tasks available — fan out
            dispatch_parallel_sub_agents(file, count=report.progress.ready_count)
```

### Sub-Agent Workflow

Each sub-agent runs this sequence autonomously:

```
function sub_agent_execute(file):
    # Phase 1: Discover what needs doing
    frontier = vine_next(file)

    # Phase 2: Housekeeping — expand refs, complete reviewed tasks
    for ref in frontier.needs_expansion:
        vine_expand(file, ref.id, ref.vine)

    if frontier.needs_expansion is not empty:
        frontier = vine_next(file)  # re-evaluate after expansion

    for task in frontier.ready_to_complete:
        vine_write(file, [{ op: "set_status", id: task.id, status: "complete" }])

    # Phase 3: Pick up one task
    if frontier.ready_to_start is empty:
        return { task_completed: null, progress: frontier.progress }

    task_id = frontier.ready_to_start[0].id

    # Phase 4: Claim → Read → Work → Record → Review
    vine_write(file, [{ op: "set_status", id: task_id, status: "started" }])
    task = vine_read(file, action: "task", id: task_id)
    result = do_work(task)
    vine_write(file, [{ op: "update", id: task_id, decisions: [...result.decisions] }])
    vine_write(file, [{ op: "set_status", id: task_id, status: "reviewing" }])

    # Phase 5: Get fresh progress and report back
    frontier = vine_next(file)
    return {
        task_completed: task_id,
        decisions: result.decisions,
        progress: frontier.progress,
        ready_count: len(frontier.ready_to_start),
        blocked_tasks: [t for t in frontier if t.status == "blocked"]
    }
```

### Concurrency Notes

- **File-level serialization**: The `.vine` file is the single source of truth. MCP tool calls are serialized per-file through the server, so concurrent sub-agents calling `vine_write` on different tasks in the same file are safe.
- **One task per sub-agent**: Each sub-agent picks up exactly one task. This keeps sub-agents focused and makes progress reports unambiguous.
- **Parallel fan-out**: When a sub-agent reports `ready_count > 1`, the orchestrator can dispatch multiple sub-agents simultaneously. Each will call `vine_next` independently and claim a different task.
- **Blocked tasks**: If a sub-agent encounters an obstacle, it should `vine_write(file, [{ op: "set_status", id: id, status: "blocked" }])` and add a `> decision` explaining why. The orchestrator can surface this to a human.
- **No premature completion**: A task should only move to `reviewing` when its work is genuinely done. The housekeeping phase uses `ready_to_complete` — not a timer — to decide when to finalize.

---

## Expanding Reference Nodes

Ref nodes are proxies for external `.vine` files. They let you compose large plans from smaller, reusable sub-graphs.

During execution, when a ref node appears in `needs_expansion`:

1. Call `vine_expand(file, ref_id, child_file)` — this inlines the child graph's tasks into the parent, replacing the ref node.
2. The child root's tasks become concrete tasks with prefixed IDs (e.g., `ref-id/child-task`).
3. Re-call `vine_next` — the inlined tasks now appear in the frontier.

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

**Round 1** — Orchestrator dispatches a sub-agent. Sub-agent calls `vine_next`:

```json
{ "ready_to_start": [{ "id": "branch", ... }] }
```

Sub-agent picks up `branch`:

- Sets `branch` → `started`
- Creates a feature branch from latest main
- Adds decision: `> Branched from main at abc123`
- Sets `branch` → `reviewing`
- Reports back: `{ task_completed: "branch", progress: { ... }, ready_count: 1 }`

**Round 2** — Orchestrator dispatches another sub-agent. Sub-agent calls `vine_next`:

```json
{
  "ready_to_start": [{ "id": "changes", ... }],
  "ready_to_complete": [{ "id": "branch", ... }]
}
```

- Housekeeping: marks `branch` → `complete`
- Sub-agent picks up `changes`:
  - Writes code, makes commits
  - Adds decisions: `> Refactored X for clarity`, `> Added tests for edge case Y`
  - Sets `changes` → `reviewing`
- Reports back: `{ task_completed: "changes", ready_count: 6 }`

**Round 3** — Orchestrator sees `ready_count: 6` → dispatches **six sub-agents in parallel**. Each calls `vine_next` independently, claims one task:

- First sub-agent also handles housekeeping: marks `changes` → `complete`
- `typecheck`: runs `yarn typecheck`, records pass/fail
- `lint`: runs `yarn lint`, records result
- `format-check`: runs `yarn format:check`
- `test`: runs `yarn test`, adds artifact for coverage
- `e2e`: runs `yarn e2e`, adds artifact for report
- `build-vscode`: runs `yarn build:vscode`
- Each sets their task → `reviewing` on success, `blocked` on failure

**Round 4** — All CI checks reviewing. Orchestrator dispatches sub-agent:

- Housekeeping: no `ready_to_complete` yet (no dependant started)
- Sub-agent for `open-pr`:
  - Opens a PR with a clear description
  - Adds decision: `> PR #42 opened against main`
  - Sets `open-pr` → `reviewing`

**Round 5** — Sub-agent calls `vine_next`. `open-pr` dependant (`ci-green`) is ready:

- Housekeeping: marks `typecheck`, `lint`, `format-check`, `test`, `e2e`, `build-vscode`, `open-pr` → `complete`
- Sub-agent for `ci-green`: verifies GitHub Actions pass, sets → `reviewing`

**Rounds 6–7** — `review` picks up, then `pr-ready` closes out. Sub-agent reports `root_status: "complete"`. Orchestrator stops.

---

## Conventions

### Artifacts as Evidence

When a task produces work products, reference them so downstream tasks can consume them:

```
vine_write(file, [{ op: "update", id: "test", decisions: [
    "> All 48 tests passing",
    "> Coverage: 94% lines, 88% branches"
] }])
```

For files, add them as attachment lines in the task description or reference them in decisions.

### Decisions as Breadcrumbs

Every non-trivial choice should be recorded as a `> decision` line:

```
vine_write(file, [{ op: "update", id: "changes", decisions: [
    "> Used getActionableTasks pure function in @bacchus/core",
    "> Kept vine_next read-only for MCP stateless model",
    "> Ref expansion is flagged, not automatic"
] }])
```

These serve as context for upstream tasks and as an audit trail.

### Atomic Progress

- Update the `.vine` file **as you go** — don't batch status changes.
- Set `started` immediately when picking up a task.
- Set `reviewing` as soon as work is complete, before moving on.
- This ensures `vine_next` always reflects the true state of work.

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
  mcp/      — MCP server (stdio, 4 tools + 2 resources, @modelcontextprotocol/sdk)
  cli/      — Command-line interface for .vine files
  ui/       — Browser app for visualization (Svelte + D3)
  vscode/   — VS Code extension (bundles MCP server)

prompts/
  pr-ready.vine  — PR readiness checklist (example executable prompt)

examples/
  *.vine         — Example graphs for testing and demonstration
```

For contributing to the codebase itself, see [CONTRIBUTING.md](CONTRIBUTING.md).
