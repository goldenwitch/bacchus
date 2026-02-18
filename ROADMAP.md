# Bacchus Roadmap

This document outlines the development roadmap for Project Bacchus—a task graph visualization and planning system. It covers what has been built, what's coming next, and ideas under exploration.

## Implemented

The following features are currently available:

- **VINE Format Parser & Validator** (`@bacchus/core`): A lightweight task description format with support for task IDs, names, descriptions, statuses, and decisions
- **Interactive Graph Visualization** (`@bacchus/ui`): Renders task graphs using force-directed layout with D3.js
- **Force-Directed Layout with Physics Controls**: Adjustable physics simulation for graph positioning
- **Focus Mode with Camera Framing**: Click a task to focus it, framing the parent, selected task, and dependencies on screen
- **Sound Effects & Animations**: Tasks "pop" into existence with visual and audio feedback for a polished experience
- **CLI Tool** (`@bacchus/cli`): Command-line interface for validating, viewing, listing, adding, and updating tasks in `.vine` files
- **Chat Planner** (`@bacchus/ui`): AI-powered chat panel for creating and editing task graphs through natural conversation. Uses Anthropic Claude with structured tool-use to call validated graph mutations. Includes API key management (localStorage), streaming responses, and a toggleable left-side chat panel.
- **Chat Planner Enhancements** (`@bacchus/ui`): Persistent chat state across views (landing ↔ graph), session persistence across refreshes per `.vine` file (localStorage circular buffer, max 5 sessions), URL routing (`/bacchus/{vineId}`), and structured tool feedback cards showing rich detail for each graph mutation.
- **Chat E2E Test Suite** (`@bacchus/ui`): Comprehensive Playwright e2e tests for all conversational flows. Includes 16 deterministic mocked tests (SSE interception via `page.route`) and 6 live-agent tests against the real Anthropic API. Shared helper layer for SSE response construction, API key seeding, and chat interactions.
- **Shared GlassAccordion Component** (v0.1.0): Extracted common accordion + glassmorphism pattern used by Physics, Legend, and Chat panels into a reusable `GlassAccordion.svelte` component
- **Chat Panel Accordion** (v0.1.0): Converted the Chat Planner from a floating window to the same collapsible accordion pattern used by Physics and Legend, with consistent glassmorphism styling
- **Dead Code Removal** (v0.1.0): Removed unused `chat/index.ts` barrel file, unused `clearApiKey` export, unused `getAncestors` graph query, and aspirational `07-browser-bridge.vine` example
- **E2E Test Fixes** (v0.1.0): Fixed API key entry flow tests that failed when `VITE_ANTHROPIC_API_KEY` was set via `.env`, by adding `clearApiKey` e2e helper to neutralize env-injected keys
- **Version Alignment** (v0.1.0): All packages (`@bacchus/core`, `@bacchus/cli`, `@bacchus/ui`) aligned to v0.1.0
- **Documentation Refresh** (v0.1.0): Updated stale design docs (PhysicsPanel.md params, VINE-TS.md mutations/search modules, docs README index), added end-user guide with annotated screenshots
- **Luxury Color Palette**: Replaced the default Tailwind-derived status colors with a polychromatic luxury palette — emerald (complete), antique gold (started), polished silver (not started), royal purple (planning), and crimson (blocked). Sapphire for focus rings, gold for root-task highlight. Light theme uses a seafoam background instead of white.
- **UX Fixes**: Volume slider now drops down below the toolbar instead of popping up off-screen. Resolved all ESLint strict-mode errors (10 lint issues across anthropic.ts, MarkdownMessage.svelte, Toolbar.svelte, and persistence.ts).

## Exploring

Ideas under consideration for future development:

- **Disambiguation Prompt**: Present multiple options on screen for user selection when context is ambiguous
- **Alternative Visualizations**: Support for additional views such as a flat tasklist format
- **Tagging & Clustering**: Group related tasks visually with cluster-level forces, potentially supporting dependencies between clusters
- **Rich Task Content**: Extend tasks with markdown links, images, guidelines, prompts, and suggested tools—likely implemented as an authoring or extensibility layer
