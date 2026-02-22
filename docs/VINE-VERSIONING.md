# VINE Version Upgrade Guide

This document is a reusable checklist for implementing a new `.vine` format version across the Bacchus codebase. Follow it whenever you add a new version spec under [VINE/](VINE/).

---

## Prerequisites

1. **Spec is finalized** — a new version document exists under `docs/VINE/` (e.g., `docs/VINE/v2.0.0.md`) with grammar, constraints, examples, and a diff from the previous version.
2. **Index is updated** — [VINE.md](VINE.md) lists the new version and marks it as current.
3. **Diff the versions** — identify every semantic difference between the old and new version (statuses, structure, body-line types, root convention, etc.).

---

## Phase 1 — Core Types & Errors

**Package**: `@bacchus/core` · **Files**: `src/types.ts`, `src/errors.ts`

All other code imports from here, so this must land first.

| Task                                                | Where                                                                                                        |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Update `Status` union type                          | `types.ts` — add/remove/rename status keywords                                                               |
| Update `VALID_STATUSES` array                       | `types.ts` — must match `Status` union                                                                       |
| Update `Task` interface                             | `types.ts` — add new fields (e.g., `attachments`)                                                            |
| Add supporting types                                | `types.ts` — e.g., `Attachment`, `AttachmentClass`                                                           |
| Update `VineGraph` interface                        | `types.ts` — add metadata fields (`version`, `title`, `delimiter`), update `order` JSDoc for root convention |
| Update `ValidationConstraint` / `ValidationDetails` | `errors.ts` — add variants for new constraints if needed                                                     |
| Update `index.ts` exports                           | `src/index.ts` — export new types                                                                            |

---

## Phase 2 — Parser

**Package**: `@bacchus/core` · **File**: `src/parser.ts`

| Task                            | Where                                                                                                                      |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Update `HEADER_RE` regex        | Status alternation must match new `Status` union                                                                           |
| Add version detection           | First line: `vine <semver>` → dispatch to version-specific parser                                                          |
| Add preamble parsing            | Read metadata lines until delimiter                                                                                        |
| Update block splitting          | Split on configured delimiter instead of blank lines                                                                       |
| Add new body-line prefixes      | Prefix-priority dispatch for any new line types (e.g., `@artifact`)                                                        |
| Update description joining      | `\n` vs space — match the spec for the detected version                                                                    |
| Populate new `VineGraph` fields | `version`, `title`, `delimiter`, new `Task` fields                                                                         |
| Reject unknown versions         | Files without a valid magic line or with an unsupported version are rejected                                               |
| Handle trailing newlines        | Stripping the trailing empty line from `input.split('\n')` prevents phantom empty description lines in the last task block |

---

## Phase 3 — Serializer

**Package**: `@bacchus/core` · **File**: `src/serializer.ts`

| Task                      | Where                                                                                             |
| ------------------------- | ------------------------------------------------------------------------------------------------- |
| Emit preamble             | Magic line + metadata + preamble terminator                                                       |
| Update block separator    | Delimiter string instead of blank lines                                                           |
| Emit new body-line types  | Attachments, etc., in canonical order                                                             |
| Update description output | Multi-line descriptions emitted as separate lines                                                 |
| Canonical ordering        | Dependencies sorted, attachments grouped by class, metadata keys alphabetized                     |
| Conditional metadata      | Only emit metadata keys when they differ from defaults (e.g., omit `delimiter:` when it is `---`) |
| Version field in output   | Ensure the magic line reflects the graph's version                                                |

---

## Phase 4 — Validator, Graph, Search, Mutations

**Package**: `@bacchus/core` · **Files**: `src/validator.ts`, `src/graph.ts`, `src/search.ts`, `src/mutations.ts`

These files share a set of common assumptions. Audit every occurrence of:

| Pattern to find                                                        | What to update                                                                                                                                                                                                            |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Old root convention (e.g., `order[order.length - 1]`)                  | Search for the **old** root derivation pattern and replace with the new one. When upgrading from root-last to root-first, search for `order.length` or `order\[.*length`                                                  |
| Hardcoded status initializers (e.g., `{ complete: 0, started: 0, … }`) | Add new statuses to initializer objects (e.g., `search.ts` → `getSummary`)                                                                                                                                                |
| `addTask()` insertion index                                            | Insert relative to root position (e.g., append to end when root is first)                                                                                                                                                 |
| `removeTask()` root guard                                              | Root ID derivation                                                                                                                                                                                                        |
| `updateTask()` fields whitelist                                        | Allow new fields (e.g., `attachments`)                                                                                                                                                                                    |
| `buildGraph()` helper (if present)                                     | Internal helpers in `mutations.ts` that construct `VineGraph` objects must propagate new metadata fields (`version`, `title`, `delimiter`, etc.) from the source graph. Update the function signature and all call sites. |
| Island-check BFS root                                                  | Must use correct root convention                                                                                                                                                                                          |

**Recommended**: create a `getRootId(graph)` helper in `graph.ts` (exported from `index.ts`) used everywhere, so root convention is a single line to change.

---

## Phase 5 — CLI Package

**Package**: `@bacchus/cli` · **Dir**: `packages/cli/src/`

| Task                        | Where                                                                  |
| --------------------------- | ---------------------------------------------------------------------- |
| Status labels map           | `commands/show.ts` — `STATUS_LABELS` record                            |
| Status argument description | `commands/status.ts` — hardcoded status list in help text              |
| Task construction defaults  | `commands/add.ts` — new fields need defaults (e.g., `attachments: []`) |
| Command logic               | Generally delegates to core — changes propagate transitively           |

---

## Phase 6 — UI Package

**Package**: `@bacchus/ui` · **Dir**: `packages/ui/src/`

| Task                          | Where                                                                         |
| ----------------------------- | ----------------------------------------------------------------------------- |
| Status color/style map        | `src/lib/status.ts` — `STATUS_MAP` entries                                    |
| CSS custom properties         | `src/app.css` — `--color-<status>` variables for light + dark themes          |
| Root convention in layout     | `src/lib/layout.ts` — `computeDepths()`, `createSimulation()`                 |
| Root convention in components | `src/lib/components/GraphView.svelte` — `isRoot` derivation                   |
| Chat tool schemas             | `src/lib/chat/tools.ts` — status enums, root ID derivation, task construction |
| Chat system prompt            | `src/lib/chat/orchestrator.ts` — `buildSystemPrompt()` format description     |
| Chat tool feedback            | `src/lib/chat/toolFeedback.ts` — `VALID_STATUSES` set                         |

---

## Phase 7 — Example Files

**Dir**: `examples/`

All `.vine` files must be rewritten to the new format version. For each file:

1. Add magic line and preamble
2. Replace blank-line separators with the delimiter
3. Reorder tasks per the new root convention
4. Add new features where appropriate (e.g., new statuses, attachments)
5. Validate by running through the parser: `yarn dlx tsx packages/cli/src/cli.ts validate examples/<file>`

---

## Phase 8 — Test Fixtures & Constants

Inline VINE text and fixture files appear in many locations. A `grep` for the old format's patterns is the fastest way to find them all.

```powershell
# Find all root convention usages (search for BOTH old and new patterns)
grep -rn "getRoot\|getRootId\|order\[.*length.*1\]\|order\[0\]" packages/

# Find all inline VINE string constants
grep -rn "VINE_EXAMPLE\|SAMPLE_VINE\|VINE_TEXT\|SEED_VINE\|MULTI_DEP\|CYCLE_VINE" packages/

# Find patchRootDeps helpers in test files (these use the root convention)
grep -rn "patchRootDeps" packages/

# Find .vine fixture files
Get-ChildItem -Recurse -Filter "*.vine" packages/
```

### Core tests (`packages/core/__tests__/`)

| File                       | What to update                                                                                  |
| -------------------------- | ----------------------------------------------------------------------------------------------- |
| `fixtures/vine-example.ts` | Canonical fixture — rewrite to new format                                                       |
| `parser.test.ts`           | Inline VINE strings, order assertions, description join assertions, new feature tests           |
| `serializer.test.ts`       | Expected output strings, delimiter assertions, preamble assertions                              |
| `validator.test.ts`        | `makeGraph()` helper root convention, order arrays in all test cases                            |
| `mutations.test.ts`        | `baseVine` inline string, `patchRootDeps()` root derivation, all `serialize()` expected outputs |
| `graph.test.ts`            | `getRoot` test description and assertions                                                       |
| `search.test.ts`           | `VINE_TEXT` fixture, `byStatus` assertions                                                      |
| `roundtrip.test.ts`        | All inline VINE strings, minimal graph format                                                   |

### CLI tests (`packages/cli/__tests__/`)

| File                       | What to update                                                                                                                                                                                    |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `commands.test.ts`         | `SAMPLE_VINE`, `CYCLE_VINE`, `patchRootDeps()` root derivation + return value (must spread `...graph` to preserve metadata), order assertions, `byStatus` assertions, new fields on Task literals |
| `command-handlers.test.ts` | `SAMPLE_VINE`                                                                                                                                                                                     |

### UI tests (`packages/ui/__tests__/`)

| File                        | What to update                                                  |
| --------------------------- | --------------------------------------------------------------- |
| `fixtures/graphs.ts`        | All `order` arrays (root convention), task objects (new fields) |
| `status.test.ts`            | `ALL_STATUSES` array, entry count assertion                     |
| `chat/tools.test.ts`        | `SAMPLE_VINE`, `MULTI_DEP_VINE`                                 |
| `chat/orchestrator.test.ts` | `SAMPLE_VINE`                                                   |
| `chat/toolFeedback.test.ts` | `SAMPLE_VINE`                                                   |
| `chat/integration.test.ts`  | `SEED_VINE`                                                     |

### E2E fixtures (`packages/ui/e2e/fixtures/`)

Every `.vine` file must be rewritten. Inline VINE text in `chat-mocked.spec.ts` must also be updated.

---

## Phase 9 — Documentation

| File                 | What to update                                                                  |
| -------------------- | ------------------------------------------------------------------------------- |
| `docs/VINE.md`       | Should already be done (Phase 0). Verify migration table is complete.           |
| `docs/VINE-TS.md`    | Type definitions, parser algorithm, serializer format, root convention          |
| `docs/CLI.md`        | Status lists in command descriptions                                            |
| `docs/BacchusUI.md`  | Status palette table, root identification, data flow descriptions               |
| `docs/UserGuide.md`  | Status color descriptions                                                       |
| `examples/README.md` | Example file descriptions                                                       |
| `README.md`          | Quick Start code sample, VINE Format summary, API table (`getRoot` description) |

---

## Phase 10 — Validation

Run the full suite and fix any remaining issues.

```powershell
# Type-check
yarn typecheck

# Lint
yarn lint

# Unit + integration tests
yarn test

# E2E tests
yarn workspace @bacchus/ui exec playwright test

# Validate every example
Get-ChildItem examples/*.vine | ForEach-Object {
    yarn dlx tsx packages/cli/src/cli.ts validate $_.FullName
}
```

---

## Phase 11 — Version Bump

| File                         | Field     | New value                               |
| ---------------------------- | --------- | --------------------------------------- |
| `packages/core/package.json` | `version` | Match VINE spec version (e.g., `1.0.0`) |
| `packages/cli/package.json`  | `version` | Align with core                         |
| `packages/ui/package.json`   | `version` | Align with core                         |

---

## Quick Reference: Common Grep Patterns

These patterns surface the most common version-sensitive code across the codebase:

| What                | Grep                                                           |
| ------------------- | -------------------------------------------------------------- |
| Root convention     | `order\[.*length` or `order\[0\]` or `getRootId`               |
| Status enums        | `complete.*started.*planning\|VALID_STATUSES\|Status.*=`       |
| Inline VINE text    | `\[.*\].*\(complete\|started\|notstarted\|planning\|blocked\)` |
| Block splitting     | `splitBlocks\|blank.*line\|join.*\\n\\n`                       |
| Description join    | `join\(' '\)\|join.*space`                                     |
| VINE fixtures       | `VINE_EXAMPLE\|SAMPLE_VINE\|VINE_TEXT\|SEED_VINE`              |
| Attachment handling | `@artifact\|@guidance\|@file\|attachment`                      |
