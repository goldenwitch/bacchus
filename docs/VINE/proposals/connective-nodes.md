# Proposal: First-Class Connective Nodes

**Status:** Implemented in `@bacchus/core` (VINE 1.3.0), surfaced through the MCP `vine_write` `add_connective` op. Not yet in the UI renderer or a formal `docs/VINE/v1.3.0.md` spec.
**Targets issue:** [#22 — VINE: distinguish 'blocked (needs intervention)' from 'deferred (waiting on external trigger)'](https://github.com/goldenwitch/bacchus/issues/22)
**VINE version:** 1.3.0 (grammar change — see [Versioning & Compatibility](#versioning--compatibility))
**Precedent:** the existing `ref` structural node ([v1.2.0 spec](../v1.2.0.md#reference-block))

---

## Boundary

The VINE core owns **graph connectivity and routing**. It does not assign execution semantics to header annotations. New core constructs that affect **traversal or readiness** are explicit **node kinds**, not annotation keys.

`ref` is the existing structural-node precedent: a first-class block form (`ref [id] Name (URI)`) that participates in the dependency graph — other nodes depend on it, it declares its own dependencies, validation and expansion see it — while carrying no task lifecycle of its own. `anyof` and `allof` extend that same design space. They add routing vocabulary without adding domain-specific task semantics.

This is a deliberate rejection of the `@anyof(...)` **annotation** path floated in the [#22 discussion](https://github.com/goldenwitch/bacchus/issues/22#issuecomment-4953911965). See [Why a node kind, not an annotation](#why-a-node-kind-not-an-annotation).

---

## Connective Nodes

Two new block kinds join `task` and `ref`:

```vine
[gap-memory] Belief beyond the window (notstarted)
-> memory-trigger
---
anyof [memory-trigger] First relevant regime signal
-> r4-scoping
-> spirit-2-intake
```

- **`anyof`** is *satisfied* when **any** direct dependency is satisfied.
- **`allof`** is *satisfied* when **every** direct dependency is satisfied.
- Connective nodes have **no writable status**, **cannot be claimed or completed**, and **never enter `ready_to_start`** (nor any other frontier bucket).
- A dependant treats a satisfied connective node as a **satisfied prerequisite**, using the existing dependency-satisfaction rule — the connective is transparent to the dependant.

An `allof` node is useful even though ordinary task dependencies are already conjunctive: it **names and reuses** a derived readiness condition without inventing a task owner or a manual lifecycle. Where `anyof` adds an expressiveness the format cannot otherwise state (disjunction), `allof` adds *reuse and naming* of the conjunction the format already has.

### Header form

| Header form                | Block kind      | Status field | Attachments |
| -------------------------- | --------------- | ------------ | ----------- |
| `[id] Name (status)`       | task            | required     | allowed     |
| `ref [id] Name (URI)`      | reference       | —            | forbidden   |
| `anyof [id] Name`          | connective (∨)  | —            | forbidden   |
| `allof [id] Name`          | connective (∧)  | —            | forbidden   |

A connective header is the keyword (`anyof` / `allof`), an `[id]`, a short name, and optional [header annotations](../v1.2.0.md#header-annotations). Unlike task and ref headers it has **no trailing parenthesized field** — there is no status to set and no URI to resolve.

**Connective header regexes** (mirroring the task/ref forms):

```
^anyof\s+\[([a-zA-Z0-9-]+(?:/[a-zA-Z0-9-]+)*)\]\s+(.+?)((?:\s+@[a-zA-Z][a-zA-Z0-9]*\([^)]*\))*)$
^allof\s+\[([a-zA-Z0-9-]+(?:/[a-zA-Z0-9-]+)*)\]\s+(.+?)((?:\s+@[a-zA-Z][a-zA-Z0-9]*\([^)]*\))*)$
```

### Body lines

Connective body lines use the same prefix-priority dispatch as `ref`, minus attachments:

| Allowed | Prefix   | Meaning        |
| ------- | -------- | -------------- |
| **Yes** | `-> `    | Dependency     |
| **Yes** | `> `     | Decision       |
| **Yes** | *(none)* | Description    |
| **No**  | `@*`     | Attachment (forbidden, as on `ref`) |

Dependencies are the point of a connective — they are the inputs to its satisfaction rule. Description text serves as the human-facing statement of the routing condition ("first relevant regime signal"). Decisions may record why the disjunction/conjunction is drawn this way.

### Satisfaction predicate

The frontier already computes, for every dependency edge, whether the target is *satisfied*. Connectives reuse that predicate and extend it recursively:

```
satisfied(n):
  task  → n.status ∈ { complete, reviewing }      # the existing rule
  ref   → (existing per-node rule / expanded status)
  anyof → ∃ d ∈ deps(n):  satisfied(d)
  allof → ∀ d ∈ deps(n):  satisfied(d)
```

A task/ref dependant is ready exactly as before — "all dependencies satisfied" — except `satisfied()` now resolves connectives transparently. No new readiness rule is introduced at the dependant; the recursion lives entirely inside the predicate. Termination is guaranteed by the DAG constraint.

### Parsing dispatch

Header classification is decided on the **first token**, extending the v1.2.0 algorithm ([step 5](../v1.2.0.md#parsing-algorithm)):

```
first token == "ref"    → reference block
first token == "anyof"  → anyof connective block
first token == "allof"  → allof connective block
otherwise               → task block   (must start with "[")
```

---

## Grammar

Additions to the [v1.2.0 ABNF](../v1.2.0.md#abnf-grammar):

```abnf
node-block     = task-block / ref-block / anyof-block / allof-block

; ── Connective blocks ──

anyof-block    = anyof-header LF *conn-body-line
anyof-header   = %s"anyof" 1*WSP "[" task-id "]" 1*WSP short-name *annotation

allof-block    = allof-header LF *conn-body-line
allof-header   = %s"allof" 1*WSP "[" task-id "]" 1*WSP short-name *annotation

conn-body-line = dependency / decision / description-line
                                                ; no status, no attachments
```

`task-id`, `short-name`, `dependency`, `decision`, `description-line`, and `annotation` are unchanged from v1.2.0. Connectives share the single ID namespace with tasks and refs.

---

## Validation

Connective nodes are ordinary graph citizens for every existing structural constraint, plus one addition:

1. **Unique IDs** — connective IDs share the namespace; no collisions with task/ref IDs.
2. **Valid dependency refs** — every `-> <id>` on a connective must resolve to a node in the same file. Every `-> <connective-id>` from a task/ref must likewise resolve.
3. **No cycles** — connectives participate in cycle detection like any node.
4. **No islands** — connectives must be reachable from the root by dependency edges.
5. **Non-empty connective** *(new)* — an `anyof`/`allof` node **must declare at least one dependency**. A zero-dependency `anyof` can never be satisfied (a silent permanent block); a zero-dependency `allof` is vacuously satisfied (a silent no-op). Both are almost certainly authoring errors, so the parser rejects them rather than guessing intent.
6. **No status / no attachments on connectives** — enforced syntactically by the header grammar and body-line rules.
7. **Root is not a connective** *(new)* — the root (first block) represents the graph's goal and carries a status; a connective has neither, so it may not be the root. The root must be a task or a ref.

---

## Frontier behavior (`vine_next`)

Connective nodes are **pure routing** and never appear in any [`vine_next`](../MCP.md#vine_next) bucket — not `ready_to_start`, `ready_to_complete`, `needs_expansion`, or `blocked`. They are not work; there is nothing to pick up, review, or expand.

Their only effect on the frontier is through the satisfaction predicate: a task that depends on a connective becomes ready the moment the connective is satisfied — i.e., the moment its underlying disjunction/conjunction fires. No polling agent, no manual "trigger node" completion.

`progress` counts (`total`, `complete`, `percentage`, `by_status`, `ready_count`) **exclude connectives** — they are routing infrastructure, not deliverable work, and including them would distort completion metrics.

---

## Expansion

Connectives behave like tasks under [expansion](../v1.2.0.md#expansion):

- On inlining a child graph, connective IDs are prefixed with the child prefix exactly like task IDs (`memory-trigger` → `child/memory-trigger`), and their `-> ` targets are remapped correspondingly.
- Annotations on connectives are preserved on the remapped node, consistent with the v1.2.0 rule.
- Because the [root is never a connective](#validation), a connective can never occupy the reference node's slot, so the "child root adopts the ref node's ID and status" step is unaffected.

---

## Serialization

Canonical body-line order for a connective block (mirrors `ref`, minus attachments):

1. Description lines (internal newlines preserved)
2. Dependencies (`-> ...`), sorted alphabetically by target id
3. Decisions (`> ...`), in original order

Header annotations are appended after the short name in alphabetical key order, matching task/ref serialization.

---

## Worked example — the #22 deferral, resolved

The [#22](https://github.com/goldenwitch/bacchus/issues/22) case: a "sized capability gap" that must **not** appear in the ready-to-start frontier until an external trigger fires — where the trigger is a disjunction ("second spirit intake **or** r4 stable-noise scoping, whichever lands first"). Ordinary conjunctive `->` cannot state the OR; the prior workaround overloaded `blocked`.

```vine
vine 1.3.0
title: Long-horizon research graph
---
[root] Dog build graph (started)
-> gap-memory
---
[gap-memory] Belief beyond the 7-frame window (notstarted)
The sized capability gap. Binds when the first relevant regime signal lands.
-> memory-trigger
---
anyof [memory-trigger] First relevant regime signal
Fires on whichever upstream lands first — no intervention, not alarming.
-> r4-scoping
-> spirit-2-intake
---
[r4-scoping] r4 stable-noise scoping (notstarted)
---
[spirit-2-intake] Second spirit intake (notstarted)
```

While both `r4-scoping` and `spirit-2-intake` are incomplete, `memory-trigger` is unsatisfied, so `gap-memory` is **not** in `ready_to_start` — and nothing is reported as `blocked`, because nothing needs intervention. The instant either upstream reaches `complete`/`reviewing`, `memory-trigger` becomes satisfied and `gap-memory` enters the frontier. The deferral is truthful, the `blocked` status keeps its "needs intervention" meaning, and no judgment/polling task exists to babysit.

---

## Consequences

- Every routing relationship remains an ordinary `-> ` edge — **visible to validation, traversal, expansion, and graph rendering**. Nothing about readiness hides inside annotation text a renderer would ignore.
- A connective can be **named, documented, and shared** by multiple dependants. "First relevant regime signal" is stated once and reused, rather than re-encoded per node.
- `@anyof` is **not** a core feature; annotations remain non-routing metadata. The design principle from [#13](https://github.com/goldenwitch/bacchus/issues/13) — routing lives in graph structure, annotations decorate — is preserved structurally, not by governance.
- Issue [#22](https://github.com/goldenwitch/bacchus/issues/22) is met by `anyof` **without a polling judgment task** and without overloading `blocked`.

### Why a node kind, not an annotation

The [#22 comment thread](https://github.com/goldenwitch/bacchus/issues/22#issuecomment-4953911965) proposed `@anyof(r4,spirit-2)` as a header annotation — attractive because unknown annotations are forward-compatible under v1.2.0, so no version bump is needed. This proposal rejects that path on principle:

| | `@anyof(...)` annotation | `anyof` node kind (this proposal) |
| --- | --- | --- |
| Routing visible to graph tools | No — buried in annotation text; renderers/validators ignore unknown keys | Yes — ordinary `-> ` edges |
| Reusable across dependants | No — repeated per node | Yes — one named node, many dependants |
| Overloads annotation semantics | Yes — makes an annotation affect readiness | No — annotations stay non-routing |
| Forward-compatible with v1.2.0 parsers | Yes (silently ignored) | No — requires 1.3.0 (see below) |
| Validation of targets / cycles / islands | Requires special-casing an annotation | Free — it's a node |

The forward-compatibility of the annotation path is a *liability* here, not a feature: a v1.2.0 tool would silently ignore `@anyof`, computing readiness as if the disjunction did not exist. A first-class node makes older tools **fail loudly** (unknown block kind) rather than **route wrongly in silence**.

---

## Versioning & Compatibility

This is a **grammar change**, so it requires a minor version bump to **VINE 1.3.0** and cannot be forward-compatible the way annotations are:

- A 1.3.0 parser must still accept 1.0.0 / 1.1.0 / 1.2.0 files unchanged (connectives are purely additive).
- A **1.2.0 parser encountering a 1.3.0 file with `anyof`/`allof` headers will reject them** — the headers match neither the task nor the ref regex ("invalid header"). This is correct and intended: version dispatch on the magic line means a 1.2.0 tool refuses a 1.3.0 file outright rather than misinterpreting its routing.

Implementation would follow the [VINE Version Upgrade Guide](../VINE-VERSIONING.md): new `NodeKind`/block types in `@bacchus/core` types, parser dispatch + header regexes, serializer body-order for connectives, validator constraints (non-empty connective, root-not-connective, satisfaction recursion), frontier exclusion in `getActionableTasks`, and UI/CLI/MCP surfacing.

---

## Open Decisions

1. **May connective nodes depend on other connective nodes?**
   *Recommendation: yes.* It composes cleanly (`allof` over several `anyof`s, etc.), the satisfaction predicate already recurses, and the DAG constraint guarantees termination. Disallowing it would be a special-case carve-out with no clear benefit.

2. **How does review handoff treat an upstream node that satisfies a connective?**
   `ready_to_complete` currently means "a `reviewing` task whose dependant has **started consuming** its output." With a connective interposed, the question is whether the connective is transparent to that check. *Recommendation: transparent* — the effective consumers of an upstream `U` are the task/ref dependants reachable **through** connective nodes, so a `reviewing` `U` is `ready_to_complete` when any such transitive consumer has started. This keeps the handoff semantics identical to the direct-edge case.

3. **Which derived connective state is exposed by inspection and visualization tools?**
   Candidates: `task`/`context` responses report `kind: "anyof" | "allof"`, a computed `satisfied: boolean`, and optionally `satisfiedBy` (which dependency/dependencies currently satisfy it); `vine_next.progress` excludes connectives from totals; visualization renders connectives as a distinct routing glyph (e.g. an ∨/∧ gate or diamond) showing satisfied vs. unsatisfied state rather than a task-status color. *Recommendation: expose `kind` + `satisfied` at minimum; treat richer detail (`satisfiedBy`) and the visual glyph as follow-ups.*
