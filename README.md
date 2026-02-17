# Bacchus

[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![CI](https://github.com/goldenwitch/bacchus/actions/workflows/ci.yml/badge.svg)](https://github.com/goldenwitch/bacchus/actions/workflows/ci.yml)

A tool for parsing, validating, querying, and visualizing task graphs in the [VINE text format](docs/VINE.md).

**Live at [grapesofgraph.com](https://grapesofgraph.com)** — automatically deployed on every push to `main`.

## @bacchus/core

### Quick Start

```ts
import { parse, getRoot, getDependencies, serialize } from '@bacchus/core';

const graph = parse(`
[leaf] Leaf Task (complete)
A simple leaf task.

[root] Main Project (started)
The root task depends on leaf.
-> leaf
`);

const root = getRoot(graph); // Task { id: 'root', status: 'started', … }
const deps = getDependencies(graph, 'root'); // [Task { id: 'leaf', … }]
const text = serialize(graph); // normalized .vine output
```

### API

| Function                                 | Description                                       |
| ---------------------------------------- | ------------------------------------------------- |
| `parse(input)`                           | Parse `.vine` text into a validated `VineGraph`.  |
| `serialize(graph)`                       | Convert a `VineGraph` back to `.vine` text.       |
| `validate(graph)`                        | Check structural constraints (throws on failure). |
| `getTask(graph, id)`                     | Look up a task by id.                             |
| `getRoot(graph)`                         | Get the root task (last in file order).           |
| `getDependencies(graph, id)`             | Direct dependencies of a task.                    |
| `getDependants(graph, id)`               | Tasks that depend on the given task.              |
| `getAncestors(graph, id)`                | All transitive dependencies (BFS).                |
| **Mutations**                            |                                                   |
| `addTask(graph, task)`                   | Add a new task (returns new graph).               |
| `removeTask(graph, id)`                  | Remove a task and clean up references.            |
| `setStatus(graph, id, status)`           | Change a task's status.                           |
| `updateTask(graph, id, fields)`          | Update task name/description/decisions.           |
| `addDependency(graph, taskId, depId)`    | Add a dependency edge.                            |
| `removeDependency(graph, taskId, depId)` | Remove a dependency edge.                         |
| **Search & Filter**                      |                                                   |
| `filterByStatus(graph, status)`          | Tasks matching a given status.                    |
| `searchTasks(graph, query)`              | Case-insensitive text search.                     |
| `getLeaves(graph)`                       | Tasks with no dependencies.                       |
| `getDescendants(graph, id)`              | All tasks transitively depending on a task.       |
| `getSummary(graph)`                      | Aggregate stats (totals, status counts, root).    |

### Error Handling

`parse` and `validate` throw typed errors:

- **`VineParseError`** — syntax issue; check `.line` for the 1-based line number.
- **`VineValidationError`** — structural constraint violation; check `.constraint` and `.details`.

Both extend `VineError`.

### VINE Format

- **Header**: `[id] Short Name (status)` — status is one of `complete`, `notstarted`, `planning`, `blocked`, `started`
- **Description**: plain lines (no prefix) — joined with spaces
- **Dependency**: `-> other-id`
- **Decision**: `> Note text`
- **Root**: the last task in the file

See [VINE.md](docs/VINE.md) for the full specification.

---

## @bacchus/cli

Command-line interface for validating, viewing, listing, adding, and updating tasks in `.vine` files. Currently in development—run via `tsx`:

```powershell
yarn dlx tsx packages/cli/src/cli.ts <command> [options]
```

### Commands

| Command                            | Description                                                                          |
| ---------------------------------- | ------------------------------------------------------------------------------------ |
| `vine validate <file>`             | Check a `.vine` file for parse/validation errors.                                    |
| `vine show <file>`                 | Print a graph summary (root, task count, status breakdown).                          |
| `vine list <file>`                 | List all tasks. Supports `--status` and `--search` filters.                          |
| `vine add <file>`                  | Add a task (`--id`, `--name`, optional `--status`, `--description`, `--depends-on`). |
| `vine status <file> <id> <status>` | Update a task's status.                                                              |

### Examples

```powershell
# Validate a file
yarn dlx tsx packages/cli/src/cli.ts validate examples/03-diamond.vine

# Show graph summary
yarn dlx tsx packages/cli/src/cli.ts show examples/06-project-bacchus.vine

# List only blocked tasks
yarn dlx tsx packages/cli/src/cli.ts list examples/06-project-bacchus.vine --status blocked

# Add a new task
yarn dlx tsx packages/cli/src/cli.ts add examples/03-diamond.vine --id new-task --name "New Task"

# Mark a task complete
yarn dlx tsx packages/cli/src/cli.ts status examples/03-diamond.vine left complete
```

See [CLI.md](docs/CLI.md) for full documentation.

---

## @bacchus/ui

An interactive browser app for visualizing VINE task graphs. Drop a `.vine` file, paste a URL, or link directly with `?file=<url>`.

### Quick Start

1. **Set up the repo** (if you haven't already — see [Environment Setup](#environment-setup)):

   ```powershell
   git clone https://github.com/goldenwitch/bacchus && cd bacchus && ./setup.ps1
   ```

2. **Start the dev server:**

   ```powershell
   yarn workspace @bacchus/ui dev
   ```

3. **Open** [http://localhost:5173](http://localhost:5173) in your browser.

Drop a `.vine` file onto the landing page or enter a URL to visualize a task graph.

### Examples

The [`examples/`](examples/) folder contains `.vine` files you can drag into the UI to explore different graph shapes:

| File                      | What it shows                                |
| ------------------------- | -------------------------------------------- |
| `01-single-task.vine`     | One node, no edges — the simplest graph.     |
| `02-linear-chain.vine`    | A straight-line dependency chain (5 tasks).  |
| `03-diamond.vine`         | Two parallel branches merging into one task. |
| `04-all-statuses.vine`    | Every status keyword in action.              |
| `05-decisions.vine`       | Tasks annotated with `>` decision notes.     |
| `06-project-bacchus.vine` | A realistic 13-task project graph.           |

Start the dev server and drag any file onto the landing page to visualize it.

### Chat Planner

The UI includes an AI-powered chat panel for creating and editing task graphs through conversation:

1. Click the **chat bubble** icon in the toolbar (or **"Plan with AI"** on the landing screen)
2. Enter your **Anthropic API key** when prompted (stored locally, never sent to our servers)
3. Describe the plan you'd like to create — e.g., _"Create a project plan for launching a mobile app"_
4. The AI uses structured tool calls to manipulate the graph with validated mutations
5. Changes appear live in the visualization as the AI works

The chat planner uses Claude (Opus 4.6) via the Anthropic Messages API with streaming and tool-use. The LLM interface is abstracted behind a `ChatService` interface for future provider swaps.

### Commands

| Command                              | Description                  |
| ------------------------------------ | ---------------------------- |
| `yarn workspace @bacchus/ui dev`     | Start the Vite dev server    |
| `yarn workspace @bacchus/ui build`   | Production build             |
| `yarn workspace @bacchus/ui preview` | Preview the production build |
| `yarn test`                          | Run all tests (core + UI)    |
| `yarn test:coverage`                 | Run tests with coverage      |
| `yarn lint`                          | Lint all packages            |
| `yarn typecheck`                     | Type-check all packages      |
| `yarn format`                        | Format all files             |

---

## Development

> **⚠️ Do not use npm.** This project uses **Yarn 4 (Berry)** exclusively via Corepack. Running `npm install` will break PnP dependency resolution.

### Prerequisites

- **Node.js** >= 22.x LTS ([download](https://nodejs.org))
- **Corepack** (ships with Node.js)
- **Git** (required for Husky hooks)

### Environment Setup

```powershell
git clone https://github.com/goldenwitch/bacchus && cd bacchus && ./setup.ps1
```

The idempotent `setup.ps1` script handles everything:

| Step          | What it does                                                                    |
| ------------- | ------------------------------------------------------------------------------- |
| Node.js check | Verifies Node.js >= 22 is installed                                             |
| Corepack      | Enables Corepack (ships with Node.js, manages Yarn)                             |
| Yarn          | Prepares Yarn 4 via Corepack using the `packageManager` field in `package.json` |
| Dependencies  | Runs `yarn install` (all workspace packages, PnP mode)                          |
| VS Code SDK   | Runs `yarn dlx @yarnpkg/sdks vscode` for PnP editor support                     |
| Husky         | Initializes Git hooks (auto-format, lint, type-check on commit)                 |

Safe to re-run at any time.

### Tooling

| Area            | Stack                                                      |
| --------------- | ---------------------------------------------------------- |
| Package manager | Yarn 4 (Berry), PnP mode, workspaces                       |
| Language        | TypeScript 5.x, strict mode, zero `any`                    |
| Linting         | ESLint + @typescript-eslint (strict preset)                |
| Formatting      | Prettier                                                   |
| Testing         | Vitest (>90% line coverage target)                         |
| Build           | tsc (type-check only), Vite (UI), ESM-only                 |
| Pre-commit      | Husky + lint-staged                                        |
| CI/CD           | GitHub Actions — type-check, lint, test, build, deploy     |
| Hosting         | Cloudflare Pages — https://grapesofgraph.com               |
| Editor          | VS Code + ZipFS extension + Yarn SDK                       |
