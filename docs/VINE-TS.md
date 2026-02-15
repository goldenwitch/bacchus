# VINE TypeScript Library — Design Specification

Version: 0.1
Package: `@bacchus/core` (`packages/core/`)

## Overview

`@bacchus/core` is an ESM-only TypeScript library that parses `.vine` text into a typed, immutable task graph, validates all spec constraints, serializes back to `.vine` text, and exposes query helpers for consumers (visualizer, future CLI).

### Design Decisions

| Decision            | Choice                     | Rationale                                                                                              |
| ------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------ |
| Immutability        | **Readonly types**         | `VineGraph` and `Task` are deeply readonly. Consumers receive values they cannot accidentally corrupt. |
| Error style         | **Throw typed exceptions** | Parse and validation failures throw typed errors — no Result wrapper.                                  |
| Root identification | **Last task in file**      | The last task in file order is always the root.                                                        |

---

## Types — `src/types.ts`

### `Status`

```ts
type Status = 'complete' | 'notstarted' | 'planning' | 'blocked' | 'started';
```

### `Task`

```ts
interface Task {
  readonly id: string;
  readonly shortName: string;
  readonly description: string;
  readonly status: Status;
  readonly dependencies: readonly string[];
  readonly decisions: readonly string[];
}
```

### `VineGraph`

```ts
interface VineGraph {
  readonly tasks: ReadonlyMap<string, Task>;
  readonly order: readonly string[]; // task ids in file order; last element is always root
}
```

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
  | 'no-islands';

type ValidationDetails =
  | { constraint: 'at-least-one-task' }
  | { constraint: 'valid-dependency-refs'; taskId: string; missingDep: string }
  | { constraint: 'no-cycles'; cycle: string[] }
  | { constraint: 'no-islands'; islandTaskIds: string[] };
```

---

## Parser — `src/parser.ts`

### Entry Point

```ts
function parse(input: string): VineGraph;
```

Parses a `.vine` string into a validated `VineGraph`. Throws `VineParseError` on syntax errors and `VineValidationError` on constraint violations.

### Algorithm

1. **Split** the input on blank lines into blocks. Trim whitespace, discard empty blocks.
2. **For each block**:
   a. The first line is the **header**. Extract `id`, `shortName`, and `status` via the spec regex:
   ```
   ^\[([a-zA-Z0-9-]+)\]\s+(.+?)\s+\((complete|notstarted|planning|blocked|started)\)$
   ```
   Throw `VineParseError` if the header doesn't match.
   b. Classify remaining **body lines** by prefix:
   - `-> ` → dependency (trim prefix, value is target task id)
   - `> ` → decision (trim prefix, rest is text)
   - otherwise → description line
     c. Concatenate consecutive description lines with a single space.
3. **Build** a `Task` per block. Collect into a `Map<string, Task>` keyed by id.
   - On duplicate id insertion, throw `VineParseError`.
4. **Preserve** insertion order as the `order` array.
5. **Validate** by calling `validate()` — parser always returns a valid graph or throws.

### Edge Cases

- Leading/trailing whitespace in the file is ignored.
- Multiple consecutive blank lines between blocks are treated as a single separator.
- A body line that is only whitespace is treated as a block separator (not a description line).
- An empty or whitespace-only file throws `VineParseError` (no blocks found).
- Multi-line descriptions are concatenated into a single space-separated string. Intentional line breaks in the source are not preserved.

---

## Validator — `src/validator.ts`

### Entry Point

```ts
function validate(graph: VineGraph): void;
```

Throws `VineValidationError` on the first constraint violation found.

### Constraints (checked in order)

| #   | Constraint            | Check                                                                                                     | Error `constraint` value  |
| --- | --------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------- |
| 1   | At least one task     | `graph.tasks.size >= 1`                                                                                   | `'at-least-one-task'`     |
| 2   | Valid dependency refs | Every `task.dependencies[i]` exists as a key in `graph.tasks`                                             | `'valid-dependency-refs'` |
| 3   | No cycles             | DFS-based cycle detection across the full dependency graph                                                | `'no-cycles'`             |
| 4   | No islands            | BFS/DFS from root (last id in `order`) following **reverse** dependency edges; every task must be visited | `'no-islands'`            |

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

1. Iterate `graph.order` to preserve original task ordering.
2. For each task, emit lines in this order:
   a. **Header**: `[id] Short Name (status)`
   b. **Description**: emit as a single line (if non-empty)
   c. **Dependencies**: one `-> targetId` line per dependency, in array order
   d. **Decisions**: one `> text` line per decision, in array order
3. Separate blocks with a single blank line.
4. Trailing newline at end of file.

### Round-Trip Guarantee

```ts
deepEqual(parse(serialize(graph)), graph); // must hold for any valid VineGraph
```

The serializer preserves enough structure that re-parsing produces an identical graph. Field ordering within a block is normalized (description → dependencies → decisions) to ensure deterministic output.

---

## Graph Queries — `src/graph.ts`

Pure functions for traversing a `VineGraph`. All accept a graph as the first argument and never modify it.

```ts
/** Returns the task with the given id. Throws VineError if not found. */
function getTask(graph: VineGraph, id: string): Task;

/** Returns the root task (last in order). */
function getRoot(graph: VineGraph): Task;

/** Returns direct dependencies of a task. */
function getDependencies(graph: VineGraph, id: string): Task[];

/** Returns tasks that depend on the given task. */
function getDependants(graph: VineGraph, id: string): Task[];

/** Returns all transitive dependencies (ancestors) of a task.
 *  Useful for viz camera framing. */
function getAncestors(graph: VineGraph, id: string): Task[];
```

---

## Public API — `src/index.ts`

Single barrel export re-exporting the public surface:

```ts
// Types
export type { Status, Task, VineGraph } from './types.js';

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
  getDependencies,
  getDependants,
  getAncestors,
} from './graph.js';
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
    index.ts          # Public API barrel export
  __tests__/
    parser.test.ts
    validator.test.ts
    serializer.test.ts
    graph.test.ts
    roundtrip.test.ts
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
| `serializer.test.ts` | Output matches expected `.vine` format. Field ordering (description → deps → decisions). Trailing newline.                                                    |
| `graph.test.ts`      | Each query helper returns correct results for the VINE.md example graph.                                                                                      |
| `roundtrip.test.ts`  | `parse(serialize(graph))` deep-equals original for the VINE.md example and generated graphs.                                                                  |

### Verification Commands

> **⚠️ Do not use npm.** This project uses **Yarn 4 (Berry)** exclusively. Always use `yarn` commands.

```bash
yarn vitest run --coverage        # all tests pass, >90% coverage
yarn typecheck                    # zero type errors under strictest settings
```
