import type { Task, VineGraph } from './types.js';
import { VineError } from './errors.js';

/** Returns the task with the given id. Throws VineError if not found. */
export function getTask(graph: VineGraph, id: string): Task {
  const task = graph.tasks.get(id);
  if (!task) {
    throw new VineError(`Task not found: ${id}`);
  }
  return task;
}

/** Returns the id of the root task (first in order). */
export function getRootId(graph: VineGraph): string {
  const firstId = graph.order[0];
  if (firstId === undefined) {
    throw new VineError('Cannot get root: order is empty');
  }
  return firstId;
}

/** Returns the root task (first in order). */
export function getRoot(graph: VineGraph): Task {
  return getTask(graph, getRootId(graph));
}

/** Returns direct dependencies of a task (resolved to Task objects). */
export function getDependencies(graph: VineGraph, id: string): Task[] {
  const task = getTask(graph, id);
  return task.dependencies.map((depId) => getTask(graph, depId));
}

/** Returns tasks that depend on the given task (reverse lookup). */
export function getDependants(graph: VineGraph, id: string): Task[] {
  // Ensure the task exists before searching for dependants.
  getTask(graph, id);

  const result: Task[] = [];
  for (const task of graph.tasks.values()) {
    if (task.dependencies.includes(id)) {
      result.push(task);
    }
  }
  return result;
}
