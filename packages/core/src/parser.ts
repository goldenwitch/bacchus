import type { Status, Task, VineGraph } from './types.js';
import { VineParseError } from './errors.js';
import { validate } from './validator.js';

// ---------------------------------------------------------------------------
// Header regex
// ---------------------------------------------------------------------------

/**
 * Matches a task header line:
 *   [some-id] Short Name (status)
 */
const HEADER_RE =
  /^\[([a-zA-Z0-9-]+)\]\s+(.+?)\s+\((complete|notstarted|planning|blocked|started)\)$/;

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

/** A raw block of consecutive non-blank lines with its starting line number. */
interface RawBlock {
  /** 1-based line number of the first line in this block. */
  startLine: number;
  /** The non-blank lines that make up the block. */
  lines: string[];
}

// ---------------------------------------------------------------------------
// Step 1 — Split input into blocks, tracking line numbers
// ---------------------------------------------------------------------------

/**
 * Iterate line-by-line, grouping consecutive non-blank lines into blocks.
 * Each block records its 1-based starting line number.
 *
 * A "blank line" is one that is empty or contains only whitespace.
 */
function splitBlocks(input: string): RawBlock[] {
  const lines = input.split(/\r?\n/);
  const blocks: RawBlock[] = [];

  let current: RawBlock | undefined;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line === undefined) continue;
    const isBlank = line.trim().length === 0;

    if (isBlank) {
      // End of the current block (if any).
      if (current) {
        blocks.push(current);
        current = undefined;
      }
    } else {
      if (!current) {
        current = { startLine: i + 1, lines: [] };
      }
      current.lines.push(line);
    }
  }

  // Push the final block if the file doesn't end with a blank line.
  if (current) {
    blocks.push(current);
  }

  return blocks;
}

// ---------------------------------------------------------------------------
// Step 2 — Parse a single block into a Task
// ---------------------------------------------------------------------------

/**
 * Parse a raw block into a {@link Task}.
 *
 * The first line is the header; remaining lines are classified by prefix:
 * - `-> ` → dependency (target task id)
 * - `> `  → decision text
 * - anything else → description line
 *
 * Consecutive description lines are concatenated with a single space.
 */
function parseBlock(block: RawBlock): Task {
  const headerLine = block.lines[0]?.trim();
  if (headerLine === undefined) {
    throw new VineParseError('Empty block', block.startLine);
  }
  const headerMatch = HEADER_RE.exec(headerLine);

  if (!headerMatch) {
    throw new VineParseError(
      `Invalid task header: "${headerLine}"`,
      block.startLine,
    );
  }

  // Destructure captured groups. Groups are guaranteed by the regex.
  const id = headerMatch[1];
  const shortName = headerMatch[2];
  const status = headerMatch[3] as Status | undefined;

  if (id === undefined || shortName === undefined || status === undefined) {
    throw new VineParseError(
      `Invalid task header: "${headerLine}"`,
      block.startLine,
    );
  }

  const dependencies: string[] = [];
  const decisions: string[] = [];
  const descriptionParts: string[] = [];

  // Process body lines (everything after the header).
  for (let i = 1; i < block.lines.length; i++) {
    const line = block.lines[i];
    if (line === undefined) continue;

    if (line.startsWith('-> ')) {
      dependencies.push(line.slice(3).trim());
    } else if (line.startsWith('> ')) {
      decisions.push(line.slice(2).trim());
    } else {
      descriptionParts.push(line.trim());
    }
  }

  const description = descriptionParts.join(' ');

  return { id, shortName, description, status, dependencies, decisions };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Parse a `.vine` string into a validated {@link VineGraph}.
 *
 * @throws {VineParseError} on syntax errors (invalid header, duplicate id, empty input).
 * @throws {VineValidationError} on structural constraint violations.
 */
export function parse(input: string): VineGraph {
  // Step 1 — split into blocks.
  const blocks = splitBlocks(input);

  if (blocks.length === 0) {
    throw new VineParseError('Empty input — no task blocks found', 1);
  }

  // Step 2 & 3 — parse blocks and collect into a Map, preserving order.
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

  // Step 4 — build the graph.
  const graph: VineGraph = { tasks, order };

  // Step 5 — validate structural constraints.
  validate(graph);

  return graph;
}
