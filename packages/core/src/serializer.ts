import type { AttachmentClass, VineGraph } from './types.js';
import { VineError } from './errors.js';

/**
 * Serialize a {@link VineGraph} back to `.vine` text.
 *
 * The output follows the VINE v1.0.0 canonical form:
 *   preamble (magic + metadata + terminator) → task blocks separated by
 *   the graph delimiter → trailing newline.
 *
 * Field order within each block:
 *   header → description → dependencies (sorted) → decisions → attachments.
 */
export function serialize(graph: VineGraph): string {
  // ── Preamble ──────────────────────────────────────────────────────
  const preambleLines: string[] = [];

  // Magic line
  preambleLines.push(`vine ${graph.version}`);

  // Metadata — alphabetical key order, only meaningful values
  if (graph.delimiter !== '---') {
    preambleLines.push(`delimiter: ${graph.delimiter}`);
  }
  if (graph.title !== undefined) {
    preambleLines.push(`title: ${graph.title}`);
  }

  // Preamble terminator (always `---`)
  preambleLines.push('---');

  // ── Task blocks ───────────────────────────────────────────────────
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

    // Description — split on newlines so internal blank lines are preserved
    if (task.description !== '') {
      for (const descLine of task.description.split('\n')) {
        lines.push(descLine);
      }
    }

    // Dependencies — sorted alphabetically
    for (const dep of [...task.dependencies].sort()) {
      lines.push(`-> ${dep}`);
    }

    // Decisions — original order
    for (const decision of task.decisions) {
      lines.push(`> ${decision}`);
    }

    // Attachments — grouped by class: artifact → guidance → file
    const classOrder: AttachmentClass[] = ['artifact', 'guidance', 'file'];
    for (const cls of classOrder) {
      for (const att of task.attachments.filter((a) => a.class === cls)) {
        lines.push(`@${att.class} ${att.mime} ${att.uri}`);
      }
    }

    blocks.push(lines.join('\n'));
  }

  // ── Assemble ──────────────────────────────────────────────────────
  return preambleLines.join('\n') + '\n' + blocks.join(`\n${graph.delimiter}\n`) + '\n';
}
