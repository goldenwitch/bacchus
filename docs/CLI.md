# @bacchus/cli

Command-line interface for validating, viewing, listing, adding, and updating tasks in `.vine` files.

## Quick Start

The CLI is not yet published to npm. During development, run it via `tsx`:

```powershell
yarn dlx tsx packages/cli/src/cli.ts <command> [options]
```

All commands take a `.vine` file path as the first positional argument.

---

## Commands

### `vine validate <file>`

Validates a `.vine` file and reports any parse or validation errors.

- Exit code **0** on success, **1** on error.

```powershell
yarn dlx tsx packages/cli/src/cli.ts validate examples/03-diamond.vine
# ✔ valid (4 tasks)

yarn dlx tsx packages/cli/src/cli.ts validate examples/bad.vine
# ✖ VineParseError on line 5: …
```

---

### `vine show <file>`

Displays a summary of the task graph: root task name and ID, total task count, leaf count, and a status breakdown.

```powershell
yarn dlx tsx packages/cli/src/cli.ts show examples/06-project-bacchus.vine
# Root: [bacchus] Project Bacchus
# Tasks: 13  Leaves: 5
# complete: 4  started: 3  planning: 2  notstarted: 3  blocked: 1
```

---

### `vine list <file>`

Lists all tasks in a table with columns **ID**, **NAME**, and **STATUS**.

| Flag                | Description                                                      |
| ------------------- | ---------------------------------------------------------------- |
| `--status <status>` | Filter tasks by status (e.g. `complete`, `blocked`).             |
| `--search <query>`  | Case-insensitive text search across task names and descriptions. |

```powershell
yarn dlx tsx packages/cli/src/cli.ts list examples/04-all-statuses.vine
# ID          NAME              STATUS
# task-a      Alpha Task        complete
# task-b      Beta Task         started
# …

yarn dlx tsx packages/cli/src/cli.ts list examples/06-project-bacchus.vine --status blocked
# ID          NAME              STATUS
# …

yarn dlx tsx packages/cli/src/cli.ts list examples/06-project-bacchus.vine --search "parser"
# ID          NAME              STATUS
# …
```

---

### `vine add <file>`

Adds a new task to a `.vine` file. **Modifies the file in-place.**

| Flag                    | Required | Description                                                                                            |
| ----------------------- | -------- | ------------------------------------------------------------------------------------------------------ |
| `--id <id>`             | Yes      | Unique task identifier.                                                                                |
| `--name <name>`         | Yes      | Short task name.                                                                                       |
| `--status <status>`     | No       | One of `complete`, `started`, `reviewing`, `planning`, `notstarted`, `blocked`. Default: `notstarted`. |
| `--description <text>`  | No       | Task description text.                                                                                 |
| `--depends-on <ids...>` | No       | Space-separated list of dependency task IDs.                                                           |

```powershell
yarn dlx tsx packages/cli/src/cli.ts add examples/03-diamond.vine \
  --id new-task --name "New Task" --status planning \
  --description "A brand-new task." --depends-on left right
```

> **Note:** `add` creates concrete tasks only. To add a reference node linking to an external `.vine` file, use [`add-ref`](#vine-add-ref-file).

---

### `vine status <file> <id> <status>`

Updates a task's status. **Modifies the file in-place.**

Valid statuses: `complete`, `started`, `reviewing`, `planning`, `notstarted`, `blocked`.

```powershell
yarn dlx tsx packages/cli/src/cli.ts status examples/03-diamond.vine left complete
```

> **Note:** Reference nodes have no status. Passing a ref node ID will fail with a validation error — use `vine list` to confirm the node type first.

---

### `vine add-ref <file>`

Adds a reference node to a `.vine` file. Reference nodes are proxies for external `.vine` files. **Modifies the file in-place.**

| Flag                    | Required | Description                                                   |
| ----------------------- | -------- | ------------------------------------------------------------- |
| `--id <id>`             | Yes      | Unique reference node identifier.                             |
| `--name <name>`         | Yes      | Short display name for the ref node.                          |
| `--vine <uri>`          | Yes      | URI of the external `.vine` file (relative or absolute path). |
| `--description <text>`  | No       | Description text.                                             |
| `--depends-on <ids...>` | No       | Space-separated list of dependency task IDs.                  |

```powershell
yarn dlx tsx packages/cli/src/cli.ts add-ref examples/03-diamond.vine \
  --id sub --name "Sub Project" --vine ./sub-project.vine
```

**Error handling:**

- Invalid ID format → error (must be alphanumeric, hyphens, and optional slash-separated segments)
- Missing required flags (`--id`, `--name`, `--vine`) → usage error from Commander
- File not found → `ENOENT` error

---

## Error Handling

All commands surface typed errors from `@bacchus/core`:

| Error                     | Details                                                                                                                               |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| **`VineParseError`**      | Syntax issue. The `.line` property contains the 1-based line number where the error occurred.                                         |
| **`VineValidationError`** | Structural constraint violation. Check `.constraint` and `.details` for specifics (e.g. duplicate IDs, missing dependencies, cycles). |

Both extend `VineError` and print a human-readable message to stderr.

---

## Notes

- The `add` and `status` commands parse the file, apply the mutation, re-serialize, and write back. The output is normalized `.vine` text—formatting may change slightly.
- Task IDs must be unique within a file. Attempting to add a duplicate ID will fail with a validation error.
- **Slash-separated IDs (v1.1.0):** Task IDs now support slash-separated segments (e.g., `ds/components`, `auth/login`). This is used by the expansion system to namespace child-graph IDs but is also valid in manually authored files. The `add` command's `--id` flag accepts these IDs.
- Dependency IDs passed to `--depends-on` must reference tasks that already exist in the file.
- Attachments (`@artifact`, `@guidance`, `@file` lines) are fully supported in the `.vine` format and are preserved during `add` and `status` mutations, but there is currently no CLI command for adding or managing attachments directly. Use the Chat Planner UI or edit the file manually.
