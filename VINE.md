# VINE Format Specification

Version: 0.1

## Overview

A `.vine` file is a plain-text, line-oriented format for describing a task graph. It is designed to be hand-authored, trivially parseable, and diffable in version control.

## Structure

A `.vine` file is a sequence of **task blocks** separated by one or more blank lines. A **blank line** is any line that is empty or contains only whitespace.

Each task block consists of:

1. **Header line** (required, exactly one)
2. **Body lines** (optional, zero or more)

### Header Line

```
[id] Short Name (status)
```

| Component    | Rules                                                                             |
| ------------ | --------------------------------------------------------------------------------- |
| `id`         | Enclosed in `[ ]`. Alphanumeric and hyphens only. Must be unique within the file. |
| `Short Name` | Free text between `]` and `(`. Leading/trailing whitespace trimmed.               |
| `status`     | Enclosed in `( )` at end of line. One of the status keywords below.               |

### Status Keywords

| Keyword      | Meaning                                            |
| ------------ | -------------------------------------------------- |
| `complete`   | Complete — 100% finished                           |
| `notstarted` | Not Started — planning complete, work not begun    |
| `planning`   | Planned — planning started but incomplete          |
| `blocked`    | Blocked — needs intervention to resume             |
| `started`    | Started — implementation in progress, not complete |

### Body Lines

Body lines follow the header and are distinguished by their prefix:

| Prefix        | Meaning                                                                                            | Example                          |
| ------------- | -------------------------------------------------------------------------------------------------- | -------------------------------- |
| `->`          | **Dependency.** Value is the `id` of another task this task depends on. One per line.              | `-> setup-db`                    |
| `>`           | **Decision.** A recorded decision or open question relevant to the task.                           | `> Use PostgreSQL over SQLite`   |
| _(no prefix)_ | **Description.** Free-form text describing the task. Multiple lines are concatenated with a space. | `Build the authentication flow.` |

## Ordering

Tasks are listed in their **default completion order** — the order a reader should expect to tackle them. This is advisory; the dependency graph is the source of truth for what can run in parallel or must be sequenced.

## Minimal Example

```vine
[vine-format] Define VINE Format (complete)
Specify the .vine file format.
> Keep it line-oriented, no nesting.

[vine-ts] VINE TypeScript Library (started)
Parse and validate .vine files.
-> vine-format

[build-ui] Build Graph Visualizer (notstarted)
Render the task graph with d3-force.
-> vine-ts

[graph-cli] Graph Interface (planning)
CLI for pulling, creating, and updating work.
-> vine-ts
-> build-ui

[root] Project Bacchus (started)
Build a graph of tasks and visualize them as a vine.
-> vine-format
-> vine-ts
-> build-ui
-> graph-cli
```

## Parsing Algorithm

```
1. Split file into blocks on blank lines.
2. For each block:
   a. First line is the header — extract id, short name, status via regex:
      ^\[([a-zA-Z0-9-]+)\]\s+(.+?)\s+\((complete|notstarted|planning|blocked|started)\)$
   b. Remaining lines, by prefix:
      - Starts with "-> " → dependency (trim prefix, value is target id)
      - Starts with "> "  → decision  (trim prefix, rest is text)
      - Otherwise          → description (append to description text)
3. Validate: every dependency id must reference an existing task id.
```

## Constraints

- A file **must** contain at least one task.
- Task ids **must** be unique.
- Dependency references **must** point to an id defined in the same file.
- Circular dependencies are **not** allowed.
- There **must** be no islands — every task must ultimately be a dependency of the root task.
