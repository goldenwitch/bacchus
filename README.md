# graph-viz

A monorepo for parsing, validating, querying, and visualizing task graphs in the [VINE text format](VINE.md).

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

| Function                     | Description                                       |
| ---------------------------- | ------------------------------------------------- |
| `parse(input)`               | Parse `.vine` text into a validated `VineGraph`.  |
| `serialize(graph)`           | Convert a `VineGraph` back to `.vine` text.       |
| `validate(graph)`            | Check structural constraints (throws on failure). |
| `getTask(graph, id)`         | Look up a task by id.                             |
| `getRoot(graph)`             | Get the root task (last in file order).           |
| `getDependencies(graph, id)` | Direct dependencies of a task.                    |
| `getDependants(graph, id)`   | Tasks that depend on the given task.              |
| `getAncestors(graph, id)`    | All transitive dependencies (BFS).                |

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

See [VINE.md](VINE.md) for the full specification.

---

## @bacchus/ui

An interactive browser app for visualizing VINE task graphs. Drop a `.vine` file, paste a URL, or link directly with `?file=<url>`.

### Quick Start

1. **Set up the repo** (if you haven't already — see [Environment Setup](#environment-setup)):

   ```powershell
   git clone <repo> && cd graph-viz && ./setup.ps1
   ```

2. **Start the dev server:**

   ```powershell
   yarn workspace @bacchus/ui dev
   ```

3. **Open** [http://localhost:5173](http://localhost:5173) in your browser.

Drop a `.vine` file onto the landing page or enter a URL to visualize a task graph.

### Examples

The [`examples/`](examples/) folder contains `.vine` files you can drag into the UI to explore different graph shapes:

| File | What it shows |
| ---- | ------------- |
| `01-single-task.vine` | One node, no edges — the simplest graph. |
| `02-linear-chain.vine` | A straight-line dependency chain (5 tasks). |
| `03-diamond.vine` | Two parallel branches merging into one task. |
| `04-all-statuses.vine` | Every status keyword in action. |
| `05-decisions.vine` | Tasks annotated with `>` decision notes. |
| `06-project-bacchus.vine` | A realistic 13-task project graph. |

Start the dev server and drag any file onto the landing page to visualize it.

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
git clone <repo> && cd graph-viz && ./setup.ps1
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
| CI/CD           | GitHub Actions — type-check, lint, test, build on every PR |
| Editor          | VS Code + ZipFS extension + Yarn SDK                       |
