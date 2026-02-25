import type {
  ConcreteTask,
  Operation,
  RefTask,
  Status,
  Task,
  VineGraph,
} from './types.js';
import { EMPTY_ANNOTATIONS } from './types.js';
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
  return {
    version: source.version,
    title: source.title,
    delimiter: source.delimiter,
    prefix: source.prefix,
    tasks,
    order,
  };
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
 * Add a reference node to the graph.
 *
 * The ref is appended **after** all existing tasks in order so that
 * the root task always remains the first element.
 *
 * @throws {VineError} if `ref.vine` is empty.
 * @throws {VineError} if a task with the same id already exists.
 */
export function addRef(graph: VineGraph, ref: RefTask): VineGraph {
  if (!ref.vine) {
    throw new VineError('Ref node must have a non-empty vine URI');
  }
  if (graph.tasks.has(ref.id)) {
    throw new VineError(`Task "${ref.id}" already exists.`);
  }

  const newTasks = replaceTask(graph.tasks, ref);
  const newOrder = [...graph.order, ref.id];

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
  if (task.kind === 'ref') {
    throw new VineError(`Cannot set status on reference node "${id}".`);
  }

  const updated: ConcreteTask = { ...task, status };
  const next = buildGraph(
    replaceTask(graph.tasks, updated),
    graph.order,
    graph,
  );
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
  fields: Partial<
    Pick<Task, 'shortName' | 'description' | 'decisions' | 'attachments'>
  >,
): VineGraph {
  const task = graph.tasks.get(id);
  if (!task) {
    throw new VineError(`Task not found: ${id}`);
  }
  if (task.kind === 'ref' && fields.attachments !== undefined) {
    throw new VineError(`Cannot set attachments on reference node "${id}".`);
  }

  const updated: Task = { ...task, ...fields } as Task;
  const next = buildGraph(
    replaceTask(graph.tasks, updated),
    graph.order,
    graph,
  );
  validate(next);
  return next;
}

/**
 * Update the vine URI of a reference node.
 *
 * @throws {VineError} if the task does not exist.
 * @throws {VineError} if the task is not a ref node.
 * @throws {VineError} if the URI is empty.
 */
export function updateRefUri(
  graph: VineGraph,
  id: string,
  uri: string,
): VineGraph {
  const task = graph.tasks.get(id);
  if (!task) {
    throw new VineError(`Task not found: ${id}`);
  }
  if (task.kind !== 'ref') {
    throw new VineError('updateRefUri can only be called on ref nodes');
  }
  if (!uri || typeof uri !== 'string') {
    throw new VineError('Ref URI must be a non-empty string');
  }

  const updated: RefTask = { ...task, vine: uri };
  return {
    ...graph,
    tasks: replaceTask(graph.tasks, updated),
  };
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
  const next = buildGraph(
    replaceTask(graph.tasks, updated),
    graph.order,
    graph,
  );
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
  const next = buildGraph(
    replaceTask(graph.tasks, updated),
    graph.order,
    graph,
  );
  validate(next);
  return next;
}

// ---------------------------------------------------------------------------
// Batch mutations
// ---------------------------------------------------------------------------

/**
 * Apply a sequence of operations to a graph atomically.
 *
 * Unlike the individual mutation functions, `applyBatch` performs **no
 * intermediate validation** — the graph is validated only once after all
 * operations have been applied. This allows operations that would
 * transiently violate structural constraints (e.g., adding a disconnected
 * task and then wiring it in) to succeed as long as the *final* graph is
 * valid.
 *
 * @throws {VineError} on precondition failures (duplicate id, not found, …).
 * @throws {VineValidationError} if the final graph is structurally invalid.
 */
export function applyBatch(
  graph: VineGraph,
  operations: readonly Operation[],
): VineGraph {
  const tasks = new Map(graph.tasks);
  let order = [...graph.order];

  for (const op of operations) {
    switch (op.op) {
      case 'add_task': {
        if (tasks.has(op.id)) {
          throw new VineError(`Task "${op.id}" already exists.`);
        }
        const newTask: ConcreteTask = {
          kind: 'task',
          id: op.id,
          shortName: op.name,
          status: op.status ?? 'notstarted',
          description: op.description ?? '',
          dependencies: op.dependsOn ?? [],
          decisions: [],
          attachments: [],
          annotations: EMPTY_ANNOTATIONS,
        };
        tasks.set(op.id, newTask);
        order.push(op.id);
        break;
      }

      case 'add_ref': {
        if (tasks.has(op.id)) {
          throw new VineError(`Task "${op.id}" already exists.`);
        }
        if (!op.vine) {
          throw new VineError('Ref node must have a non-empty vine URI');
        }
        const newRef: RefTask = {
          kind: 'ref',
          id: op.id,
          shortName: op.name,
          vine: op.vine,
          description: op.description ?? '',
          dependencies: op.dependsOn ?? [],
          decisions: op.decisions ?? [],
          annotations: EMPTY_ANNOTATIONS,
        };
        tasks.set(op.id, newRef);
        order.push(op.id);
        break;
      }

      case 'remove_task': {
        if (!tasks.has(op.id)) {
          throw new VineError(`Task not found: ${op.id}`);
        }
        if (op.id === order[0]) {
          throw new VineError('Cannot remove the root task.');
        }
        tasks.delete(op.id);
        for (const [tid, t] of tasks) {
          if (t.dependencies.includes(op.id)) {
            tasks.set(tid, {
              ...t,
              dependencies: t.dependencies.filter((d) => d !== op.id),
            } as Task);
          }
        }
        order = order.filter((tid) => tid !== op.id);
        break;
      }

      case 'set_status': {
        const task = tasks.get(op.id);
        if (!task) {
          throw new VineError(`Task not found: ${op.id}`);
        }
        if (task.kind === 'ref') {
          throw new VineError(
            `Cannot set status on reference node "${op.id}".`,
          );
        }
        tasks.set(op.id, { ...task, status: op.status });
        break;
      }

      case 'update': {
        const task = tasks.get(op.id);
        if (!task) {
          throw new VineError(`Task not found: ${op.id}`);
        }
        const patch: Record<string, unknown> = {};
        if (op.name !== undefined) patch.shortName = op.name;
        if (op.description !== undefined) patch.description = op.description;
        if (op.decisions !== undefined) patch.decisions = op.decisions;
        tasks.set(op.id, { ...task, ...patch } as Task);
        break;
      }

      case 'update_ref_uri': {
        const task = tasks.get(op.id);
        if (!task) {
          throw new VineError(`Task not found: ${op.id}`);
        }
        if (task.kind !== 'ref') {
          throw new VineError(
            'updateRefUri can only be called on ref nodes',
          );
        }
        if (!op.uri || typeof op.uri !== 'string') {
          throw new VineError('Ref URI must be a non-empty string');
        }
        tasks.set(op.id, { ...task, vine: op.uri });
        break;
      }

      case 'add_dep': {
        const task = tasks.get(op.taskId);
        if (!task) {
          throw new VineError(`Task not found: ${op.taskId}`);
        }
        if (!tasks.has(op.depId)) {
          throw new VineError(`Task not found: ${op.depId}`);
        }
        if (task.dependencies.includes(op.depId)) {
          throw new VineError(
            `Task "${op.taskId}" already depends on "${op.depId}".`,
          );
        }
        tasks.set(op.taskId, {
          ...task,
          dependencies: [...task.dependencies, op.depId],
        } as Task);
        break;
      }

      case 'remove_dep': {
        const task = tasks.get(op.taskId);
        if (!task) {
          throw new VineError(`Task not found: ${op.taskId}`);
        }
        if (!tasks.has(op.depId)) {
          throw new VineError(`Task not found: ${op.depId}`);
        }
        if (!task.dependencies.includes(op.depId)) {
          throw new VineError(
            `Task "${op.taskId}" does not depend on "${op.depId}".`,
          );
        }
        tasks.set(op.taskId, {
          ...task,
          dependencies: task.dependencies.filter((d) => d !== op.depId),
        } as Task);
        break;
      }

      default: {
        const _exhaustive: never = op;
        throw new VineError(`Unknown operation: ${JSON.stringify(_exhaustive)}`);
      }
    }
  }

  const next = buildGraph(tasks, order, graph);
  validate(next);
  return next;
}
