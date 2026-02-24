# VINE TypeScript Library — Design Specification

Version: 1.2.0
Package: `@bacchus/core` (`packages/core/`)

## Overview

`@bacchus/core` is an ESM-only TypeScript library that parses `.vine` text into a typed, immutable task graph, validates all spec constraints, serializes back to `.vine` text, and exposes query helpers for consumers (visualizer, future CLI).

### Design Decisions

| Decision            | Choice                     | Rationale                                                                                              |
| ------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------ |
| Immutability        | **Readonly types**         | `VineGraph` and `Task` are deeply readonly. Consumers receive values they cannot accidentally corrupt. |
| Error style         | **Throw typed exceptions** | Parse and validation failures throw typed errors — no Result wrapper.                                  |
| Root identification | **First task in file**     | The first task in file order is always the root.                                                       |
| Version detection   | **Magic line**             | `vine <version>` on the first line enables version-specific parser dispatch.                           |

---

## Types — `src/types.ts`

### `Status`

```ts
type Status =
  | 'complete'
  | 'started'
  | 'reviewing'
  | 'planning'
  | 'notstarted'
  | 'blocked';
```

`VALID_STATUSES` is a `ReadonlySet<string>` containing all six values, used by the parser/validator.

### `AttachmentClass` & `Attachment`

```ts
type AttachmentClass = 'artifact' | 'guidance' | 'file';

interface Attachment {
  readonly class: AttachmentClass;
  readonly mime: string;
  readonly uri: string;
}
```

### `Task` (discriminated union)

```ts
// Fields shared by both concrete tasks and reference nodes.
interface BaseNode {
  readonly id: string;
  readonly shortName: string;
  readonly description: string;
  readonly dependencies: readonly string[];
  readonly decisions: readonly string[];
  readonly annotations: ReadonlyMap<string, readonly string[]>;
}

interface ConcreteTask extends BaseNode {
  readonly kind: 'task';
  readonly status: Status;
  readonly attachments: readonly Attachment[];
}

interface RefTask extends BaseNode {
  readonly kind: 'ref';
  readonly vine: string;
}

type Task = ConcreteTask | RefTask;
```

### `VineGraph`

```ts
interface VineGraph {
  readonly tasks: ReadonlyMap<string, Task>;
  readonly order: readonly string[]; // task ids in file order; first element is always root
  readonly version: string; // e.g. '1.1.0'
  readonly title: string | undefined; // from preamble title: metadata
  readonly delimiter: string; // block delimiter, default '---'
  readonly prefix: string | undefined; // controls ID namespacing during expansion
}
```

**Field notes (v1.1.0):**

- `kind` — discriminator field. `'task'` for concrete tasks, `'ref'` for reference nodes. Narrow via `task.kind === 'task'` before accessing `status`/`attachments`, or `task.kind === 'ref'` before accessing `vine`.
- `status` — only on `ConcreteTask`. One of the six status keywords.
- `attachments` — only on `ConcreteTask`. Resource attachments.
- `vine` — only on `RefTask`. URI pointing to the child `.vine` file.
- `id` — now supports slash-separated segments (e.g. `ds/components`) to accommodate prefixed IDs from expansion.
- `annotations` — a `ReadonlyMap<string, readonly string[]>` of header annotations (v1.2.0). The key is the annotation name (e.g. `sprite`), values are the comma-separated args. Empty for pre-v1.2.0 files. The helper `getSpriteUri(task)` returns the first value of the `sprite` annotation, if present.

### `GraphSummary`

```ts
interface GraphSummary {
  readonly total: number;
  readonly byStatus: Record<Status, number>;
  readonly rootId: string;
  readonly rootName: string;
  readonly leafCount: number;
}
```

`getSummary(graph)` returns a `GraphSummary` with aggregate stats. All six status keys are present in `byStatus` (initialized to 0).

---

## Errors — `src/errors.ts`

All errors extend a base `VineError`:

### `VineError`

```ts
class VineError extends Error {
  readonly name = 'VineError';
}
```

### `VineParseError`

Thrown when the parser encounters a syntax issue (malformed header, empty file, unknown status keyword).

```ts
class VineParseError extends VineError {
  readonly name = 'VineParseError';
  readonly line: number; // 1-based line number in the source text
}
```

### `VineValidationError`

Thrown when a structural constraint is violated.

```ts
class VineValidationError extends VineError {
  readonly name = 'VineValidationError';
  readonly constraint: ValidationConstraint;
  readonly details: ValidationDetails;
}

type ValidationConstraint =
  | 'at-least-one-task'
  | 'valid-dependency-refs'
  | 'no-cycles'
  | 'no-islands'
  | 'ref-uri-required';

type ValidationDetails =
  | { constraint: 'at-least-one-task' }
  | { constraint: 'valid-dependency-refs'; taskId: string; missingDep: string }
  | { constraint: 'no-cycles'; cycle: string[] }
  | { constraint: 'no-islands'; islandTaskIds: string[] }
  | { constraint: 'ref-uri-required'; taskId: string };
```

---

## Parser — `src/parser.ts`

### Entry Point

```ts
function parse(input: string): VineGraph;
```

Parses a `.vine` string into a validated `VineGraph`. Throws `VineParseError` on syntax errors and `VineValidationError` on constraint violations.

### Algorithm

1. **Magic line detection**: The first line must be `vine <version>` (e.g. `vine 1.1.0`). Extract the version string. Throw `VineParseError` if the magic line is missing or malformed.
2. **Preamble parsing**: Lines between the magic line and the first `---` delimiter are preamble metadata. Parse `key: value` pairs (e.g. `title: My Project`, `delimiter: ===`, `prefix: ds`). The `---` terminator is consumed. The `prefix` metadata is stored on `VineGraph.prefix`.
3. **Block splitting**: Split the remaining text on the delimiter (default `---`). Trim whitespace, discard empty blocks.
4. **For each block**:
   a. The first line is either a **task header** or a **reference node header**.
   - **Task header**: `[id] Short Name (status)` — extract `id`, `shortName`, and `status` via the spec regex:
     ```
     ^\[([a-zA-Z0-9/-]+)\]\s+(.+?)\s+\((complete|started|reviewing|planning|notstarted|blocked)\)$
     ```
   - **Reference node header** (v1.1.0): `ref [id] Name (URI)` — extract `id`, `shortName`, and `vine` URI. The task's `status` is set to `undefined`.
   - IDs may contain slash-separated segments (e.g. `ds/components`).
     Throw `VineParseError` if neither pattern matches.
     b. Classify remaining **body lines** by prefix:
   - `-> ` → dependency (trim prefix, value is target task id)
   - `> ` → decision (trim prefix, rest is text)
   - `@artifact ` → attachment with class `artifact` (parse `<mime> <uri>`)
   - `@guidance ` → attachment with class `guidance` (parse `<mime> <uri>`)
   - `@file ` → attachment with class `file` (parse `<mime> <uri>`)
   - otherwise → description line
     c. Join consecutive description lines with `\n` (newlines preserved).
5. **Build** a `Task` per block (including `attachments` array). Collect into a `Map<string, Task>` keyed by id.
   - On duplicate id insertion, throw `VineParseError`.
6. **Preserve** insertion order as the `order` array.
7. **Build `VineGraph`** with `version`, `title`, `delimiter`, and `prefix` from the preamble.
8. **Validate** by calling `validate()` — parser always returns a valid graph or throws.

### Edge Cases

- Leading/trailing whitespace in the file is ignored.
- An empty or whitespace-only file throws `VineParseError` (no magic line found).
- Files without a valid magic line are rejected.
- Multi-line descriptions are joined with `\n` — intentional line breaks in the source are preserved.

---

## Validator — `src/validator.ts`

### Entry Point

```ts
function validate(graph: VineGraph): void;
```

Throws `VineValidationError` on the first constraint violation found.

### Constraints (checked in order)

| #   | Constraint            | Check                                                                                                      | Error `constraint` value  |
| --- | --------------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------- |
| 1   | At least one task     | `graph.tasks.size >= 1`                                                                                    | `'at-least-one-task'`     |
| 2   | Valid dependency refs | Every `task.dependencies[i]` exists as a key in `graph.tasks`                                              | `'valid-dependency-refs'` |
| 3   | No cycles             | DFS-based cycle detection across the full dependency graph                                                 | `'no-cycles'`             |
| 4   | No islands            | BFS/DFS from root (first id in `order`) following **reverse** dependency edges; every task must be visited | `'no-islands'`            |
| 5   | Ref URI required      | Every ref node must have a non-empty `vine` URI string                                                     | `'ref-uri-required'`      |

Unique ids are enforced by the parser at insertion time (throws `VineParseError` on duplicates), so the validator does not re-check them.

### Cycle Detection

Standard DFS with three-color marking (white/gray/black). If a gray node is revisited, a cycle exists. The `details` field includes `cycle: string[]`.

### Island Detection

1. Build a reverse adjacency map: for each task `A` with dependency `B`, add `A` to `reverse[B]`.
2. BFS from root through the reverse map — this visits every task that root transitively depends on.
3. If any task is unvisited, it is an island. The `details` field includes `islandTaskIds: string[]`.

---

## Serializer — `src/serializer.ts`

### Entry Point

```ts
function serialize(graph: VineGraph): string;
```

Converts a `VineGraph` back to `.vine` text.

### Algorithm

1. **Emit preamble**: Write the magic line (`vine <version>`), any metadata (`title:`, `delimiter:` if non-default), and the `---` terminator.
2. Iterate `graph.order` to preserve original task ordering.
3. For each task, emit lines in this order:
   a. **Header**: `[id] Short Name (status)`
   b. **Description**: emit as multi-line text (split on `\n`), preserving line breaks
   c. **Dependencies**: one `-> targetId` line per dependency, sorted alphabetically
   d. **Decisions**: one `> text` line per decision, in array order
   e. **Attachments**: in canonical order — artifacts first, then guidance, then files. Each as `@<class> <mime> <uri>`
4. Separate blocks with the delimiter (default `---`).
5. Trailing newline at end of file.

### Round-Trip Guarantee

```ts
deepEqual(parse(serialize(graph)), graph); // must hold for any valid VineGraph
```

The serializer preserves enough structure that re-parsing produces an identical graph. Field ordering within a block is normalized (description → dependencies → decisions → attachments) to ensure deterministic output.

---

## Graph Queries — `src/graph.ts`

Pure functions for traversing a `VineGraph`. All accept a graph as the first argument and never modify it.

```ts
/** Returns the task with the given id. Throws VineError if not found. */
function getTask(graph: VineGraph, id: string): Task;

/** Returns the id of the root task (first in order). */
function getRootId(graph: VineGraph): string;

/** Returns the root task (first in order). */
function getRoot(graph: VineGraph): Task;

/** Returns direct dependencies of a task. */
function getDependencies(graph: VineGraph, id: string): Task[];

/** Returns tasks that depend on the given task. */
function getDependants(graph: VineGraph, id: string): Task[];
```

---

## Reference Node Helpers — `src/expansion.ts`

### `isVineRef`

```ts
function isVineRef(task: Task): task is RefTask;
```

Type guard that narrows `Task` to `RefTask`. Returns `true` if `task.kind === 'ref'`. Defined in `types.ts` (re-exported from `index.ts`).

### `isConcreteTask`

```ts
function isConcreteTask(task: Task): task is ConcreteTask;
```

Type guard that narrows `Task` to `ConcreteTask`. Returns `true` if `task.kind === 'task'`. Defined in `types.ts` (re-exported from `index.ts`).

### `expandVineRef`

```ts
function expandVineRef(
  parentGraph: VineGraph,
  refNodeId: string,
  childGraph: VineGraph,
): VineGraph;
```

Expands a reference node by inlining all tasks from a child graph into the parent graph. Returns a new `VineGraph`.

**Behavior:**

1. **Child root replaces the ref node** — the child graph's root task takes the ref node's position in `order`. It inherits the ref node's location in the parent graph.
2. **ID prefixing** — all non-root child task IDs are prefixed as `prefix/originalId`, where `prefix` comes from the child graph's `prefix` metadata (defaults to `refNodeId` if `prefix` is `undefined`).
3. **Dependency merging** — dependencies are merged (union, deduplicated). The child root inherits the ref node's incoming dependants.
4. **Decision merging** — the child root's decisions are appended after the ref node's decisions.
5. **Validation** — throws `VineError` if:
   - `refNodeId` does not exist in the parent graph
   - The node at `refNodeId` is not a reference node (`isVineRef` returns false)
   - The child graph is empty (no tasks)
   - An ID collision occurs between prefixed child IDs and existing parent IDs

---

## Public API — `src/index.ts`

Single barrel export re-exporting the public surface:

```ts
// Types
export type {
  Status,
  Task,
  VineGraph,
  Attachment,
  AttachmentClass,
} from './types.js';

// Errors
export { VineError, VineParseError, VineValidationError } from './errors.js';
export type { ValidationConstraint, ValidationDetails } from './errors.js';

// Parse & Serialize
export { parse } from './parser.js';
export { serialize } from './serializer.js';
export { validate } from './validator.js';

// Graph Queries
export {
  getTask,
  getRoot,
  getRootId,
  getDependencies,
  getDependants,
} from './graph.js';

// Types & Type Guards
export { isVineRef, isConcreteTask, getSpriteUri } from './types.js';

// Expansion
export { expandVineRef } from './expansion.js';

// Mutations
export {
  addRef,
  addTask,
  removeTask,
  setStatus,
  updateTask,
  updateRefUri,
  addDependency,
  removeDependency,
} from './mutations.js';

// Search & Filter
export {
  filterByStatus,
  searchTasks,
  getLeaves,
  getRefs,
  getDescendants,
  getSummary,
} from './search.js';
```

---

## File Structure

```
packages/core/
  src/
    types.ts          # Status, Task, VineGraph types
    errors.ts         # VineError, VineParseError, VineValidationError
    parser.ts         # parse(input) → VineGraph
    validator.ts      # validate(graph) — constraint enforcement
    serializer.ts     # serialize(graph) → string
    graph.ts          # Query helpers
    mutations.ts      # Validated graph mutations
    search.ts         # Filter, search, summary queries
    index.ts          # Public API barrel export
  __tests__/
    parser.test.ts
    validator.test.ts
    serializer.test.ts
    graph.test.ts
    roundtrip.test.ts
    mutations.test.ts
    search.test.ts
  package.json
  tsconfig.json
```

---

## Test Strategy

**Framework**: Vitest
**Target**: >90% line coverage on all modules

### Test Suites

| Suite                | Focus                                                                                                                                                         |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `parser.test.ts`     | Valid parse of the VINE.md example; malformed headers; unknown status keywords; duplicate ids; empty input; leading/trailing whitespace; multiple blank lines |
| `validator.test.ts`  | One test per constraint — happy path and failure path. Cycle detection with direct and transitive cycles. Island detection with disconnected subgraphs.       |
| `serializer.test.ts` | Output matches expected `.vine` format. Field ordering (description → deps → decisions → attachments). Trailing newline.                                      |
| `graph.test.ts`      | Each query helper returns correct results for the VINE.md example graph.                                                                                      |
| `roundtrip.test.ts`  | `parse(serialize(graph))` deep-equals original for the VINE.md example and generated graphs.                                                                  |
| `mutations.test.ts`  | Each mutation validates inputs, returns new graph, and throws on invalid operations (missing tasks, cycles, etc.).                                            |
| `search.test.ts`     | Filter/search/query helpers return correct results and maintain graph order.                                                                                  |

### Verification Commands

> **⚠️ Do not use npm.** This project uses **Yarn 4 (Berry)** exclusively. Always use `yarn` commands.

```bash
yarn vitest run --coverage        # all tests pass, >90% coverage
yarn typecheck                    # zero type errors under strictest settings
```

---

## Mutations Module (`mutations.ts`)

Provides validated graph mutation operations that maintain VINE invariants:

```typescript
function addTask(graph: VineGraph, task: Task): VineGraph;
function removeTask(graph: VineGraph, id: string): VineGraph;
function setStatus(graph: VineGraph, id: string, status: Status): VineGraph;
function updateTask(
  graph: VineGraph,
  id: string,
  updates: Partial<
    Pick<Task, 'shortName' | 'description' | 'decisions' | 'attachments'>
  >,
): VineGraph;
function addDependency(
  graph: VineGraph,
  taskId: string,
  depId: string,
): VineGraph;
function removeDependency(
  graph: VineGraph,
  taskId: string,
  depId: string,
): VineGraph;
function addRef(graph: VineGraph, ref: RefTask): VineGraph;
function updateRefUri(graph: VineGraph, id: string, uri: string): VineGraph;
```

All functions return a new `VineGraph` instance (immutable operations). They validate inputs (task existence, cycle detection, etc.) and throw `VineError` on invalid operations.

- `addRef` — Adds a reference node. Validates `kind === 'ref'` and non-empty `vine` URI. Returns new graph.
- `updateRefUri` — Updates a ref node's `vine` URI. Throws if the target node is not a ref (`kind !== 'ref'`).

## Search Module (`search.ts`)

Provides graph querying and analysis functions:

```typescript
function filterByStatus(graph: VineGraph, status: Status): Task[];
function searchTasks(graph: VineGraph, query: string): Task[];
function getLeaves(graph: VineGraph): Task[];
function getDescendants(graph: VineGraph, id: string): Task[];
function getRefs(graph: VineGraph): readonly RefTask[];
function getSummary(graph: VineGraph): GraphSummary;
```

- `getRefs` — Returns all reference nodes in graph order.

`GraphSummary` includes `total`, `byStatus` (count per status with all 6 statuses initialized to 0: `complete`, `started`, `reviewing`, `planning`, `notstarted`, `blocked`), `rootId`, `rootName`, and `leafCount`. All query functions return results in graph order.
