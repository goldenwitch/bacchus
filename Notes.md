# Project Bacchus

- Build a graph of tasks in a .vine file
- Visualize the graph as a "vine" of dependent tasks to achieve the goal.
- Consume tasks via the CLI
- Update tasks via the CLI

# Components

## Graph Format (.vine)

Lightweight task description format.

Tasks are listed in default completion task order, but this is not enforced.

Tasks have:

1. Id
1. Short name
1. Description
1. Status
1. Decisions

The task status varies by completeness:

- Complete (100% done)
- Not Started (Planning complete but not started)
- Planned (Planning started but not complete)
- Blocked (Needs intervention to resume)
- Started (Implementation has started but has no completed)

Detailed design [VINE](VINE.md)
Typescript Library [VINE-TS](VINE-TS.md)

## Graph Visualizer (BacchusUI)

Given a graph input file, render a graph using https://d3js.org/d3-force

Controls are click and drag the map to pan, ctrl+scroll to zoom

Root of the tree at the very center, with branches of dependencies.
Each item represents some task, with edges connecting to the tasks it is dependent on.
No islands should be displayed, all elements should attach to at least one other element and that other element should be connected to the root.

Goal is to capture a really juicy video game/incremental game aesthetic.
Each task should "pop" into existence as a juicy bubble, complete with sound effect.

Words should "float" on the bubbles, describing the task's short name and offering a summary of the status on hover.

Each task status has a distinctive color, signaling the level of completeness.
Each task status has an accompanying emoji, signaling the level of completeness.

Detailed design [BacchusUI](BacchusUI.md)

### Focus & Sidebar behavior

When a task is clicked, it should display it's description, status, and decisions in a sidebar.
Id should be available as a watermark for debugging.

When anything other than the sidebar is clicked after the sidebar is opened "focus" should disappear from the graph element.
The idea is to have each element focusable on click, and then clear their focus when they look away.

When an element is focused, in addition to the sidebar, the "camera" should frame:

1. The parent of the element at the top of the screen
2. The element in the center of the screen
3. The dependencies of the element at the bottom of the screen.

All elements in this focused view must fit on the screen.

-------------------------------CUT-LINE-------------------------------

## Disambiguation Prompt

Pops three options up on screen for the user to pick one.

## Chat Planner

Ability to edit/create task graphs.

## Graph Interface

Cli for pulling work, creating work, and updating work.

## Visualization Formats

Tasklist view.
