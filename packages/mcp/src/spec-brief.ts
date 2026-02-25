/**
 * Brief VINE specification text served as an MCP resource.
 */
export const SPEC_BRIEF = `\
# VINE Brief Specification & Execution Guide

## What is a .vine file?

A \`.vine\` file is a plain-text, line-oriented format describing a directed acyclic graph (DAG) of tasks. It is hand-authorable, trivially parseable, and diffable in version control.

## File Structure

Three regions:

1. **Preamble** — magic line + optional metadata, terminated by \`---\`
2. **Node blocks** — one or more, separated by the delimiter
3. **Root convention** — the first block is the graph root

### Preamble

\`\`\`
vine 1.2.0                    <- magic line (required, must be first line)
title: My Project Plan        <- metadata (optional)
prefix: my-proj               <- metadata (optional, used during expansion)
delimiter: ===                <- metadata (optional, default: ---)
---                           <- preamble terminator (always ---)
\`\`\`

| Key         | Required | Default | Description                                             |
| ----------- | -------- | ------- | ------------------------------------------------------- |
| \`title\`     | no       | —       | Human-readable name for the graph                       |
| \`delimiter\` | no       | \`---\`   | String used to separate node blocks                     |
| \`prefix\`    | no       | —       | ID namespace prefix used when inlined into a parent     |

The preamble terminator is always \`---\` (even with a custom delimiter).

## Task Blocks

### Header

\`\`\`
[id] Short Name (status) [@key(values) ...]
\`\`\`

- **id**: \`[a-zA-Z0-9-]+\` segments joined by \`/\`, enclosed in \`[]\`, unique within file
- **Short Name**: free text between \`]\` and \`(\`
- **status**: one of the 6 status keywords (see below)
- **annotations**: optional trailing \`@key(value,...)\` clauses (e.g. \`@sprite(./icon.svg)\`)

### Body Lines (prefix-priority dispatch — first match wins)

| Priority | Prefix        | Meaning      | Example                                            |
| -------- | ------------- | ------------ | -------------------------------------------------- |
| 1        | \`-> \`         | Dependency   | \`-> setup-db\`                                      |
| 2        | \`> \`          | Decision     | \`> Use PostgreSQL over SQLite\`                     |
| 3        | \`@artifact \`  | Artifact     | \`@artifact application/pdf https://example.com/r\`  |
| 4        | \`@guidance \`  | Guidance     | \`@guidance text/markdown https://example.com/g.md\` |
| 5        | \`@file \`      | File         | \`@file image/png https://example.com/sketch.png\`   |
| 6        | _(none)_      | Description  | \`Build the authentication flow.\`                   |

Attachment format: \`@<class> <mime-type> <uri>\`

## Reference Blocks

A reference block is a proxy for an external \`.vine\` graph.

### Header

\`\`\`
ref [id] Short Name (URI) [@key(values) ...]
\`\`\`

- **URI**: non-whitespace printable ASCII, points to a \`.vine\` file
- Same ID rules as task blocks

### Body Lines

Same as task blocks except **no attachments allowed**:

| Allowed | Prefix   | Meaning     |
| ------- | -------- | ----------- |
| Yes     | \`-> \`    | Dependency  |
| Yes     | \`> \`     | Decision    |
| Yes     | _(none)_ | Description |
| No      | \`@*\`     | Attachment  |

## Status Keywords

| Keyword      | Meaning                                               |
| ------------ | ----------------------------------------------------- |
| \`complete\`   | Finished — 100% done                                  |
| \`started\`    | Implementation in progress                            |
| \`reviewing\`  | Work believed complete, pending review by dependants  |
| \`planning\`   | Planning started but work not yet begun               |
| \`notstarted\` | Ready to begin or waiting for dependencies            |
| \`blocked\`    | Needs intervention to resume                          |

## Constraints

A valid \`.vine\` file must satisfy all of:

1. **At least one block** — the file must contain one or more node blocks
2. **Unique IDs** — no two blocks may share the same id
3. **Valid dependency refs** — every \`-> <id>\` must reference an id in the file
4. **No cycles** — the dependency graph must be a DAG
5. **No islands** — every node must be reachable from the root
6. **Reference URI required** — ref headers must include a URI
7. **No attachments on references** — ref blocks must not contain attachment lines

## Status Lifecycle

\`\`\`
notstarted -> started -> reviewing -> complete
     |
     +-> planning --------+
              |            |
              +-> blocked  +-> reviewing -> complete
\`\`\`

- \`reviewing\` satisfies downstream dependencies (dependants can start)
- \`complete\` means dependants have consumed the output

## Orchestration Loop (Contextless Execution)

The orchestrator never calls VINE tools directly. Instead, it dispatches sub-agents who interact with the \`.vine\` file autonomously. This preserves the orchestrator's context for planning.

### Orchestrator Loop

\`\`\`
1. Dispatch a sub-agent with the .vine file path
2. Sub-agent calls vine_next, handles housekeeping, picks up one task, does the work
3. Sub-agent reports back: { task_completed, decisions, progress, ready_count }
4. If root_status == "complete" → done
5. If ready_count > 1 → dispatch multiple sub-agents in parallel
6. If blocked → escalate to human or retry
7. Repeat
\`\`\`

### Sub-Agent Workflow

Each sub-agent runs this sequence autonomously:

\`\`\`
1. Call vine_next to get the execution frontier
2. Handle needs_expansion: call vine_expand for each ref node, then re-call vine_next
3. Handle ready_to_complete: mark each as complete via vine_write
4. Pick ONE task from ready_to_start
5. Claim it (set_status started), read context (vine_read)
6. Do the work described in the task
7. Record decisions via vine_write, set_status reviewing
8. Call vine_next for fresh progress, report back to orchestrator
\`\`\`

### vine_next Response

| Field               | Description                                                                    |
| ------------------- | ------------------------------------------------------------------------------ |
| \`ready_to_start\`    | Tasks with deps satisfied, status notstarted/planning — pick these up          |
| \`ready_to_complete\` | Reviewing tasks where a dependant has started consuming — mark complete         |
| \`needs_expansion\`   | Ref nodes on frontier — expand before inner tasks become visible               |
| \`progress\`          | \`{ total, complete, percentage, root_id, root_status, by_status }\`             |

### The reviewing -> complete handoff

1. Leaf finishes work -> moves to \`reviewing\`
2. \`vine_next\` sees dependants can now start (reviewing satisfies deps)
3. Dependant starts, reads leaf's output, sets itself to \`started\`
4. Next \`vine_next\` call: leaf appears in \`ready_to_complete\`
5. Orchestrator marks leaf \`complete\`

## MCP Tool Reference

### vine_read

Read tasks from a \`.vine\` file. Accepts optional filters.

| Parameter | Type   | Required | Description                                                      |
| --------- | ------ | -------- | ---------------------------------------------------------------- |
| \`file\`    | string | yes      | Path to the .vine file                                           |
| \`action\`  | string | yes      | One of: summary, list, task, descendants, search, refs, validate |
| \`id\`      | string | no       | Task ID (required for task and descendants actions)              |
| \`status\`  | string | no       | Status filter (for list action)                                  |
| \`query\`   | string | no       | Search query (for list or search actions)                        |

The \`action\` parameter selects the query type. Use \`summary\` for orientation, \`list\` for browsing, \`task\` for deep detail on one task, etc.

### vine_next

Return the execution frontier. No parameters beyond \`file\`. Returns \`ready_to_start\`, \`ready_to_complete\`, \`needs_expansion\`, and \`progress\`.

| Parameter | Type   | Required | Description            |
| --------- | ------ | -------- | ---------------------- |
| \`file\`    | string | yes      | Path to the .vine file |

### vine_write

Batch-write mutations to a \`.vine\` file. Takes an array of operations applied atomically (validated once at end). This is the single tool for all graph mutations.

| Parameter    | Type   | Required | Description                    |
| ------------ | ------ | -------- | ------------------------------ |
| \`file\`       | string | yes      | Path to the .vine file         |
| \`operations\` | array  | yes      | Array of operation objects     |

#### Operation Types

| Operation          | Fields                                     | Description                    |
| ------------------ | ------------------------------------------ | ------------------------------ |
| \`set_status\`       | \`id\`, \`status\`                             | Update a task's status         |
| \`update\`           | \`id\`, \`name?\`, \`description?\`, \`decisions?\` | Update task fields             |
| \`add_task\`         | \`id\`, \`name\`, \`status?\`, \`description?\`, \`dependsOn?\` | Add a new task     |
| \`remove_task\`      | \`id\`                                       | Remove a task and its edges    |
| \`add_dep\`          | \`taskId\`, \`depId\`                          | Add a dependency edge          |
| \`remove_dep\`       | \`taskId\`, \`depId\`                          | Remove a dependency edge       |
| \`add_ref\`          | \`id\`, \`name\`, \`vine\`, \`description?\`, \`dependsOn?\` | Add a reference node |
| \`update_ref_uri\`   | \`id\`, \`uri\`                                | Update a ref node's URI        |

All operations are applied in order. The file is validated once after all operations, then written to disk.

### vine_expand

Expand a reference node by inlining an external \`.vine\` graph.

| Parameter    | Type   | Required | Description                              |
| ------------ | ------ | -------- | ---------------------------------------- |
| \`file\`       | string | yes      | Path to the parent .vine file            |
| \`ref_id\`     | string | yes      | ID of the reference node to expand       |
| \`child_file\` | string | yes      | Path to the child .vine file to inline   |

### Resources

Two MCP resources are available:
- \`vine://spec/brief\` — This condensed spec and execution guide.
- \`vine://spec/full\` — The complete VINE v1.2.0 specification with ABNF grammar, parsing algorithm, serialization rules, and expansion semantics.
`;
