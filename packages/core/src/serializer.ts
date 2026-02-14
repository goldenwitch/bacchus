import type { VineGraph } from './types.js';
import { VineError } from './errors.js';

/**
 * Serialize a {@link VineGraph} back to `.vine` text.
 *
 * The output preserves original task ordering via `graph.order` and uses
 * the normalized field order (description → dependencies → decisions)
 * within each block, ensuring a deterministic round-trip with `parse`.
 */
export function serialize(graph: VineGraph): string {
  const blocks: string[] = [];

  for (const id of graph.order) {
    const task = graph.tasks.get(id);
    if (task === undefined) {
      throw new VineError(
        `Task "${id}" referenced in order but not found in tasks`,
      );
    }

    const lines: string[] = [];

    // Header
    lines.push(`[${task.id}] ${task.shortName} (${task.status})`);

    // Description (skip if empty)
    if (task.description !== '') {
      lines.push(task.description);
    }

    // Dependencies
    for (const dep of task.dependencies) {
      lines.push(`-> ${dep}`);
    }

    // Decisions
    for (const decision of task.decisions) {
      lines.push(`> ${decision}`);
    }

    blocks.push(lines.join('\n'));
  }

  return blocks.join('\n\n') + '\n';
}
