# 2D Rigid Body Physics Visualizer — VINE Project

## What This Is

This folder contains a multi-file `.vine` project describing a **2D rigid body physics visualizer** — a single-page application built with Vite, TypeScript, and the HTML Canvas 2D API. The project has **zero runtime dependencies** — all physics, rendering, and UI are implemented in pure TypeScript.

The `.vine` task graph is designed so that **any AI coding assistant** with the Bacchus VINE MCP tools can execute it and reliably produce the same set of features. The root graph (`physics-spa.vine`) decomposes the project into 6 phases: **Setup → Engine → Renderer → UI → Scenes → Polish**.

### Files

| File | Covers |
|------|--------|
| `physics-spa.vine` | Root graph with ref blocks |
| `setup.vine` | Vite project scaffolding |
| `engine.vine` | Physics engine (Vec2, rigid bodies, forces, collision detection/resolution, integration, world) |
| `renderer.vine` | Canvas 2D rendering, camera, debug overlays |
| `ui.vine` | Toolbar, parameter sliders, scene selector, mouse/keyboard interaction |
| `scenes.vine` | 5 demo scenes (stacking boxes, Newton's cradle, billiards, dominoes, mixed shapes) |
| `polish.vine` | Responsive layout, performance optimization, visual polish, error handling |

## How to Use

1. Open this folder (or the parent workspace) in VS Code with the **Bacchus VINE** extension installed.
2. Open `physics-spa.vine` — the extension's MCP server will load the full graph including all referenced sub-files.
3. Ask the AI assistant: *"Show me the next tasks I can work on"* — it will call `vine_next_tasks` to find tasks whose dependencies are all complete.
4. Ask the assistant to implement each task. It will write the TypeScript code, update the task status to `complete`, and move on.
5. Follow the dependency order: **setup → engine → renderer → ui → scenes → polish**. The graph enforces this — you can't start a task until its dependencies are done.
6. After all tasks are complete, run `npm run dev` to launch the app and validate against the checklist below.

**Tip:** You can also ask the assistant to implement an entire sub-file at once: *"Implement all tasks in engine.vine"*.

## Visual Validation Checklist

This checklist covers every user-facing feature specified in the .vine task graph. Use it for **manual testing** or as assertions for **Playwright MCP** automated testing.

### App Structure

- [ ] `npm run dev` starts the Vite dev server and the app loads at `http://localhost:5173`
- [ ] A `<canvas>` element is visible and fills the main content area
- [ ] A sidebar/controls panel (≈280px wide) is visible to the right of the canvas
- [ ] The page has no console errors on initial load

### Physics Simulation

- [ ] The default scene ("Stacking Boxes") loads automatically on startup
- [ ] Boxes fall downward under gravity
- [ ] Boxes collide with the static floor and stop
- [ ] Boxes stack on top of each other without jittering through the floor
- [ ] Stacked boxes reach a stable resting state within a few seconds
- [ ] No bodies exhibit NaN positions or fly off to infinity

### Simulation Controls

- [ ] A **Play/Pause** button is visible in the toolbar and toggles simulation
- [ ] A **Step** button advances the simulation by one frame when paused
- [ ] A **Reset** button restores the current scene to its initial state
- [ ] The **Gravity slider** (0–30) changes how fast bodies fall in real time
- [ ] The **Restitution slider** (0–1) affects bounciness of newly spawned bodies
- [ ] The **Friction slider** (0–1) affects friction of newly spawned bodies

### Scene Selector

- [ ] A dropdown lists all 5 scenes: Stacking Boxes, Newton's Cradle, Billiards Break, Domino Chain, Mixed Shapes
- [ ] Selecting a different scene clears the world and loads the new scene
- [ ] **Newton's Cradle**: pulling and releasing an end ball transfers momentum to the opposite end
- [ ] **Billiards Break**: cue ball strikes the rack and balls scatter realistically
- [ ] **Domino Chain**: tipping the first domino topples the entire chain in sequence
- [ ] **Mixed Shapes**: circles and rectangles bounce around inside a walled enclosure

### Mouse & Keyboard Interaction

- [ ] Clicking on a body **selects** it (highlighted with a distinct outline)
- [ ] Dragging a selected body shows a **force vector** line, and releasing applies an impulse
- [ ] **Shift+Click** on empty space **spawns** a new body (alternating circle/rectangle)
- [ ] **Middle-mouse drag** pans the camera
- [ ] **Scroll wheel** zooms in/out, centered on the cursor
- [ ] **Space** key toggles play/pause
- [ ] **R** key resets the current scene
- [ ] **G** key toggles gravity on/off
- [ ] **D** key toggles debug overlays on/off

### Debug Overlays (toggle with D key)

- [ ] Velocity vectors are drawn as arrows from each body's center
- [ ] AABB wireframes are drawn as dashed rectangles around each body
- [ ] Contact points are shown as small red dots
- [ ] Contact normals are shown as short arrows at contact points
- [ ] Center-of-mass crosshairs are visible on each body

### Info Panel

- [ ] Body count is displayed and updates when bodies are added/removed
- [ ] FPS counter is displayed and shows a stable value
- [ ] Selecting a body shows its position, velocity, angle, mass, and shape type

### Performance & Polish

- [ ] FPS remains ≥ 55 with the default scene running
- [ ] Canvas re-renders correctly without distortion after browser window resize
- [ ] On narrow viewports (<768px), the sidebar collapses and a menu button appears
- [ ] Bodies are colored by shape type (circles: blue, rectangles: orange, static: gray)

---

### Playwright MCP Notes

Each checklist item above can be validated via Playwright MCP by navigating to the dev server URL and using assertions like `expect(locator).toBeVisible()`, `expect(canvas).toHaveScreenshot()`, or evaluating JavaScript expressions in the page context to inspect simulation state.

For physics behavior checks (e.g., "boxes fall under gravity"), use `page.evaluate()` to read body positions from the `PhysicsWorld` instance at two points in time and assert that Y positions have increased (assuming a Y-down coordinate system) or decreased (Y-up).

For visual regression, Playwright's screenshot comparison can verify the rendering looks correct across runs.

Expose a `window.__physicsWorld` reference in dev mode so Playwright can inspect simulation state directly.
