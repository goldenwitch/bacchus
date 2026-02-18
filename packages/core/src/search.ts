import type { Status, Task, VineGraph } from './types.js';
import { getTask, getDependants } from './graph.js';
import { VineError } from './errors.js';

/**
 * Aggregate summary of a VineGraph.
 */
export interface GraphSummary {
  readonly total: number;
  readonly byStatus: Readonly<Record<Status, number>>;
  readonly rootId: string;
  readonly rootName: string;
  readonly leafCount: number;
}

/**
 * Returns all tasks matching the given status, in graph order.
 * Returns an empty array if no tasks match.
 */
export function filterByStatus(graph: VineGraph, status: Status): Task[] {
  const result: Task[] = [];
  for (const id of graph.order) {
    const task = getTask(graph, id);
    if (task.status === status) {
      result.push(task);
    }
  }
  return result;
}

/**
 * Case-insensitive substring search against task id, shortName, and description.
 * Returns matching tasks in graph order.
 * If query is empty string, returns all tasks.
 * Returns an empty array if no matches.
 */
export function searchTasks(graph: VineGraph, query: string): Task[] {
  const lower = query.toLowerCase();
  const result: Task[] = [];
  for (const id of graph.order) {
    const task = getTask(graph, id);
    if (
      lower === '' ||
      task.id.toLowerCase().includes(lower) ||
      task.shortName.toLowerCase().includes(lower) ||
      task.description.toLowerCase().includes(lower)
    ) {
      result.push(task);
    }
  }
  return result;
}

/**
 * Returns tasks that have zero dependencies (leaf nodes), in graph order.
 */
export function getLeaves(graph: VineGraph): Task[] {
  const result: Task[] = [];
  for (const id of graph.order) {
    const task = getTask(graph, id);
    if (task.dependencies.length === 0) {
      result.push(task);
    }
  }
  return result;
}

/**
 * Returns all tasks that transitively depend on the given task (NOT including
 * the task itself). BFS through dependant relationships.
 * Throws VineError if task not found.
 */
export function getDescendants(graph: VineGraph, id: string): Task[] {
  // Validates task exists (throws VineError if not found).
  getTask(graph, id);

  const visited = new Set<string>();
  const queue: string[] = [id];
  visited.add(id);

  while (queue.length > 0) {
    const currentId = queue.shift();
    if (currentId === undefined) break;
    const dependants = getDependants(graph, currentId);
    for (const dep of dependants) {
      if (!visited.has(dep.id)) {
        visited.add(dep.id);
        queue.push(dep.id);
      }
    }
  }

  // Remove the starting task and return in graph order.
  visited.delete(id);
  const result: Task[] = [];
  for (const orderId of graph.order) {
    if (visited.has(orderId)) {
      result.push(getTask(graph, orderId));
    }
  }
  return result;
}

/**
 * Returns an aggregate summary of the graph.
 */
export function getSummary(graph: VineGraph): GraphSummary {
  const byStatus: Record<Status, number> = {
    complete: 0,
    notstarted: 0,
    planning: 0,
    blocked: 0,
    started: 0,
  };

  for (const task of graph.tasks.values()) {
    byStatus[task.status] += 1;
  }

  const rootId = graph.order[graph.order.length - 1];
  if (rootId === undefined) {
    throw new VineError('Cannot get summary: order is empty');
  }
  const root = getTask(graph, rootId);

  return {
    total: graph.tasks.size,
    byStatus,
    rootId: root.id,
    rootName: root.shortName,
    leafCount: getLeaves(graph).length,
  };
}
