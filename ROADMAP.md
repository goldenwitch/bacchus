# Bacchus Roadmap

This document outlines the development roadmap for Project Bacchus—a task graph visualization and planning system. It covers what has been built, what's coming next, and ideas under exploration.

## Implemented

The following features are currently available:

- **VINE Format Parser & Validator** (`@bacchus/core`): A lightweight task description format with support for task IDs, names, descriptions, statuses, and decisions
- **Interactive Graph Visualization** (`@bacchus/ui`): Renders task graphs using force-directed layout with D3.js
- **Force-Directed Layout with Physics Controls**: Adjustable physics simulation for graph positioning
- **Focus Mode with Camera Framing**: Click a task to focus it, framing the parent, selected task, and dependencies on screen
- **Sound Effects & Animations**: Tasks "pop" into existence with visual and audio feedback for a polished experience

## Planned

High-priority features in active development:

- **CLI Tool**: Command-line interface for pulling, creating, and updating tasks directly from `.vine` files
- **Chat Planner**: Ability to edit and create task graphs through natural conversation

## Exploring

Ideas under consideration for future development:

- **Disambiguation Prompt**: Present multiple options on screen for user selection when context is ambiguous
- **Alternative Visualizations**: Support for additional views such as a flat tasklist format
- **Tagging & Clustering**: Group related tasks visually with cluster-level forces, potentially supporting dependencies between clusters
- **Rich Task Content**: Extend tasks with markdown links, images, guidelines, prompts, and suggested tools—likely implemented as an authoring or extensibility layer
