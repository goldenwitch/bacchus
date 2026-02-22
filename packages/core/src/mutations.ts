import type { Status, Task, VineGraph } from './types.js';
import { VineError } from './errors.js';
import { validate } from './validator.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a new VineGraph from a tasks map and order array.
 */
function buildGraph(
  tasks: ReadonlyMap<string, Task>,
  order: readonly string[],
  source: VineGraph,
): VineGraph {
  return { version: source.version, title: source.title, delimiter: source.delimiter, prefix: source.prefix, tasks, order };
}

/**
 * Return a new tasks map with the given task replaced (or inserted).
 */
function replaceTask(
  tasks: ReadonlyMap<string, Task>,
  task: Task,
): ReadonlyMap<string, Task> {
  const next = new Map(tasks);
  next.set(task.id, task);
  return next;
}

// ---------------------------------------------------------------------------
// Mutation functions
// ---------------------------------------------------------------------------

/**
 * Add a new task to the graph.
 *
 * The task is appended **after** all existing tasks in order so that
 * the root task always remains the first element.
 *
 * @throws {VineError} if a task with the same id already exists.
 */
export function addTask(graph: VineGraph, task: Task): VineGraph {
  if (graph.tasks.has(task.id)) {
    throw new VineError(`Task "${task.id}" already exists.`);
  }

  const newTasks = replaceTask(graph.tasks, task);
  const newOrder = [...graph.order, task.id];

  const next = buildGraph(newTasks, newOrder, graph);
  validate(next);
  return next;
}

/**
 * Remove a task from the graph.
 *
 * Also strips the removed id from every other task's `dependencies` array.
 *
 * @throws {VineError} if the task does not exist.
 * @throws {VineError} if trying to remove the root task (first in order).
 */
export function removeTask(graph: VineGraph, id: string): VineGraph {
  if (!graph.tasks.has(id)) {
    throw new VineError(`Task not found: ${id}`);
  }

  const rootId = graph.order[0];
  if (id === rootId) {
    throw new VineError('Cannot remove the root task.');
  }

  const newTasks = new Map(graph.tasks);
  newTasks.delete(id);

  // Strip removed id from all dependency arrays.
  for (const [taskId, task] of newTasks) {
    if (task.dependencies.includes(id)) {
      const updated: Task = {
        ...task,
        dependencies: task.dependencies.filter((dep) => dep !== id),
      };
      newTasks.set(taskId, updated);
    }
  }

  const newOrder = graph.order.filter((tid) => tid !== id);

  const next = buildGraph(newTasks, newOrder, graph);
  validate(next);
  return next;
}

/**
 * Change the status of a task.
 *
 * @throws {VineError} if the task does not exist.
 */
export function setStatus(
  graph: VineGraph,
  id: string,
  status: Status,
): VineGraph {
  const task = graph.tasks.get(id);
  if (!task) {
    throw new VineError(`Task not found: ${id}`);
  }
  if (task.vine !== undefined) {
    throw new VineError(`Cannot set status on reference node "${id}".`);
  }

  const updated: Task = { ...task, status };
  const next = buildGraph(replaceTask(graph.tasks, updated), graph.order, graph);
  validate(next);
  return next;
}

/**
 * Update metadata fields on a task (shortName, description, decisions).
 *
 * Does **not** allow changing id, status, or dependencies.
 *
 * @throws {VineError} if the task does not exist.
 */
export function updateTask(
  graph: VineGraph,
  id: string,
  fields: Partial<Pick<Task, 'shortName' | 'description' | 'decisions' | 'attachments'>>,
): VineGraph {
  const task = graph.tasks.get(id);
  if (!task) {
    throw new VineError(`Task not found: ${id}`);
  }
  if (task.vine !== undefined && fields.attachments !== undefined) {
    throw new VineError(`Cannot set attachments on reference node "${id}".`);
  }

  const updated: Task = { ...task, ...fields };
  const next = buildGraph(replaceTask(graph.tasks, updated), graph.order, graph);
  validate(next);
  return next;
}

/**
 * Add a dependency edge from `taskId` to `depId`.
 *
 * @throws {VineError} if either task does not exist.
 * @throws {VineError} if the dependency already exists.
 */
export function addDependency(
  graph: VineGraph,
  taskId: string,
  depId: string,
): VineGraph {
  const task = graph.tasks.get(taskId);
  if (!task) {
    throw new VineError(`Task not found: ${taskId}`);
  }
  if (!graph.tasks.has(depId)) {
    throw new VineError(`Task not found: ${depId}`);
  }
  if (task.dependencies.includes(depId)) {
    throw new VineError(`Task "${taskId}" already depends on "${depId}".`);
  }

  const updated: Task = {
    ...task,
    dependencies: [...task.dependencies, depId],
  };
  const next = buildGraph(replaceTask(graph.tasks, updated), graph.order, graph);
  validate(next);
  return next;
}

/**
 * Remove a dependency edge from `taskId` to `depId`.
 *
 * @throws {VineError} if either task does not exist.
 * @throws {VineError} if the dependency edge does not exist.
 */
export function removeDependency(
  graph: VineGraph,
  taskId: string,
  depId: string,
): VineGraph {
  const task = graph.tasks.get(taskId);
  if (!task) {
    throw new VineError(`Task not found: ${taskId}`);
  }
  if (!graph.tasks.has(depId)) {
    throw new VineError(`Task not found: ${depId}`);
  }
  if (!task.dependencies.includes(depId)) {
    throw new VineError(`Task "${taskId}" does not depend on "${depId}".`);
  }

  const updated: Task = {
    ...task,
    dependencies: task.dependencies.filter((d) => d !== depId),
  };
  const next = buildGraph(replaceTask(graph.tasks, updated), graph.order, graph);
  validate(next);
  return next;
}
