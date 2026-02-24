# Using VINE Files as Task Lists

A `.vine` file is a plain-text task graph — think of it as a dependency-aware
to-do list that AI assistants can read **and** write.

This guide explains how to use VINE files as living task lists inside VS Code
with the **Bacchus VINE** extension.

---

## 1. Create a `.vine` file

Every VINE file starts with a version line, an optional title, and a `---`
separator. Then list your tasks as blocks:

```
vine 1.0.0
title: My Sprint
---
[root] Sprint 12 (started)
Ship the new dashboard widget.
-> backend
-> frontend
-> qa
---
[backend] API Endpoints (started)
Implement /widgets and /widgets/:id.
---
[frontend] Dashboard Widget (notstarted)
React component that consumes the API.
-> backend
---
[qa] QA & Sign-off (notstarted)
Manual test pass + stakeholder demo.
-> frontend
```

**Key concepts:**

| Syntax                 | Meaning                                                                        |
| ---------------------- | ------------------------------------------------------------------------------ |
| `[id]`                 | Unique identifier for the task                                                 |
| `Name`                 | Short human-readable name                                                      |
| `(status)`             | One of `complete`, `started`, `reviewing`, `planning`, `notstarted`, `blocked` |
| `-> dep-id`            | This task depends on `dep-id` (arrow points toward the dependency)             |
| `> text`               | A decision or note attached to the task                                        |
| Lines after the header | Free-form description                                                          |

The **first block** is always the root of the graph.

---

## 2. Open the file in VS Code

With the Bacchus VINE extension installed, simply open any `.vine` file. The
extension registers an MCP server that exposes 17 tools to your AI assistant
(GitHub Copilot, Claude, etc.), letting it read and modify the graph on your
behalf.

---

## 3. Talk to your assistant

Once the MCP server is active, ask your AI assistant to work with the file
using natural language. The assistant will call the right tools automatically.

### Orientation — understand the graph

| What you want              | What to say                           | Tool the assistant calls         |
| -------------------------- | ------------------------------------- | -------------------------------- |
| See the big picture        | _"Summarize my sprint plan"_          | `vine_show`                      |
| List all tasks             | _"What tasks are in the backlog?"_    | `vine_list`                      |
| Filter by status           | _"Show me everything that's blocked"_ | `vine_list` (with status filter) |
| Find something             | _"Which tasks mention the API?"_      | `vine_search`                    |
| Inspect one task           | _"Tell me about the frontend task"_   | `vine_get_task`                  |
| See what's downstream      | _"What depends on the backend task?"_ | `vine_get_descendants`           |
| Check for errors           | _"Is my vine file valid?"_            | `vine_validate`                  |
| See the execution frontier | _"What tasks can I start next?"_      | `vine_next_tasks`                |

### Work — change the graph

| What you want        | What to say                                           | Tool the assistant calls |
| -------------------- | ----------------------------------------------------- | ------------------------ |
| Add a task           | _"Add a 'Deploy to staging' task that depends on qa"_ | `vine_add_task`          |
| Remove a task        | _"Remove the qa task"_                                | `vine_remove_task`       |
| Update a status      | _"Mark backend as complete"_                          | `vine_set_status`        |
| Rename / re-describe | _"Rename frontend to 'Dashboard UI'"_                 | `vine_update_task`       |
| Add a dependency     | _"Make deploy depend on frontend too"_                | `vine_add_dependency`    |
| Remove a dependency  | _"Remove the dependency from qa to frontend"_         | `vine_remove_dependency` |

### References — compose graphs from external `.vine` files

| What you want      | What to say                              | Tool the assistant calls |
| ------------------ | ---------------------------------------- | ------------------------ |
| Add a reference    | _"Add a ref to infrastructure.vine"_     | `vine_add_ref`           |
| Expand a reference | _"Inline the infra ref"_                 | `vine_expand_ref`        |
| Update a ref's URI | _"Point the infra ref to infra-v2.vine"_ | `vine_update_ref_uri`    |
| List all refs      | _"Which refs does this graph have?"_     | `vine_get_refs`          |

> **Tip:** Every mutation tool writes the file back to disk automatically —
> your `.vine` file stays in sync.

---

## 4. Statuses as workflow stages

Use statuses to track progress through your workflow:

| Status       | Emoji | Meaning                                         |
| ------------ | ----- | ----------------------------------------------- |
| `notstarted` | ⚪    | Queued, not yet picked up                       |
| `planning`   | 🟣    | Being scoped or designed                        |
| `started`    | 🟡    | Actively in progress                            |
| `reviewing`  | 🟠    | Done, awaiting review or feedback               |
| `complete`   | 🟢    | Finished and accepted                           |
| `blocked`    | 🔴    | Cannot proceed — dependency or external blocker |

A typical flow: `notstarted` → `planning` → `started` → `reviewing` → `complete`.

Ask your assistant to transition tasks: _"I've finished the API — mark backend
as reviewing and start frontend."_

---

## 5. Dependencies keep you honest

Dependencies (`-> id`) form a directed acyclic graph (DAG). They answer:

- **What can I work on next?** — Tasks whose dependencies are all `complete`.
- **What's blocking me?** — Follow the `->` arrows from a `blocked` task.
- **What's the impact of a delay?** — Use `vine_get_descendants` to see
  everything downstream.

The validator (`vine_validate`) catches cycles and dangling references, so you
can't wire yourself into an impossible plan.

---

## 6. Decisions and notes

Use `>` lines to record decisions, context, or rationale:

```
[auth] Authentication (planning)
Support OAuth2 and API keys.
> Chose OAuth2 code flow over implicit — better security for server apps.
> API keys are for CI/CD only, not end users.
```

These are preserved across all tool mutations and serve as a lightweight
decision log.

---

## Quick reference

```
vine 1.0.0
title: <graph title>
---
[<id>] <Name> (<status>)
<description>
> <decision>
-> <dependency-id>
```

That's it — a plain text file that both humans and AI can work with fluently.
