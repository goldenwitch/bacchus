import type { AttachmentClass, VineGraph } from './types.js';
import { VineError } from './errors.js';

function serializeAnnotations(
  annotations: ReadonlyMap<string, readonly string[]> | undefined,
): string {
  if (!annotations || annotations.size === 0) return '';
  const parts: string[] = [];
  // Alphabetical key order for deterministic output
  for (const key of [...annotations.keys()].sort()) {
    const values = annotations.get(key) ?? [];
    parts.push(`@${key}(${values.join(',')})`);
  }
  return ' ' + parts.join(' ');
}

/**
 * Serialize a {@link VineGraph} back to `.vine` text.
 *
 * The output follows the VINE v1.0.0 / v1.1.0 canonical form:
 *   preamble (magic + metadata + terminator) → node blocks separated by
 *   the graph delimiter → trailing newline.
 *
 * Field order within each task block:
 *   header → description → dependencies (sorted) → decisions → attachments.
 *
 * Reference blocks (v1.1.0):
 *   header (`~[id] Name`) → URI → description → dependencies → decisions.
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
  if (graph.prefix !== undefined) {
    preambleLines.push(`prefix: ${graph.prefix}`);
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

    if (task.kind === 'ref') {
      // ── Reference node ──────────────────────────────────────────
      lines.push(
        `ref [${task.id}] ${task.shortName} (${task.vine})${serializeAnnotations(task.annotations)}`,
      );

      // Description
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
    } else {
      // ── Concrete task node ──────────────────────────────────────
      // Header — status is guaranteed defined for concrete tasks
      lines.push(
        `[${task.id}] ${task.shortName} (${task.status})${serializeAnnotations(task.annotations)}`,
      );
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
    }

    blocks.push(lines.join('\n'));
  }

  // ── Assemble ──────────────────────────────────────────────────────
  return (
    preambleLines.join('\n') +
    '\n' +
    blocks.join(`\n${graph.delimiter}\n`) +
    '\n'
  );
}
