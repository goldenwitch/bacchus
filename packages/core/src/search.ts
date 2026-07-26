import type {
  ConcreteTask,
  RefTask,
  Status,
  Task,
  VineGraph,
} from './types.js';
import { isVineRef, isConcreteTask, isConnective } from './types.js';
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
    if (isConcreteTask(task) && task.status === status) {
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
 * Returns all reference nodes in graph order.
 */
export function getRefs(graph: VineGraph): readonly RefTask[] {
  const result: RefTask[] = [];
  for (const id of graph.order) {
    const task = getTask(graph, id);
    if (isVineRef(task)) {
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
    reviewing: 0,
  };

  for (const task of graph.tasks.values()) {
    if (task.kind === 'task') {
      byStatus[task.status] += 1;
    }
  }

  const rootId = graph.order[0];
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

// ---------------------------------------------------------------------------
// Execution frontier
// ---------------------------------------------------------------------------

/**
 * Progress snapshot for the graph execution.
 */
export interface ExecutionProgress {
  readonly total: number;
  readonly complete: number;
  readonly percentage: number;
  readonly readyCount: number;
  readonly rootId: string;
  readonly rootStatus: Status | 'ref';
  readonly byStatus: Readonly<Record<Status, number>>;
}

/**
 * Result of analysing the current execution frontier of a VineGraph.
 *
 * - `ready`       — concrete tasks whose dependencies are all satisfied
 *                    (complete or reviewing) and whose own status is `notstarted`
 *                    or `planning`. These are the work items the agent should start.
 * - `completable` — tasks in `reviewing` status where at least one dependant
 *                    has advanced to `started` or beyond, signalling that the
 *                    upstream consumer has picked up the work and the reviewing
 *                    task is safe to mark `complete`.
 * - `expandable`  — ref nodes on the frontier whose dependencies are all
 *                    satisfied. These must be expanded (via `vine_expand_ref`)
 *                    before the tasks inside them become visible.
 * - `progress`    — aggregate completion stats.
 */
export interface ActionableTasks {
  readonly ready: readonly ConcreteTask[];
  readonly completable: readonly ConcreteTask[];
  readonly blocked: readonly ConcreteTask[];
  readonly expandable: readonly RefTask[];
  readonly progress: ExecutionProgress;
}

/** Statuses that satisfy a dependency for downstream work. */
const SATISFIED_STATUSES: ReadonlySet<Status> = new Set<Status>([
  'complete',
  'reviewing',
]);

/** Statuses indicating a task is not yet started and could be picked up. */
const PICKUPABLE_STATUSES: ReadonlySet<Status> = new Set<Status>([
  'notstarted',
  'planning',
]);

/**
 * Statuses indicating a dependant has consumed a reviewing task's output.
 * When a dependant reaches one of these, the upstream reviewing task is
 * safe to complete.
 */
const CONSUMING_STATUSES: ReadonlySet<Status> = new Set<Status>([
  'started',
  'reviewing',
  'complete',
]);

/**
 * Build a memoized satisfaction predicate for a graph.
 *
 * A node is *satisfied* when it can count as a completed prerequisite for its
 * dependants:
 *
 * - concrete task → status is `complete` or `reviewing` (the base rule).
 * - ref           → never (an unexpanded ref must be expanded first).
 * - `anyof`       → **any** direct dependency is satisfied.
 * - `allof`       → **every** direct dependency is satisfied.
 *
 * Connectives resolve recursively; termination is guaranteed by the DAG
 * constraint. Results are memoized per call so each node is evaluated once.
 */
export function buildSatisfaction(graph: VineGraph): (id: string) => boolean {
  const memo = new Map<string, boolean>();
  const inProgress = new Set<string>();

  function satisfied(id: string): boolean {
    const cached = memo.get(id);
    if (cached !== undefined) return cached;
    // Defensive cycle guard — a validated graph is acyclic, but never recurse
    // forever if an unvalidated graph slips through.
    if (inProgress.has(id)) return false;

    const task = graph.tasks.get(id);
    if (!task) return false;

    inProgress.add(id);
    let result: boolean;
    switch (task.kind) {
      case 'task':
        result = SATISFIED_STATUSES.has(task.status);
        break;
      case 'ref':
        result = false;
        break;
      case 'anyof':
        result = task.dependencies.some((d) => satisfied(d));
        break;
      case 'allof':
        result = task.dependencies.every((d) => satisfied(d));
        break;
    }
    inProgress.delete(id);
    memo.set(id, result);
    return result;
  }

  return satisfied;
}

/**
 * Returns true when some concrete task has started consuming `id`'s output,
 * looking **through** connective nodes transparently.
 *
 * A `reviewing` task is safe to complete once a downstream consumer has picked
 * up its output. With a connective interposed between the reviewing task and
 * its real consumers, the connective is transparent: we forward reverse-edge
 * traversal through connective dependants but stop at concrete/ref dependants.
 */
function hasConsumingDependant(graph: VineGraph, id: string): boolean {
  const visited = new Set<string>([id]);
  const queue: string[] = getDependants(graph, id).map((d) => d.id);

  while (queue.length > 0) {
    const depId = queue.shift();
    if (depId === undefined) break;
    if (visited.has(depId)) continue;
    visited.add(depId);

    const dep = graph.tasks.get(depId);
    if (!dep) continue;

    if (isConcreteTask(dep)) {
      if (CONSUMING_STATUSES.has(dep.status)) return true;
      // A non-consuming concrete task does not forward consumption.
      continue;
    }
    if (isConnective(dep)) {
      // Transparent: look through to the connective's own dependants.
      for (const d of getDependants(graph, depId)) queue.push(d.id);
    }
    // Ref dependants are not consumers and are not traversed.
  }
  return false;
}

/**
 * Analyse the current state of a VineGraph and return the execution frontier:
 * tasks that are ready to start, reviewing tasks that can be completed, and
 * ref nodes that need expansion.
 *
 * This is a **pure, read-only** function — it never mutates the graph.  It is
 * designed to be called repeatedly in an execution loop: the agent calls
 * `getActionableTasks`, acts on the results (using mutation tools), then calls
 * it again to get the next frontier.
 */
export function getActionableTasks(graph: VineGraph): ActionableTasks {
  const ready: ConcreteTask[] = [];
  const completable: ConcreteTask[] = [];
  const blocked: ConcreteTask[] = [];
  const expandable: RefTask[] = [];

  const satisfied = buildSatisfaction(graph);

  let completeCount = 0;
  // Connective nodes are routing infrastructure, not deliverable work — they
  // are excluded from the progress denominator.
  let workTotal = 0;
  const byStatus: Record<Status, number> = {
    complete: 0,
    notstarted: 0,
    planning: 0,
    blocked: 0,
    started: 0,
    reviewing: 0,
  };

  for (const id of graph.order) {
    const task = getTask(graph, id);

    // Connectives are pure routing — never counted as work, never in the
    // frontier. Their effect is felt only through the satisfaction predicate.
    if (isConnective(task)) continue;

    workTotal += 1;

    // Count statuses for progress (only concrete tasks have a status).
    if (isConcreteTask(task)) {
      byStatus[task.status] += 1;
      if (task.status === 'complete') completeCount += 1;
    }

    // Check whether all dependencies are satisfied (connectives resolve
    // recursively inside `satisfied`).
    const allDepsSatisfied = task.dependencies.every((depId) =>
      satisfied(depId),
    );

    if (!allDepsSatisfied) continue;

    // Ref nodes on the frontier → expandable.
    if (isVineRef(task)) {
      expandable.push(task);
      continue;
    }

    // Concrete tasks that are ready to pick up.
    if (PICKUPABLE_STATUSES.has(task.status)) {
      ready.push(task);
      continue;
    }

    // Blocked tasks whose dependencies are all satisfied.
    if (task.status === 'blocked') {
      blocked.push(task);
      continue;
    }

    // Reviewing tasks: completable when a consumer (seen through connectives)
    // has started consuming the output.
    if (task.status === 'reviewing') {
      if (hasConsumingDependant(graph, id)) {
        completable.push(task);
      }
    }
  }

  const rootId = graph.order[0];
  if (rootId === undefined) {
    throw new VineError('Cannot get actionable tasks: order is empty');
  }
  const root = getTask(graph, rootId);
  const rootStatus: Status | 'ref' = isConcreteTask(root) ? root.status : 'ref';

  // Root completion edge case: the root has no dependants, so it would never
  // appear in `completable` via the normal "any dependant consuming" check.
  // If the root is `reviewing` and every other concrete task is complete or
  // reviewing, it is safe to complete the root.
  if (
    isConcreteTask(root) &&
    root.status === 'reviewing' &&
    !completable.includes(root)
  ) {
    const allOthersFinished = [...graph.tasks.values()].every((t) => {
      if (t.id === root.id) return true;
      // Connectives are routing infrastructure, not work — ignore them here.
      if (isConnective(t)) return true;
      if (isConcreteTask(t)) return SATISFIED_STATUSES.has(t.status);
      // Unexpanded ref nodes block root completion.
      return false;
    });
    if (allOthersFinished) {
      completable.push(root);
    }
  }

  const total = workTotal;
  const percentage = total > 0 ? Math.round((completeCount / total) * 100) : 0;

  return {
    ready,
    completable,
    blocked,
    expandable,
    progress: {
      total,
      complete: completeCount,
      percentage,
      readyCount: ready.length,
      rootId: root.id,
      rootStatus,
      byStatus,
    },
  };
}
