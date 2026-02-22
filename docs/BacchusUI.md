# BacchusUI — Design Specification

Version: 1.1.0
Package: `@bacchus/ui` (`packages/ui/`)

## Overview

`@bacchus/ui` is a Svelte 5 + Vite package that visualizes a `.vine` task graph using D3-force layout. It consumes `VineGraph` data from `@bacchus/core`, rendering tasks as animated bubbles connected by dependency edges. The aesthetic goal is a **juicy, video-game / incremental-game feel** — spring physics, bouncy transitions, and procedurally generated sound effects.

The package ships **two things**:

1. **`<GraphView>`** — a self-contained, embeddable Svelte component that accepts a `VineGraph` prop and renders the interactive force graph. No opinions about file loading, routing, or page layout. This is the reusable building block for embedding in other applications.
2. **A standalone app** (`index.html` + `App.svelte`) — a thin shell around `<GraphView>` that adds file input (drag-and-drop, URL parameter) and a landing screen. This is what `yarn dev` / `yarn build` produces.

### Design Decisions

| Decision            | Choice                          | Rationale                                                                |
| ------------------- | ------------------------------- | ------------------------------------------------------------------------ |
| Framework           | **Svelte 5 (runes)**            | Built-in spring/tween primitives; tiny bundle; direct DOM works with D3. |
| D3 usage            | **Layout math only**            | D3 computes positions; Svelte owns DOM — no conflicts.                   |
| Rendering surface   | **SVG**                         | Svelte transitions on graph elements; CSS styling; easy hit-testing.     |
| Sound approach      | **Web Audio API (synthesis)**   | Synthesized tones — zero audio assets, infinitely tweakable.             |
| Reactive state      | **`$state` / `$derived` runes** | Svelte 5 runes replace stores — no external state library needed.        |
| Root identification | **First task in file order**    | Matches `@bacchus/core` `getRoot()` convention.                          |
| Input modes         | **File picker + URL parameter** | Local files via drag-and-drop; shareable links via `?file=<url>`.        |
| Packaging           | **Component + App**             | `<GraphView>` is embeddable; the app is a thin shell for standalone use. |

---

## Visual Design

### Status Palette

Each `Status` maps to a color, emoji, and CSS class. The palette uses luxury material tones — crimson, emerald, gold, silver, and royal purple:

| Status       | Color (hex) | Emoji | CSS Class            | Meaning                              |
| ------------ | ----------- | ----- | -------------------- | ------------------------------------ |
| `complete`   | `#50C878`   | 🌿    | `.status-complete`   | Finished — rich emerald, lush        |
| `started`    | `#E2B93B`   | 🔨    | `.status-started`    | In progress — antique gold, active   |
| `reviewing`  | `#E8A317`   | 🔍    | `.status-reviewing`  | Awaiting review — warm amber         |
| `notstarted` | `#A0A8B4`   | 📋    | `.status-notstarted` | Ready — polished silver, waiting     |
| `planning`   | `#9B72CF`   | 💭    | `.status-planning`   | Thinking — royal purple, imaginative |
| `blocked`    | `#DC3F52`   | 🚧    | `.status-blocked`    | Stuck — crimson, needs attention     |

Colors are defined as CSS custom properties on `:root` for easy theming.

### Bubble Anatomy

Each task is rendered as a circular SVG `<g>` group:

```
┌─────────────────────────────────┐
│  Outer Glow Ring                │  ← status color, soft blur filter
│  ┌───────────────────────────┐  │
│  │  Inner Fill Circle        │  │  ← darker shade of status color
│  │                           │  │
│  │    📋  ← emoji badge      │  │  ← top-right of circle
│  │                           │  │
│  │   "Short Name"            │  │  ← floating label, subtle vertical bob
│  │                           │  │
│  └───────────────────────────┘  │
└─────────────────────────────────┘
```

- **Outer glow ring**: SVG `<circle>` with `stroke` in status color and an `feGaussianBlur` filter. For `started` tasks, an animated pulse (opacity oscillation via CSS `@keyframes`).
- **Inner fill**: SVG `<circle>` filled with a darker variant of the status color (20% luminance reduction).
- **Floating label**: SVG `<text>` centered on the bubble displaying `task.shortName`. Applies a gentle vertical bob animation (±2px, 3s cycle) via CSS `@keyframes`.
- **Emoji badge**: SVG `<text>` positioned at the top-right quadrant of the circle.
- **Radius**: Base radius 40px, scaled by label length (clamped between 30px and 60px) to prevent text overflow.

### Edge Style

Dependency edges connect a task to each of its dependencies:

- **Path**: SVG `<path>` using a quadratic Bézier curve for a soft, organic look.
- **Color**: Muted gray (`#475569`) at default. When either endpoint is focused, the edge transitions to the focused node’s status color.
- **Arrow**: Small arrowhead marker at the dependency end, indicating direction (task → dependency).
- **Flow animation**: Animated `stroke-dashoffset` producing a gentle flowing-dot effect along the edge direction. Speed: 30px/s.
- **Opacity**: 0.6 at rest, 1.0 when connected to a focused node, 0.15 when dimmed.

---

## Graph Layout

D3-force simulation computes node positions. Svelte reads the simulation's `nodes` and `links` arrays each tick and updates the DOM reactively.

### Force Configuration

| Force   | D3 Function     | Parameters                                                                               |
| ------- | --------------- | ---------------------------------------------------------------------------------------- |
| Link    | `forceLink`     | `distance`: 120, `strength`: 0.8, links from `task.dependencies`                         |
| Charge  | `forceManyBody` | `strength`: -300, `distanceMax`: 500                                                     |
| Center  | `forceCenter`   | `x`: viewport center X, `y`: viewport center Y                                           |
| Collide | `forceCollide`  | `radius`: node radius + 16px padding, `strength`: 0.9                                    |
| Radial  | `forceRadial`   | `radius`: depth × 150, `strength`: 0.05, centered on root — arranges depth rings outward |

### Simulation Tuning

| Parameter       | Value | Effect                                                 |
| --------------- | ----- | ------------------------------------------------------ |
| `alpha`         | 1     | Starting energy — simulation begins fully active       |
| `alphaDecay`    | 0.015 | Slow decay — longer settle time for bouncy feel        |
| `alphaMin`      | 0.001 | Simulation freezes when below this threshold           |
| `velocityDecay` | 0.3   | Low friction — nodes coast and overshoot for game feel |

### Root Positioning

The root task (from `getRoot(graph)`) is identified and given a strong `forceX` / `forceY` pull to the viewport center with `strength: 0.3`. This ensures the root remains central regardless of graph topology.

### Depth Calculation

BFS outward from root: root = depth 0, root's direct dependencies = depth 1, their dependencies = depth 2, etc. `@bacchus/core` exports `getAncestors(graph, id)` for transitive dependency traversal, which can assist here. Used by `forceRadial` for concentric ring layout and by entry animation for stagger ordering.

---

## Interaction Model

### Pan & Zoom

Both handled by `d3-zoom` on the root `<svg>` element, updating a reactive `$state` transform `{ x, y, k }`.

| Parameter     | Value                            | Notes                                       |
| ------------- | -------------------------------- | ------------------------------------------- |
| `scaleExtent` | [0.25, 4.0]                      | Clamp zoom range                            |
| `filter`      | `event.ctrlKey` for wheel events | Ctrl+scroll to zoom; unmodified drag to pan |

Combined into a single SVG `transform`: `translate(x, y) scale(k)`.

### Node Click → Focus

Clicking a bubble sets `focusedTaskId = task.id` in `$state`. This triggers:

1. Sidebar opens with task details.
2. Camera animates to the focus framing (see **Focus & Camera Framing**).
3. Clicked node plays squish-and-bounce animation + `pop` sound.
4. Connected edges highlight, unrelated nodes dim.

### Background Click → Unfocus

Clicking outside any bubble or the sidebar clears `focusedTaskId`. This triggers:

1. Sidebar closes with `fly` transition.
2. Camera animates back to the previous free-camera position.
3. All nodes restore full opacity.

### Hover

Hovering over a bubble displays a `Tooltip` component positioned near the cursor:

```
🔨 Started
"Build the authentication flow..."
```

Contents: status emoji + status label (first line), truncated description (second line, max 80 chars). Tooltip appears after a 200ms delay and uses Svelte `fade` transition.

---

## Focus & Camera Framing

When a task is focused, the camera smoothly reframes to show the task in context:

### Framing Layout

```
┌──────────────────────────────┐
│  Dependant A    Dependant B   │  ← getDependants(graph, id)
│                              │
│                              │
│     ★ Focused Task ★         │  ← center of viewport
│                              │
│                              │
│   Dep A    Dep B    Dep C    │  ← getDependencies(graph, id)
└──────────────────────────────┘
```

1. **Dependants**: All tasks returned by `getDependants(graph, focusedId)`. Arranged in a horizontal row in the top third. If the focused task is the root (no dependants), the top row is empty.
2. **Focused task**: Centered in the viewport.
3. **Dependencies**: All tasks returned by `getDependencies(graph, focusedId)`. Arranged in a horizontal row in the bottom third.

### Bounding Box Computation

1. Collect the positions of: dependant nodes (if any), focused node, and all dependency nodes.
2. Compute the axis-aligned bounding box of these positions with padding (80px each side).
3. Calculate the `scale` that fits this bounding box within the viewport dimensions.
4. Calculate the `translate` that centers the bounding box in the viewport.

### Camera Animation

The viewport transform animates from its current value to the computed frame using Svelte `tweened()`:

| Property | Value                                  |
| -------- | -------------------------------------- |
| Duration | 600ms                                  |
| Easing   | `cubicOut` (fast start, smooth settle) |

### Dimming

While focused:

- **Focused node**: Full opacity, pulsing glow ring.
- **Dependants + dependencies**: Full opacity, subtle highlight ring.
- **All other nodes**: 30% opacity, no glow.
- **Connected edges**: Full opacity, status-colored.
- **Other edges**: 15% opacity.

On unfocus, all opacities animate back to 100% / 60% defaults over 400ms.

---

## Sidebar

A slide-out panel displaying full details of the focused task.

### Layout

```
┌──────────────────────────────────┐
│  ┌────────────────────────────┐  │
│  │  🔨 Started                │  │  ← emoji + status pill (colored bg)
│  │                            │  │
│  │  Build the Auth Flow       │  │  ← task.shortName as heading
│  │                            │  │
│  │  Implement OAuth2 login    │  │  ← task.description as body text
│  │  with Google and GitHub    │  │
│  │  provider support...       │  │
│  │                            │  │
│  │  ── Decisions ──────────── │  │
│  │  • Use OAuth2 over SAML    │  │  ← task.decisions as bullet list
│  │  • Support Google first    │  │
│  │                            │  │
│  │                  auth-flow │  │  ← task.id as faint watermark
│  └────────────────────────────┘  │
└──────────────────────────────────┘
```

### Behavior

| Property         | Value                                                            |
| ---------------- | ---------------------------------------------------------------- |
| Width            | 360px                                                            |
| Position         | Fixed, right edge of viewport                                    |
| Background       | Semi-transparent dark (`rgba(15, 23, 42, 0.92)`)                 |
| Open transition  | Svelte `fly` from right, 300ms, `quintOut` easing                |
| Close transition | Svelte `fly` to right, 200ms, `quintIn` easing                   |
| Content binding  | Reactive — reads `getTask(graph, focusedTaskId)` via `$derived`  |
| Id watermark     | `task.id` in bottom-right, `opacity: 0.15`, `font-size: 0.75rem` |
| Close trigger    | Background click (no explicit close button) clears focus         |

### Sections

1. **Status badge**: Emoji + status keyword in a colored pill (status color background, white text).
2. **Heading**: `task.shortName` as an `<h2>`.
3. **Description**: `task.description` rendered as paragraph text.
4. **Decisions**: if `task.decisions.length > 0`, a labeled section with each decision as a bullet point.
5. **Attachments**: if `task.attachments.length > 0`, a labeled section showing each attachment with a class icon (📎 artifact, 📖 guidance, 📁 file), MIME type badge, and clickable URI link.
6. **Watermark**: `task.id` as a faint label in the bottom-right corner.

---

## Juice & Animation

The animation system prioritizes **satisfying feedback** — every state change should feel physical, bouncy, and alive.

### Spring Configurations

Named spring presets used throughout the application:

| Name     | Stiffness | Damping | Purpose                                         |
| -------- | --------- | ------- | ----------------------------------------------- |
| `popIn`  | 0.15      | 0.5     | Entry animations — bouncy overshoot             |
| `smooth` | 0.2       | 0.9     | Subtle UI transitions — no overshoot            |
| `bounce` | 0.3       | 0.4     | Interaction feedback — fast, exaggerated bounce |

### Entry Animation

When a graph first loads, nodes appear one-by-one in **dependency order** (leaves first, root last):

1. Compute reverse-depth order (leaves first, root last).
2. For each node in order, with an 80ms stagger delay:
   a. Node scales from 0 → 1 using the `popIn` spring.
   b. A `pop` sound plays, with pitch slightly randomized (±50Hz) so rapid pops don't sound monotonous.
   c. Connected edges fade in (opacity 0 → 0.6) over 200ms after both endpoint nodes are visible.

### Idle Animations

Always-running ambient animations that make the graph feel alive:

| Animation          | Target           | Effect                                                                    |
| ------------------ | ---------------- | ------------------------------------------------------------------------- |
| Label bob          | All node labels  | Gentle vertical oscillation, ±2px, 3s cycle, CSS `@keyframes`             |
| Glow pulse         | `started` nodes  | Outer ring opacity oscillates 0.4 → 0.8, 2s cycle                         |
| Completion shimmer | `complete` nodes | Subtle radial gradient rotation, 6s cycle, gives a "polished gem" effect  |
| Edge flow          | All edges        | `stroke-dashoffset` animation, 30px/s, produces moving-dot flow direction |

### Interaction Feedback

| Trigger         | Animation                                                     | Sound    |
| --------------- | ------------------------------------------------------------- | -------- |
| Hover enter     | Scale 1.0 → 1.08 via `bounce` spring                          | `hover`  |
| Hover leave     | Scale → 1.0 via `smooth` spring                               | —        |
| Click (focus)   | Quick squish: scale 1.0 → 0.9 → 1.1 → 1.0 via `bounce` spring | `pop`    |
| Unfocus         | —                                                             | `whoosh` |
| Sidebar open    | `fly` transition from right                                   | `whoosh` |
| Sidebar close   | `fly` transition to right                                     | —        |
| Graph load      | Staggered `popIn` entry (see above)                           | `pop` ×N |
| Error displayed | Shake animation (±4px horizontal, 3 cycles, 300ms)            | —        |

---

## Sound Design

All sounds are synthesized at runtime using the **Web Audio API** — no audio files needed.

### Audio Engine

A singleton `SoundEngine` module that lazily creates an `AudioContext` on the first user gesture (to comply with browser autoplay policies).

```ts
// Public API of src/lib/sound.ts
function initAudio(): void; // Call on first click/keypress
function playPop(): void; // Bubble appear / click
function playHover(): void; // Hover blip
function playWhoosh(): void; // Camera / sidebar transition
function setMuted(muted: boolean): void;
function isMuted(): boolean;
```

### Sound Palette

| Sound    | Oscillator Type | Frequency           | Envelope (attack / decay) | Character                       |
| -------- | --------------- | ------------------- | ------------------------- | ------------------------------- |
| `pop`    | Sine            | 600 → 200 Hz sweep  | 5ms / 150ms               | Short, satisfying bubble pop    |
| `hover`  | Sine            | 880 Hz (fixed)      | 3ms / 60ms                | Quiet, high-pitched blip        |
| `whoosh` | White noise     | Bandpass 200–800 Hz | 10ms / 300ms              | Soft rush, filtered noise sweep |

### Gain & Mute

- Master `GainNode` at end of audio graph, default volume 0.3.
- Mute state persisted to `localStorage` (`bacchus-ui-muted`).
- Mute toggle button in the Toolbar (top-right corner). Icon: 🔊 / 🔇.
- All `play*()` functions are fire-and-forget and no-op gracefully if `AudioContext` is unavailable or muted.

---

## File Input

### Landing Screen

When no graph is loaded, a full-viewport landing screen is displayed:

- **Title**: "Bacchus" with the project tagline.
- **Drop zone**: Dashed-border rectangle. Accepts `.vine` files via drag-and-drop or a "Browse" button that opens a native file picker.
- **URL input**: Text field below the drop zone. Accepts a URL to a `.vine` file. "Load" button triggers fetch.
- **URL parameter**: On page load, if `?file=<url>` is present in the query string, auto-fetch and load. If the URL loads successfully, the landing screen is skipped entirely. The user can load a different file later via the toolbar (mechanism TBD).

### Pipeline

```
Input text (file or fetch)
  │
  ▼
parse(text)            ← @bacchus/core — may throw VineParseError or VineValidationError
  │
  ▼
Set $state vineGraph   ← triggers reactive graph rendering
```

> `parse()` calls `validate()` internally. No separate validation step is needed.

### Error Handling

If `parse()` throws, the error is caught and displayed as a styled error card on the landing screen:

| Error Type            | Display                                                                      |
| --------------------- | ---------------------------------------------------------------------------- |
| `VineParseError`      | "Parse error on line {line}: {message}" with the offending line highlighted  |
| `VineValidationError` | "Validation error: {constraint}" with details (cycle path, island ids, etc.) |
| Fetch failure         | "Failed to load file: {status} {statusText}" or "Network error"              |

Errors include a "Dismiss" button that returns to the clean landing screen.

---

## Component Architecture

### Component Tree

```
╔═ Embeddable Component (the reusable library surface) ═════════════════════
║  GraphView.svelte              # accepts VineGraph prop
║  ├── GraphEdge.svelte (×N)     # one per dependency link
║  ├── GraphNode.svelte (×N)     # one per task
║  ├── Sidebar.svelte            # shown when focusedTaskId is set
║  ├── Tooltip.svelte            # shown on node hover
║  ├── Legend.svelte             # status color legend
║  ├── PhysicsPanel.svelte       # force-directed layout tuning
║  ├── GlassAccordion.svelte     # shared accordion + glassmorphism
║  ├── ChatPanel.svelte          # AI chat planner panel
║  └── Toolbar.svelte            # mute toggle, overlays
║      └── MuteButton.svelte     # sound toggle
╚══════════════════════════════════════════════════════════════

App.svelte                         # standalone app shell
├── LandingScreen.svelte          # shown when vineGraph is null
│   ├── FileDropZone.svelte       # drag-and-drop + browse button
│   └── UrlInput.svelte           # URL text field + load button
└── GraphView.svelte              # shown when vineGraph is loaded
```

### Component Responsibilities

See each component’s dedicated section for full behavior. Summary of ownership:

- **`App.svelte`** — Top-level state (`vineGraph`, `focusedTaskId`). Routes between landing screen and graph view.
- **`LandingScreen.svelte`** — File input UI. Calls `parse()`, emits loaded graph upward.
- **`GraphView.svelte`** — SVG canvas. Owns D3-force simulation, pan/zoom, and renders nodes/edges. **This is the embeddable component** — it accepts a `VineGraph` prop and is self-contained.
- **`GraphNode.svelte`** / **`GraphEdge.svelte`** — Individual bubble / edge. Own their animations and interaction handlers.
- **`Sidebar.svelte`** — Task detail panel. Reactive to `focusedTaskId`.
- **`Tooltip.svelte`** — Hover popup near cursor.
- **`Toolbar.svelte`** — Top-right controls (mute toggle, future: file reload).

---

## Data Flow

All graph data originates from `@bacchus/core` and flows one-way into the UI. The graph is **mutable via the Chat Planner** — the AI uses structured tool calls (`addTask`, `updateTask`, `setStatus`, `addDependency`, `removeDependency`, `addAttachment`, `removeAttachment`, etc.) to apply validated mutations, which produce new `VineGraph` instances that replace the current state.

### State

`App.svelte` owns two top-level `$state` values: `vineGraph: VineGraph | null` and `focusedTaskId: string | null`.

### Derived values (all via `$derived`)

| Value          | Source                                                                                                 |
| -------------- | ------------------------------------------------------------------------------------------------------ |
| `nodes`        | `vineGraph.order.map(id => getTask(vineGraph, id))` — ordered `Task[]`                                 |
| `links`        | `nodes.flatMap(t => t.dependencies.map(depId => ({ source: t.id, target: depId })))` — ID pairs for D3 |
| `root`         | `getRoot(vineGraph)`                                                                                   |
| `focusedTask`  | `getTask(vineGraph, focusedTaskId)` when focused                                                       |
| `dependants`   | `getDependants(vineGraph, focusedTaskId)` — `Task[]`, used for focus framing top row                   |
| `dependencies` | `getDependencies(vineGraph, focusedTaskId)` — `Task[]`, used for focus framing bottom row              |

> `links` reads raw `task.dependencies` (string IDs) because D3 links only need ID pairs. Focus queries use `getDependencies()` / `getDependants()` to get full `Task` objects.

---

## File Structure

```
packages/ui/
├── package.json
├── tsconfig.json
├── vite.config.ts
├── svelte.config.js
├── index.html
├── src/
│   ├── main.ts                           # Svelte mount point (standalone app)
│   ├── App.svelte                        # App shell: landing screen + graph view
│   ├── app.css                           # Global styles, CSS custom properties
│   └── lib/
│       ├── index.ts                      # Library entry: exports <GraphView> + helpers
│       ├── components/
│       │   ├── GraphView.svelte          # SVG canvas + D3-force (embeddable component)
│       │   ├── GraphNode.svelte          # Single task bubble
│       │   ├── GraphEdge.svelte          # Single dependency edge
│       │   ├── Sidebar.svelte            # Task detail panel
│       │   ├── Tooltip.svelte            # Hover tooltip
│       │   ├── Toolbar.svelte            # Top-right controls
│       │   ├── LandingScreen.svelte      # File picker / URL input (app-only)
│       │   ├── FileDropZone.svelte       # Drag-and-drop zone (app-only)
│       │   ├── UrlInput.svelte           # URL parameter input (app-only)
│       │   └── MuteButton.svelte         # Sound toggle
│       ├── sound.ts                      # Web Audio API SoundEngine
│       ├── layout.ts                     # D3-force simulation setup
│       ├── camera.ts                     # Viewport transform + focus framing
│       ├── physics.ts                    # Physics parameter tuning
│       ├── persistence.ts                # localStorage session persistence
│       ├── status.ts                     # Status → color / emoji / CSS mappings
│       ├── types.ts                      # UI-specific types (SimNode, SimLink, etc.)
│       └── chat/                         # Chat planner module
│           ├── anthropic.ts              # Anthropic API client (streaming + tools)
│           ├── orchestrator.ts           # Tool-use orchestration loop
│           ├── session.ts                # Chat session state management
│           ├── sessionStore.ts           # localStorage session buffer
│           └── tools.ts                  # Graph mutation tools (incl. add_attachment, remove_attachment)
└── __tests__/
    ├── layout.test.ts
    ├── camera.test.ts
    ├── sound.test.ts
    └── status.test.ts
```

`src/lib/index.ts` is the **library entry point**. It re-exports `<GraphView>` and any public helpers (status mappings, types). Consumers embedding the graph in another Svelte app import from here. The standalone app (`main.ts` → `App.svelte`) is a separate concern that uses the same library entry.

---

## Dependencies

| Package                        | Version       | Purpose                                    |
| ------------------------------ | ------------- | ------------------------------------------ |
| `svelte`                       | ^5.0          | UI framework — runes, transitions, springs |
| `@sveltejs/vite-plugin-svelte` | ^5.0          | Vite integration for Svelte compilation    |
| `d3-force`                     | ^3.0          | Force-directed graph layout simulation     |
| `d3-selection`                 | ^3.0          | SVG element selection (zoom setup)         |
| `d3-zoom`                      | ^3.0          | Pan + ctrl+scroll zoom                     |
| `@bacchus/core`                | `workspace:*` | Vine parser, validator, graph queries      |

Dev dependencies inherit from the workspace root (`typescript`, `vitest`, `eslint`, `prettier`).

---

## Test Strategy

**Framework**: Vitest
**Target**: >90% line coverage on non-component modules

### Test Suites

| Suite                 | Focus                                                                                                                                             |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `layout.test.ts`      | D3 simulation produces valid positions; root is near center; no overlapping nodes after settle; depth ring ordering holds.                        |
| `camera.test.ts`      | Bounding box computation for focus framing; scale/translate fits all nodes; edge case: root focused (no dependants).                              |
| `sound.test.ts`       | `AudioContext` mock — `playPop`/`playHover`/`playWhoosh` create correct oscillator configs; mute state persists; graceful no-op when unavailable. |
| `status.test.ts`      | Every `Status` value has a mapped color, emoji, and CSS class; no missing entries; exhaustive switch coverage.                                    |
| `physics.test.ts`     | Physics parameter defaults, clamping, and reset behavior.                                                                                         |
| `persistence.test.ts` | Session round-trip to localStorage, circular buffer eviction, per-graph keying.                                                                   |
| `chat/*.test.ts`      | Anthropic API client, orchestrator tool loop, session state, session store, tool feedback rendering.                                              |

### Visual / E2E Testing

Deferred to a future phase. Will use Playwright for:

- Graph renders correct number of nodes and edges from a sample `.vine` file.
- Click a node → sidebar opens with correct content.
- Click background → sidebar closes.
- Pan and zoom gestures move the viewport.

### Verification Commands

> **⚠️ Do not use npm.** This project uses **Yarn 4 (Berry)** exclusively. Always use `yarn` commands.

```bash
yarn workspace @bacchus/ui dev        # Start dev server with hot reload
yarn workspace @bacchus/ui build      # Production build to dist/
yarn workspace @bacchus/ui test       # Run unit tests
yarn vitest run --coverage            # All tests across workspace, >90% coverage
yarn typecheck                        # Zero type errors under strictest settings
```
