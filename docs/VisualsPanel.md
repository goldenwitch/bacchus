# Visuals Controls Panel — Design Spec

## Overview

A collapsible floating panel on the left edge of the graph view (below the Physics panel), visually matched to the existing Toolbar/Legend glassmorphism style. Collapsed state is a single icon button (🎨). Expanded state reveals ~26 labeled sliders plus a sprite URI input controlling visual rendering parameters. Changes take effect immediately via reactive props and CSS custom property injection. Values persist to `localStorage`. A global "Reset to Defaults" button restores all values.

---

## Visual Placement & Layering

- **Position**: `absolute`, left side (`left: 16px; top: 110px`) — stacked below the Physics panel
- **z-index**: `134` — below Physics (135) to stay under it when both are open
- **Collapsed**: matching Legend/Toolbar glassmorphism (`var(--toolbar-bg)`, `backdrop-filter: blur(8px)`, `border: 1px solid var(--border-subtle)`, `border-radius: 12px`)
- **Expanded**: panel grows to ~230px wide, max-height ~calc(100vh - 230px) with `overflow-y: auto`. Uses the shared `GlassAccordion.svelte` component
- **Hidden on mobile** (`< 640px`) — same as Physics panel

---

## Parameter Groups & Sliders

Organized into logical groups with small section headers:

### Glow

| Slider Label | Parameter           | Min | Max | Step | Default |
| ------------ | ------------------- | --- | --- | ---- | ------- |
| Glow Blur    | `glowBlurRadius`    | 0   | 15  | 0.5  | 3.5     |
| Glow Stroke  | `glowStrokeWidth`   | 0.5 | 8   | 0.5  | 2.5     |
| Glow Opacity | `glowBaseOpacity`   | 0   | 1   | 0.05 | 0.6     |
| Pulse Min    | `glowPulseMin`      | 0   | 1   | 0.05 | 0.4     |
| Pulse Max    | `glowPulseMax`      | 0   | 1   | 0.05 | 0.8     |
| Pulse Speed  | `glowPulseDuration` | 0.5 | 8   | 0.5  | 2.0     |
| Ring Offset  | `glowRadiusOffset`  | 0   | 20  | 1    | 6       |

### Dimming

| Slider Label  | Parameter                | Min | Max | Step | Default |
| ------------- | ------------------------ | --- | --- | ---- | ------- |
| Dimmed Nodes  | `dimmedNodeOpacity`      | 0   | 1   | 0.05 | 0.45    |
| Dimmed Edges  | `dimmedEdgeOpacity`      | 0   | 1   | 0.05 | 0.15    |
| Default Edges | `defaultEdgeOpacity`     | 0   | 1   | 0.05 | 0.6     |
| Focused Edges | `highlightedEdgeOpacity` | 0   | 1   | 0.05 | 1.0     |

### Edges

| Slider Label   | Parameter           | Min | Max | Step | Default |
| -------------- | ------------------- | --- | --- | ---- | ------- |
| Vine Width     | `vineStrokeWidth`   | 0.5 | 8   | 0.5  | 2.5     |
| Wave Amplitude | `vineWaveAmplitude` | 0   | 20  | 1    | 5       |
| Wave Frequency | `vineWaveFrequency` | 0   | 10  | 0.5  | 3       |
| Vine Segments  | `vineSegments`      | 2   | 20  | 1    | 8       |
| Leaf Scale     | `leafScale`         | 0.5 | 6   | 0.1  | 2.2     |
| Leaf Opacity   | `leafOpacity`       | 0   | 1   | 0.05 | 0.4     |
| Flow Speed     | `edgeFlowDuration`  | 0.5 | 8   | 0.5  | 2.0     |

### Animations

| Slider Label  | Parameter           | Min | Max | Step | Default |
| ------------- | ------------------- | --- | --- | ---- | ------- |
| Shimmer Speed | `shimmerDuration`   | 1   | 20  | 0.5  | 6.0     |
| Sway Angle    | `leafSwayAngle`     | 0   | 15  | 1    | 3       |
| Sway Speed    | `leafSwayDuration`  | 1   | 12  | 0.5  | 4.0     |
| Entry Stagger | `entryStaggerDelay` | 20  | 300 | 10   | 80      |

### Sizing

| Slider Label | Parameter          | Min | Max | Step | Default |
| ------------ | ------------------ | --- | --- | ---- | ------- |
| Min Radius   | `nodeRadiusMin`    | 20  | 80  | 2    | 40      |
| Max Radius   | `nodeRadiusMax`    | 30  | 120 | 2    | 60      |
| Badge Size   | `emojiBadgeRadius` | 6   | 24  | 1    | 12      |
| Badge Font   | `emojiFontSize`    | 8   | 28  | 1    | 14      |

### Sprite

A text input field for specifying a custom SVG sprite URI that overrides the default bubble sprite for all nodes. The URI should point to an SVG file containing a `<symbol>` element.

- **Apply button**: commits the entered URI
- **Clear button** (✕): removes the override, restoring the default sprite
- **Active indicator**: shows the currently applied sprite URI when set

---

## Interaction Model

- **Slider drag** → updates the parameter value → propagated reactively via Svelte props to `GraphNode` and `GraphEdge` components. CSS-animation-related values are injected as CSS custom properties on `:root`
- **Sprite URI** → entered in text field, committed with "Apply Sprite" button or Enter key → stored alongside slider overrides
- **Global Reset button**: at the bottom of the panel body, clears all overrides, restores defaults, removes `localStorage` key, and re-injects default CSS variables
- **Collapse/expand**: clicking the header icon toggles the panel body. State is ephemeral — always starts collapsed

---

## Architecture

### Data Layer (`visuals.ts`)

Pure TypeScript module (no Svelte runes) with:

- `VisualsConfig` interface — flat object of all tuneable values
- `VisualsSliderDef[]` — ordered array driving the slider UI
- `getDefaults()` → returns hardcoded default config
- `loadOverrides()` → reads from `localStorage["bacchus-visuals"]`
- `saveOverrides(overrides)` → debounced 200ms write
- `clearOverrides()` → removes key and cancels pending save
- `resolveConfig(overrides)` → spreads defaults + overrides
- `injectVisualsCSS(config)` → sets CSS custom properties on `:root`

### Reactive Flow

1. `GraphView.svelte` owns `$state` variables: `visualsOverrides`, `visualsConfig`
2. `VisualsPanel.svelte` receives `config` (read-only) and fires `onchange`/`onspritechange`/`onreset` callbacks
3. On change: `GraphView` updates overrides → resolves config → saves → CSS injection via `$effect`
4. `visualsConfig` is passed as a prop to `GraphNode` and `GraphEdge`, which read it reactively

### CSS Custom Properties

Animation durations that can't be passed as props (since they're in CSS `@keyframes` classes) are injected as CSS variables:

| CSS Variable                | Controlled By       | Default Fallback |
| --------------------------- | ------------------- | ---------------- |
| `--vis-glow-pulse-duration` | `glowPulseDuration` | `2s`             |
| `--vis-shimmer-duration`    | `shimmerDuration`   | `6s`             |
| `--vis-edge-flow-duration`  | `edgeFlowDuration`  | `2s`             |
| `--vis-leaf-sway-angle`     | `leafSwayAngle`     | `3deg`           |
| `--vis-leaf-sway-duration`  | `leafSwayDuration`  | `4s`             |
| `--vis-glow-pulse-min`      | `glowPulseMin`      | `0.4`            |
| `--vis-glow-pulse-max`      | `glowPulseMax`      | `0.8`            |

---

## Persistence (localStorage)

- **Key**: `"bacchus-visuals"` — stores a JSON object of only the user-overridden values (sparse)
- **On load**: `GraphView` reads from `localStorage` and applies overrides
- **On reset**: the key is removed from `localStorage` entirely
- **Write frequency**: debounced ~200ms per slider `input` event

---

## Styling Details

- Follows the established glassmorphism pattern via `GlassAccordion`
- Slider track styled with `accent-color: var(--focus-ring)`
- Group headers: small uppercase labels in `var(--text-dimmed)`, `font-size: 0.75rem`
- Value readout: tabular-nums, `font-size: 0.72rem`, `var(--text-muted)`
- Reset button: subtle outlined style matching Physics panel
- Sprite input: minimal text field with clear button
- Respects light/dark theme via existing CSS custom properties
- Scrollbar: thin, styled to match theme on overflow

---

## Accessibility

- All sliders have `aria-label` matching their display label
- Sprite input has `aria-label`
- GlassAccordion provides `aria-expanded` state
- Keyboard: sliders respond to arrow keys; sprite input triggers on Enter
- Respects `prefers-reduced-motion` via existing CSS media query (all animation classes have `animation: none !important`)
