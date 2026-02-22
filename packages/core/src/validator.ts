import type { VineGraph } from './types.js';
import { VineValidationError } from './errors.js';
import type { ValidationDetails } from './errors.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Throw a VineValidationError with the given message and details.
 */
function fail(message: string, details: ValidationDetails): never {
  throw new VineValidationError(message, details);
}

// ---------------------------------------------------------------------------
// Individual constraint checks
// ---------------------------------------------------------------------------

/**
 * 1. The graph must contain at least one task.
 */
function checkAtLeastOneTask(graph: VineGraph): void {
  if (graph.tasks.size < 1) {
    fail('Graph must contain at least one task.', {
      constraint: 'at-least-one-task',
    });
  }
}

/**
 * 2. Every dependency id referenced by a task must exist in graph.tasks.
 */
function checkValidDependencyRefs(graph: VineGraph): void {
  for (const [taskId, task] of graph.tasks) {
    for (const dep of task.dependencies) {
      if (!graph.tasks.has(dep)) {
        fail(`Task "${taskId}" references unknown dependency "${dep}".`, {
          constraint: 'valid-dependency-refs',
          taskId,
          missingDep: dep,
        });
      }
    }
  }
}

/**
 * 3. DFS-based cycle detection using three-color marking.
 *
 * Colors:
 *   white — unvisited
 *   gray  — currently on the recursion stack (in progress)
 *   black — fully processed (all descendants visited)
 *
 * When we re-encounter a gray node we have found a cycle.  We extract the
 * cycle path from the recursion stack.
 */
function checkNoCycles(graph: VineGraph): void {
  const enum Color {
    White = 0,
    Gray = 1,
    Black = 2,
  }

  const color = new Map<string, Color>();
  for (const id of graph.tasks.keys()) {
    color.set(id, Color.White);
  }

  // Recursion stack kept as an ordered array so we can extract the cycle path.
  const stack: string[] = [];

  function dfs(nodeId: string): void {
    color.set(nodeId, Color.Gray);
    stack.push(nodeId);

    const task = graph.tasks.get(nodeId);
    // task is guaranteed to exist because we iterate over graph.tasks keys,
    // but noUncheckedIndexedAccess means the type is Task | undefined.
    if (task) {
      for (const dep of task.dependencies) {
        const depColor = color.get(dep);

        if (depColor === Color.Gray) {
          // Found a cycle — extract the cycle path from the stack.
          const cycleStart = stack.indexOf(dep);
          // cycleStart is always >= 0 because dep is gray and therefore on the stack.
          const cycle = stack.slice(cycleStart);
          fail(`Cycle detected: ${cycle.join(' → ')} → ${dep}.`, {
            constraint: 'no-cycles',
            cycle,
          });
        }

        if (depColor === Color.White) {
          dfs(dep);
        }
        // If depColor === Black the subtree is already fully explored — skip.
      }
    }

    stack.pop();
    color.set(nodeId, Color.Black);
  }

  // Outer loop: visit every node so disconnected sub-graphs are checked too.
  for (const id of graph.tasks.keys()) {
    if (color.get(id) === Color.White) {
      dfs(id);
    }
  }
}

/**
 * 4. No islands — every task must be reachable from the root.
 *
 * The root is defined as the first id in `graph.order`.  We perform a BFS from
 * the root following **forward dependency edges** (root → root's deps → their
 * deps → …).  Because the root transitively depends on every task in a valid
 * graph, this traversal visits all tasks.  Any task not visited is an island —
 * it has no transitive dependency path connecting it to the root.
 */
function checkNoIslands(graph: VineGraph): void {
  // The root is the first element in graph.order.
  const rootId = graph.order[0];
  // rootId may be undefined per noUncheckedIndexedAccess, but the
  // at-least-one-task check guarantees order is non-empty at this point.
  if (rootId === undefined) {
    return; // unreachable after constraint 1, but satisfies the type checker.
  }

  // BFS from root following dependency edges (root → its deps → their deps …).
  const visited = new Set<string>();
  const queue: string[] = [rootId];
  visited.add(rootId);

  while (queue.length > 0) {
    // shift() is fine for correctness; the graph is not expected to be huge.
    const current = queue.shift();
    if (current === undefined) break;
    const task = graph.tasks.get(current);
    if (task) {
      for (const dep of task.dependencies) {
        if (!visited.has(dep)) {
          visited.add(dep);
          queue.push(dep);
        }
      }
    }
  }

  // Any task not visited is an island.
  if (visited.size < graph.tasks.size) {
    const islandTaskIds: string[] = [];
    for (const id of graph.tasks.keys()) {
      if (!visited.has(id)) {
        islandTaskIds.push(id);
      }
    }
    fail(
      `Found ${String(islandTaskIds.length)} island task(s) not reachable from root: ${islandTaskIds.join(', ')}.`,
      { constraint: 'no-islands', islandTaskIds },
    );
  }
}

/**
 * 5. Reference nodes must have a non-empty vine URI.
 */
function checkRefUriRequired(graph: VineGraph): void {
  for (const [taskId, task] of graph.tasks) {
    if (task.kind === 'ref') {
      if (task.vine === '') {
        fail(`Reference node "${taskId}" must have a non-empty vine URI.`, {
          constraint: 'ref-uri-required',
          taskId,
        });
      }
    }
  }
}

// Constraint 6 (no-ref-attachments) is now enforced at the type level:
// RefTask has no `attachments` field, so no runtime check is needed.

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Validate a {@link VineGraph} against all structural constraints.
 *
 * Checks are executed in order; the function throws a
 * {@link VineValidationError} on the **first** violation found.
 *
 * Constraint order:
 *  1. at-least-one-task
 *  2. valid-dependency-refs
 *  3. no-cycles
 *  4. no-islands
 *  5. ref-uri-required
 */
export function validate(graph: VineGraph): void {
  checkAtLeastOneTask(graph);
  checkValidDependencyRefs(graph);
  checkNoCycles(graph);
  checkNoIslands(graph);
  checkRefUriRequired(graph);
}
