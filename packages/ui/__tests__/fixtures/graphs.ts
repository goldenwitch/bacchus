import type { VineGraph, Task } from '@bacchus/core';

function makeTask(overrides: Partial<Task> & { id: string }): Task {
  return {
    id: overrides.id,
    shortName: overrides.shortName ?? overrides.id,
    description: overrides.description ?? `Description for ${overrides.id}`,
    status: overrides.status ?? 'notstarted',
    dependencies: overrides.dependencies ?? [],
    decisions: overrides.decisions ?? [],
  };
}

/** 3 tasks: leaf → mid → root */
export function simpleGraph(): VineGraph {
  const tasks = new Map<string, Task>();
  tasks.set('leaf', makeTask({ id: 'leaf', shortName: 'Leaf Task', status: 'complete' }));
  tasks.set('mid', makeTask({ id: 'mid', shortName: 'Middle Task', status: 'started', dependencies: ['leaf'] }));
  tasks.set('root', makeTask({ id: 'root', shortName: 'Root Task', status: 'notstarted', dependencies: ['mid'] }));
  return { tasks, order: ['leaf', 'mid', 'root'] };
}

/** 5 tasks, one per status: task-e → task-d → task-c → task-b → task-a */
export function fiveStatusGraph(): VineGraph {
  const tasks = new Map<string, Task>();
  tasks.set('task-e', makeTask({ id: 'task-e', shortName: 'Task E', status: 'complete' }));
  tasks.set('task-d', makeTask({ id: 'task-d', shortName: 'Task D', status: 'started', dependencies: ['task-e'] }));
  tasks.set('task-c', makeTask({ id: 'task-c', shortName: 'Task C', status: 'notstarted', dependencies: ['task-d'] }));
  tasks.set('task-b', makeTask({ id: 'task-b', shortName: 'Task B', status: 'planning', dependencies: ['task-c'] }));
  tasks.set('task-a', makeTask({ id: 'task-a', shortName: 'Task A', status: 'blocked', dependencies: ['task-b'] }));
  return { tasks, order: ['task-e', 'task-d', 'task-c', 'task-b', 'task-a'] };
}

/** 1 standalone task */
export function singleTaskGraph(): VineGraph {
  const tasks = new Map<string, Task>();
  tasks.set('only', makeTask({ id: 'only', shortName: 'Single Task', status: 'complete' }));
  return { tasks, order: ['only'] };
}

/** 4 tasks in a diamond: leaf → left + right → root */
export function diamondGraph(): VineGraph {
  const tasks = new Map<string, Task>();
  tasks.set('leaf', makeTask({ id: 'leaf', shortName: 'Leaf Task', status: 'complete' }));
  tasks.set('left', makeTask({ id: 'left', shortName: 'Left Branch', status: 'started', dependencies: ['leaf'] }));
  tasks.set('right', makeTask({ id: 'right', shortName: 'Right Branch', status: 'planning', dependencies: ['leaf'] }));
  tasks.set('root', makeTask({ id: 'root', shortName: 'Diamond Root', status: 'notstarted', dependencies: ['left', 'right'] }));
  return { tasks, order: ['leaf', 'left', 'right', 'root'] };
}

/** 2 tasks with decisions on root */
export function decisionsGraph(): VineGraph {
  const tasks = new Map<string, Task>();
  tasks.set('dep', makeTask({ id: 'dep', shortName: 'Dependency Task', status: 'complete' }));
  tasks.set('root', makeTask({
    id: 'root',
    shortName: 'Decision Root',
    status: 'started',
    dependencies: ['dep'],
    decisions: [
      'Use approach A for the backend.',
      'Prefer library X over library Y.',
      'Deploy to staging first.',
    ],
  }));
  return { tasks, order: ['dep', 'root'] };
}

/** Tasks with 2-char and 30-char names */
export function longNamesGraph(): VineGraph {
  const tasks = new Map<string, Task>();
  tasks.set('short-name', makeTask({ id: 'short-name', shortName: 'AB', status: 'complete' }));
  tasks.set('long-name', makeTask({ id: 'long-name', shortName: 'This Is A Very Long Task Name!!', status: 'started', dependencies: ['short-name'] }));
  tasks.set('root', makeTask({ id: 'root', shortName: 'Root Task', status: 'notstarted', dependencies: ['long-name'] }));
  return { tasks, order: ['short-name', 'long-name', 'root'] };
}
