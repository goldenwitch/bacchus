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

/** Returns the root task (last in order). */
export function getRoot(graph: VineGraph): Task {
  const lastId = graph.order[graph.order.length - 1];
  if (lastId === undefined) {
    throw new VineError('Cannot get root: order is empty');
  }
  return getTask(graph, lastId);
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

/**
 * Returns all transitive dependencies (ancestors) of a task.
 * Useful for viz camera framing. BFS through dependency edges.
 * Does NOT include the starting task itself.
 */
export function getAncestors(graph: VineGraph, id: string): Task[] {
  const start = getTask(graph, id);
  const visited = new Set<string>();
  const queue: string[] = [...start.dependencies];
  const ancestors: Task[] = [];

  for (const dep of queue) {
    visited.add(dep);
  }

  while (queue.length > 0) {
    const currentId = queue.shift();
    if (currentId === undefined) break;
    const current = getTask(graph, currentId);
    ancestors.push(current);

    for (const depId of current.dependencies) {
      if (!visited.has(depId)) {
        visited.add(depId);
        queue.push(depId);
      }
    }
  }

  return ancestors;
}
