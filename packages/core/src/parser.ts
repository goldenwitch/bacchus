import type { Attachment, AttachmentClass, Status, Task, VineGraph } from './types.js';
import { VineParseError } from './errors.js';
import { validate } from './validator.js';

// ---------------------------------------------------------------------------
// Constants & regex
// ---------------------------------------------------------------------------

/** Matches the magic first line: `vine 1.0.0` (semver-like). */
const MAGIC_RE = /^vine\s+(\d+\.\d+\.\d+)$/;

/**
 * Matches a task header line:
 *   [some-id] Short Name (status)
 *
 * The status alternation includes `reviewing` per v1.0.0.
 */
const HEADER_RE =
  /^\[([a-zA-Z0-9-]+)\]\s+(.+?)\s+\((complete|notstarted|planning|blocked|started|reviewing)\)$/;

/** The fixed line that terminates the preamble section. */
const PREAMBLE_TERMINATOR = '---';

/** Recognized attachment class prefixes. */
const ATTACHMENT_CLASSES: ReadonlySet<string> = new Set<string>([
  'artifact',
  'guidance',
  'file',
]);

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

/**
 * A raw task block produced by delimiter-based splitting.
 * Lines include ALL lines (including blank ones) since blank lines are
 * preserved as empty description lines within a block.
 */
interface RawBlock {
  /** 1-based line number of the first line in this block. */
  startLine: number;
  /** All lines that make up the block (including blank lines). */
  lines: string[];
}

// ---------------------------------------------------------------------------
// Step 1 — Parse magic line
// ---------------------------------------------------------------------------

/**
 * Validate and extract the version from the magic first line.
 *
 * @returns The extracted semver version string.
 * @throws {VineParseError} if the first line is missing or malformed.
 */
function parseMagicLine(firstLine: string | undefined): string {
  if (firstLine === undefined) {
    throw new VineParseError('Empty input — missing magic line', 1);
  }
  const match = MAGIC_RE.exec(firstLine);
  if (!match || match[1] === undefined) {
    throw new VineParseError(
      `Invalid magic line: expected "vine <version>", got "${firstLine}"`,
      1,
    );
  }
  return match[1];
}

// ---------------------------------------------------------------------------
// Step 2 — Parse preamble metadata
// ---------------------------------------------------------------------------

interface Preamble {
  /** Parsed key-value metadata from the preamble. */
  title: string | undefined;
  /** The delimiter to use for splitting task blocks. */
  delimiter: string;
  /** Index into the lines array of the first line after the preamble terminator. */
  bodyStartIndex: number;
}

/**
 * Read lines from index 1 (after the magic line) until we find the preamble
 * terminator (`---`). Each non-blank line before the terminator is parsed as
 * `key: value` metadata.
 *
 * The preamble terminator is always `---`, regardless of any `delimiter` key.
 *
 * @throws {VineParseError} if the preamble terminator is never found.
 */
function parsePreamble(lines: string[]): Preamble {
  let title: string | undefined;
  let delimiter = '---';
  let terminatorIndex = -1;

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (line === undefined) continue;

    if (line === PREAMBLE_TERMINATOR) {
      terminatorIndex = i;
      break;
    }

    // Parse "key: value" metadata lines.
    const colonIndex = line.indexOf(':');
    if (colonIndex !== -1) {
      const key = line.slice(0, colonIndex).trim().toLowerCase();
      const value = line.slice(colonIndex + 1).trim();

      if (key === 'title') {
        title = value;
      } else if (key === 'delimiter') {
        delimiter = value;
      }
      // Unknown keys are silently ignored.
    }
  }

  if (terminatorIndex === -1) {
    throw new VineParseError(
      'Missing preamble terminator "---"',
      lines.length,
    );
  }

  return {
    title,
    delimiter,
    bodyStartIndex: terminatorIndex + 1,
  };
}

// ---------------------------------------------------------------------------
// Step 3 — Split body into raw task blocks using the delimiter
// ---------------------------------------------------------------------------

/**
 * Split the body (everything after the preamble) on lines that exactly match
 * the delimiter. Empty trailing segments are discarded.
 *
 * Within a segment, ALL lines are preserved — blank lines become empty
 * description lines inside the task block.
 */
function splitBlocks(
  lines: string[],
  bodyStartIndex: number,
  delimiter: string,
): RawBlock[] {
  const blocks: RawBlock[] = [];
  let currentLines: string[] = [];
  let currentStartLine = bodyStartIndex + 1; // 1-based

  for (let i = bodyStartIndex; i < lines.length; i++) {
    const line = lines[i];
    if (line === undefined) continue;

    if (line === delimiter) {
      // End of a segment — push it if non-empty.
      if (currentLines.length > 0) {
        blocks.push({ startLine: currentStartLine, lines: currentLines });
      }
      currentLines = [];
      currentStartLine = i + 2; // next segment starts on the line after this delimiter (1-based)
    } else {
      if (currentLines.length === 0) {
        currentStartLine = i + 1; // 1-based
      }
      currentLines.push(line);
    }
  }

  // Push the final segment if the file doesn't end with a delimiter.
  if (currentLines.length > 0) {
    blocks.push({ startLine: currentStartLine, lines: currentLines });
  }

  return blocks;
}

// ---------------------------------------------------------------------------
// Step 4 — Parse a single block into a Task
// ---------------------------------------------------------------------------

/**
 * Parse an attachment line of the form `@<class> <mime> <uri>`.
 *
 * @throws {VineParseError} if mime or uri are missing.
 */
function parseAttachment(
  cls: AttachmentClass,
  remainder: string,
  lineNumber: number,
): Attachment {
  // remainder is the text after `@class ` — split into mime and uri.
  const firstSpace = remainder.indexOf(' ');
  if (firstSpace === -1 || firstSpace === remainder.length - 1) {
    throw new VineParseError(
      `Invalid attachment: expected "@${cls} <mime> <uri>", got "@${cls} ${remainder}"`,
      lineNumber,
    );
  }
  const mime = remainder.slice(0, firstSpace);
  const uri = remainder.slice(firstSpace + 1);

  return { class: cls, mime, uri };
}

/**
 * Parse a raw block into a {@link Task}.
 *
 * The first **non-empty** line is the header. All subsequent lines are
 * classified by prefix in priority order:
 *
 * - `-> `       → dependency (target task id)
 * - `> `        → decision text
 * - `@artifact ` → artifact attachment
 * - `@guidance ` → guidance attachment
 * - `@file `     → file attachment
 * - anything else → description line (preserved verbatim, NOT trimmed)
 *
 * Blank lines within the block are treated as empty description lines.
 * Description lines are joined with `\n`.
 */
function parseBlock(block: RawBlock): Task {
  // Find the first non-empty line for the header.
  let headerIndex = -1;
  for (let i = 0; i < block.lines.length; i++) {
    const line = block.lines[i];
    if (line !== undefined && line.trim().length > 0) {
      headerIndex = i;
      break;
    }
  }

  if (headerIndex === -1) {
    throw new VineParseError('Empty block — no header found', block.startLine);
  }

  const rawHeader = block.lines[headerIndex];
  if (rawHeader === undefined) {
    throw new VineParseError('Empty block — no header found', block.startLine);
  }
  const headerLine = rawHeader.trim();
  const headerMatch = HEADER_RE.exec(headerLine);

  if (!headerMatch) {
    throw new VineParseError(
      `Invalid task header: "${headerLine}"`,
      block.startLine + headerIndex,
    );
  }

  // Destructure captured groups. Groups are guaranteed by the regex.
  const id = headerMatch[1];
  const shortName = headerMatch[2];
  const status = headerMatch[3] as Status | undefined;

  if (id === undefined || shortName === undefined || status === undefined) {
    throw new VineParseError(
      `Invalid task header: "${headerLine}"`,
      block.startLine + headerIndex,
    );
  }

  const dependencies: string[] = [];
  const decisions: string[] = [];
  const descriptionParts: string[] = [];
  const attachments: Attachment[] = [];

  // Process body lines (everything after the header).
  for (let i = headerIndex + 1; i < block.lines.length; i++) {
    const line = block.lines[i];
    if (line === undefined) continue;

    const lineNumber = block.startLine + i;

    // Blank lines within a block are empty description lines.
    if (line.trim().length === 0) {
      descriptionParts.push('');
      continue;
    }

    if (line.startsWith('-> ')) {
      dependencies.push(line.slice(3).trim());
    } else if (line.startsWith('> ')) {
      decisions.push(line.slice(2).trim());
    } else if (line.startsWith('@')) {
      // Check for recognized attachment class prefixes.
      let matched = false;
      for (const cls of ATTACHMENT_CLASSES) {
        const prefix = `@${cls} `;
        if (line.startsWith(prefix)) {
          const remainder = line.slice(prefix.length);
          attachments.push(
            parseAttachment(cls as AttachmentClass, remainder, lineNumber),
          );
          matched = true;
          break;
        }
      }
      // Unrecognized @-prefixed lines are treated as description text.
      if (!matched) {
        descriptionParts.push(line);
      }
    } else {
      // Description line — preserved verbatim (NOT trimmed).
      descriptionParts.push(line);
    }
  }

  const description = descriptionParts.join('\n');

  return { id, shortName, description, status, dependencies, decisions, attachments };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

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
  const { title, delimiter, bodyStartIndex } = parsePreamble(lines);

  // Step 3 — split body into raw task blocks.
  const blocks = splitBlocks(lines, bodyStartIndex, delimiter);

  if (blocks.length === 0) {
    throw new VineParseError('Empty input — no task blocks found', bodyStartIndex + 1);
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
  const graph: VineGraph = { version, title, delimiter, tasks, order };

  validate(graph);

  return graph;
}
