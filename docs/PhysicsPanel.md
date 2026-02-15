# Physics Controls Panel — Design Spec

## Overview

A collapsible floating panel on the left edge of the graph view, visually matched to the existing Toolbar/Legend glassmorphism style. Collapsed state is a single icon button (sliders icon). Expanded state reveals ~10 labeled sliders controlling the core D3-force parameters. Changes reheat the simulation immediately, giving real-time visual feedback. Values persist to `localStorage`. A global "Reset to Defaults" button restores all sliders.

---

## Visual Placement & Layering

- **Position**: `absolute`, left side, vertically centered (`left: 16px; top: 50%; transform: translateY(-50%)`)
- **z-index**: `135` — above Legend (130) but below Hints (140) and Toolbar (150)
- **Collapsed**: a 40×40px circle/rounded-square button with a sliders icon (🎛️ or an SVG sliders icon), matching Legend/Toolbar glassmorphism (`var(--toolbar-bg)`, `backdrop-filter: blur(8px)`, `border: 1px solid var(--border-subtle)`, `border-radius: 12px`)
- **Expanded**: panel grows to ~240px wide, max-height ~70vh with `overflow-y: auto`. The toggle button stays at the top of the panel as the header. Expand/collapse uses Svelte `slide` transition for the body

---

## Parameter Groups & Sliders

Organized into logical groups with small section headers:

| Group | Slider Label | Parameter | Min | Max | Step | Default |
|-------|-------------|-----------|-----|-----|------|---------|
| **Repulsion** | Charge Strength | `chargeStrength` | -1200 | -50 | 10 | -350 / -600 (auto) |
| | Charge Range | `distanceMax` | 100 | 1500 | 50 | 600 |
| **Links** | Link Strength | `link.strength` | 0.05 | 1.0 | 0.05 | 0.7 |
| | Edge Gap | `MIN_EDGE_GAP` | 20 | 200 | 5 | 80 |
| **Collisions** | Collision Padding | collide radius padding | 0 | 40 | 2 | 16 |
| | Collision Strength | `collide.strength` | 0.1 | 1.0 | 0.05 | 0.9 |
| **Layout** | Layer Spacing | `layerSpacing` | 80 | 400 | 10 | 180 / 220 (auto) |
| | Layer Strength | `layerStrength` | 0.0 | 0.5 | 0.01 | 0.12 |
| | Cluster Strength | `clusterStrength` | 0.0 | 0.5 | 0.01 | 0.15 |
| **Damping** | Velocity Decay | `velocityDecay` | 0.05 | 0.9 | 0.05 | 0.45 |

Each slider shows: **label** on the left, **current value** on the right, HTML `<input type="range">` below. The value display updates live as the user drags.

---

## Interaction Model

- **Slider drag** → updates the parameter value → calls `simulation.force('charge').strength(newVal)` (etc.) → reheats simulation with `sim.alpha(0.3).restart()` so nodes visibly rearrange
- **Auto-scaling awareness**: Charge strength and layer spacing currently auto-scale based on node count (`n > 8`). Once the user touches a slider, the manual value overrides the auto value. The "auto" default is shown as the initial slider position based on the current graph's node count
- **Global Reset button**: at the bottom of the panel body, a button labelled "Reset Defaults" clears all overrides, restores auto-scaling logic, removes `localStorage` keys, and reheats the simulation
- **Collapse/expand**: clicking the header icon toggles the panel body. State (expanded/collapsed) is ephemeral — always starts collapsed

---

## Persistence (localStorage)

- **Key**: `"bacchus-physics"` — stores a JSON object of only the user-overridden values (sparse, not all 10)
- **On load**: `createSimulation` reads from `localStorage` and applies overrides before starting
- **On reset**: the key is removed from `localStorage` entirely
- **Write frequency**: values are written on every slider `input` event (debounced ~200ms to avoid thrashing)

---

## Styling Details

- Follows the established glassmorphism pattern: `background: var(--toolbar-bg)`, `backdrop-filter: blur(8px)`, `border: 1px solid var(--border-subtle)`, `border-radius: 12px`
- Slider track styled with `accent-color: var(--text-accent)` or custom range styling to match theme
- Group headers: small uppercase labels in `var(--text-secondary)`, `font-size: 0.7rem`
- Value readout: monospace-ish, `font-size: 0.75rem`, `var(--text-secondary)`
- Reset button: subtle outlined style, `var(--border-subtle)` border, icon + text
- Respects light/dark theme via existing CSS custom properties
- Scrollbar: thin, styled to match theme on overflow

---

## Mobile / Responsive

- On narrow viewports (`< 640px`): panel is hidden entirely — physics tuning is a power-user feature and mobile touch on sliders is awkward
- Implemented via `@media (max-width: 639px) { display: none; }`

---

## Accessibility

- Range inputs get `aria-label` with the parameter name and current value
- Panel header button gets `aria-expanded` reflecting state
- Focus management: tabbing through sliders works naturally
- Keyboard: sliders respond to arrow keys natively
