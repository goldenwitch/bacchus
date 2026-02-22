// ---------------------------------------------------------------------------
// Public API — parse a .vine string into a validated VineGraph
// ---------------------------------------------------------------------------

import type { Task, VineGraph } from '../types.js';
import { VineParseError } from '../errors.js';
import { validate } from '../validator.js';
import { parseMagicLine, parsePreamble } from './preamble.js';
import { splitBlocks, parseBlock } from './blocks.js';

/**
 * Parse a `.vine` string into a validated {@link VineGraph}.
 *
 * Algorithm:
 * 1. Validate the magic first line (`vine <version>`).
 * 2. Read the preamble (metadata key-value pairs) up to `---`.
 * 3. Split the body on the delimiter into raw task blocks.
 * 4. Parse each block into a Task.
 * 5. Build the graph and validate structural constraints.
 *
 * @throws {VineParseError} on syntax errors (invalid header, duplicate id, etc.).
 * @throws {VineValidationError} on structural constraint violations.
 */
export function parse(input: string): VineGraph {
  const lines = input.split(/\r?\n/);

  // A trailing newline produces an empty final element — discard it so it
  // doesn't leak into the last task block as an empty description line.
  if (lines.length > 0 && lines[lines.length - 1] === '') {
    lines.pop();
  }

  // Step 1 — magic line.
  const version = parseMagicLine(lines[0]);

  // Step 2 — preamble metadata.
  const { title, delimiter, prefix, bodyStartIndex } = parsePreamble(lines);

  // Step 3 — split body into raw task blocks.
  const blocks = splitBlocks(lines, bodyStartIndex, delimiter);

  if (blocks.length === 0) {
    throw new VineParseError(
      'Empty input — no task blocks found',
      bodyStartIndex + 1,
    );
  }

  // Step 4 — parse blocks and collect into a Map, preserving order.
  const tasks = new Map<string, Task>();
  const order: string[] = [];

  for (const block of blocks) {
    const task = parseBlock(block);

    // Duplicate id check.
    if (tasks.has(task.id)) {
      throw new VineParseError(
        `Duplicate task id "${task.id}"`,
        block.startLine,
      );
    }

    tasks.set(task.id, task);
    order.push(task.id);
  }

  // Step 5 — build the graph and validate.
  const graph: VineGraph = { version, title, delimiter, prefix, tasks, order };

  validate(graph);

  return graph;
}
