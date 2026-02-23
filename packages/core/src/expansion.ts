import type { ConcreteTask, RefTask, Task, VineGraph } from './types.js';
import { VineError } from './errors.js';
import { validate } from './validator.js';

// ---------------------------------------------------------------------------
// Internal helper
// ---------------------------------------------------------------------------

/**
 * Build an ID mapping for inlining a child graph.
 * - childRootId → refNodeId
 * - other child IDs → prefix-originalId (or originalId if prefix is empty)
 */
function buildIdMap(
  childGraph: VineGraph,
  refNodeId: string,
  prefix: string,
): Map<string, string> {
  const childRootId = childGraph.order[0];
  const idMap = new Map<string, string>();

  for (const childId of childGraph.order) {
    if (childId === childRootId) {
      idMap.set(childId, refNodeId);
    } else {
      idMap.set(childId, prefix === '' ? childId : `${prefix}/${childId}`);
    }
  }

  return idMap;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Expand a reference node by inlining a child graph.
 *
 * The reference node at `refNodeId` is replaced with the child graph's root
 * task (adopting its status, description, attachments). The ref node's
 * dependencies are merged additively with the child root's dependencies.
 * All other child tasks are inserted immediately after the ref node in order.
 *
 * IDs are remapped using a prefix:
 * - If the child graph has a `prefix` metadata key, use it.
 * - Otherwise, use `refNodeId` as the default prefix.
 * - An empty string prefix means no prefixing (IDs used as-is).
 * - The child root's ID is always remapped to `refNodeId`.
 *
 * @throws {VineError} if `refNodeId` is not a reference node.
 * @throws {VineError} if any remapped child ID collides with a parent ID.
 * @throws {VineValidationError} if the resulting graph fails validation.
 */
export function expandVineRef(
  parentGraph: VineGraph,
  refNodeId: string,
  childGraph: VineGraph,
): VineGraph {
  // 1. Validate that refNodeId exists and is a reference node.
  const refNode = parentGraph.tasks.get(refNodeId);
  if (!refNode) {
    throw new VineError(
      `Task "${refNodeId}" does not exist in the parent graph.`,
    );
  }
  if (refNode.kind !== 'ref') {
    throw new VineError(`Task "${refNodeId}" is not a reference node.`);
  }

  // 2. Get the child graph's root ID.
  const childRootId = childGraph.order[0];
  if (childRootId === undefined) {
    throw new VineError('Child graph is empty.');
  }

  // 3. Resolve prefix.
  const prefix = childGraph.prefix ?? refNodeId;

  // 4. Build ID map.
  const idMap = buildIdMap(childGraph, refNodeId, prefix);

  // 5. Check for ID collisions.
  for (const [childId, remappedId] of idMap) {
    if (childId === childRootId) continue; // refNodeId slot is expected
    if (parentGraph.tasks.has(remappedId)) {
      throw new VineError(
        `ID collision: "${remappedId}" already exists in the parent graph.`,
      );
    }
  }

  // 6. Build the transformed root task.
  const childRoot = childGraph.tasks.get(childRootId);
  if (!childRoot) {
    throw new VineError('Child graph root task not found.');
  }
  if (childRoot.kind !== 'task') {
    throw new VineError('Child graph root must be a concrete task.');
  }

  const childRootDeps = childRoot.dependencies.map((d) => idMap.get(d) ?? d);
  const mergedDeps = [...new Set([...childRootDeps, ...refNode.dependencies])];
  const mergedDecisions = [...childRoot.decisions, ...refNode.decisions];

  const expandedRoot: ConcreteTask = {
    kind: 'task',
    id: refNodeId,
    shortName: childRoot.shortName,
    description: childRoot.description,
    status: childRoot.status,
    dependencies: mergedDeps,
    decisions: mergedDecisions,
    attachments: childRoot.attachments,
    annotations: childRoot.annotations,
  };

  // 7. Remap all non-root child tasks.
  const remappedChildTasks: Task[] = [];
  for (const childId of childGraph.order) {
    if (childId === childRootId) continue;
    const childTask = childGraph.tasks.get(childId);
    if (!childTask) continue;

    const remappedId = idMap.get(childTask.id) ?? childTask.id;
    const remappedDeps = childTask.dependencies.map((d) => idMap.get(d) ?? d);

    if (childTask.kind === 'ref') {
      remappedChildTasks.push({
        kind: 'ref',
        id: remappedId,
        shortName: childTask.shortName,
        description: childTask.description,
        dependencies: remappedDeps,
        decisions: childTask.decisions,
        vine: childTask.vine,
        annotations: childTask.annotations,
      } satisfies RefTask);
    } else {
      remappedChildTasks.push({
        kind: 'task',
        id: remappedId,
        shortName: childTask.shortName,
        description: childTask.description,
        status: childTask.status,
        dependencies: remappedDeps,
        decisions: childTask.decisions,
        attachments: childTask.attachments,
        annotations: childTask.annotations,
      } satisfies ConcreteTask);
    }
  }

  // 8. Build the new tasks map.
  const newTasks = new Map<string, Task>();
  for (const [id, task] of parentGraph.tasks) {
    if (id === refNodeId) {
      newTasks.set(refNodeId, expandedRoot);
    } else {
      newTasks.set(id, task);
    }
  }
  for (const task of remappedChildTasks) {
    newTasks.set(task.id, task);
  }

  // 9. Build the new order.
  const remappedChildIds = childGraph.order
    .filter((id) => id !== childRootId)
    .map((id) => idMap.get(id) ?? id);

  const newOrder: string[] = [];
  for (const id of parentGraph.order) {
    newOrder.push(id);
    if (id === refNodeId) {
      newOrder.push(...remappedChildIds);
    }
  }

  // 10. Build the composite graph and validate.
  const compositeGraph: VineGraph = {
    version: parentGraph.version,
    title: parentGraph.title,
    delimiter: parentGraph.delimiter,
    prefix: parentGraph.prefix,
    tasks: newTasks,
    order: newOrder,
  };

  validate(compositeGraph);

  return compositeGraph;
}
