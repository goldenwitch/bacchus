// ---------------------------------------------------------------------------
// Step 3 — Split body into raw task blocks
// Step 4 — Parse a single block into a Task (unified task + ref)
// ---------------------------------------------------------------------------

import type {
  Attachment,
  AttachmentClass,
  ConcreteTask,
  RefTask,
  Status,
  Task,
} from '../types.js';
import type { RawBlock } from './constants.js';
import {
  ATTACHMENT_CLASSES,
  HEADER_RE,
  REF_HEADER_RE,
  ANNOTATION_RE,
} from './constants.js';
import { VineParseError } from '../errors.js';
import { EMPTY_ANNOTATIONS } from '../types.js';

// ---------------------------------------------------------------------------
// Block splitting
// ---------------------------------------------------------------------------

/**
 * Split the body (everything after the preamble) on lines that exactly match
 * the delimiter. Empty trailing segments are discarded.
 *
 * Within a segment, ALL lines are preserved — blank lines become empty
 * description lines inside the task block.
 */
export function splitBlocks(
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
// Attachment parsing
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

// ---------------------------------------------------------------------------
// Header parsing helpers
// ---------------------------------------------------------------------------

/**
 * Find the index of the first non-empty line in a block.
 *
 * @throws {VineParseError} if the block contains no non-empty lines.
 */
function findHeaderIndex(block: RawBlock): number {
  for (let i = 0; i < block.lines.length; i++) {
    const line = block.lines[i];
    if (line !== undefined && line.trim().length > 0) {
      return i;
    }
  }
  throw new VineParseError('Empty block — no header found', block.startLine);
}

/** Discriminated result of parsing a block header line. */
type ParsedHeader = ParsedTaskHeader | ParsedRefHeader;

interface ParsedTaskHeader {
  readonly kind: 'task';
  readonly id: string;
  readonly shortName: string;
  readonly status: Status;
  readonly headerIndex: number;
  readonly annotations: ReadonlyMap<string, readonly string[]>;
}

interface ParsedRefHeader {
  readonly kind: 'ref';
  readonly id: string;
  readonly shortName: string;
  readonly vine: string;
  readonly headerIndex: number;
  readonly annotations: ReadonlyMap<string, readonly string[]>;
}

/**
 * Parse a raw annotation trailing string into a map of key → values.
 */
function parseAnnotations(raw: string): ReadonlyMap<string, readonly string[]> {
  if (!raw || raw.trim() === '') return EMPTY_ANNOTATIONS;
  const map = new Map<string, readonly string[]>();
  const re = new RegExp(ANNOTATION_RE.source, 'g');
  let match;
  while ((match = re.exec(raw)) !== null) {
    const key = match[1] ?? '';
    const valuesRaw = match[2] ?? '';
    const values = valuesRaw
      .split(',')
      .map((v) => v.trim())
      .filter((v) => v.length > 0);
    map.set(key, values);
  }
  return map.size > 0 ? map : EMPTY_ANNOTATIONS;
}

/**
 * Parse the header line of a block, detecting whether it is a concrete task
 * or a reference node.
 *
 * @throws {VineParseError} if the header matches neither pattern.
 */
function parseHeader(block: RawBlock): ParsedHeader {
  const headerIndex = findHeaderIndex(block);

  const rawHeader = block.lines[headerIndex];
  if (rawHeader === undefined) {
    throw new VineParseError('Empty block — no header found', block.startLine);
  }
  const headerLine = rawHeader.trim();
  const lineNumber = block.startLine + headerIndex;

  // Try reference header first (starts with `ref `).
  if (headerLine.startsWith('ref ')) {
    const match = REF_HEADER_RE.exec(headerLine);
    if (!match) {
      throw new VineParseError(
        `Invalid reference header: "${headerLine}"`,
        lineNumber,
      );
    }
    const id = match[1];
    const shortName = match[2];
    const vine = match[3];
    if (id === undefined || shortName === undefined || vine === undefined) {
      throw new VineParseError(
        `Invalid reference header: "${headerLine}"`,
        lineNumber,
      );
    }
    const annotations = parseAnnotations(match[4] ?? '');
    return { kind: 'ref', id, shortName, vine, headerIndex, annotations };
  }

  // Otherwise, try concrete task header.
  const match = HEADER_RE.exec(headerLine);
  if (!match) {
    throw new VineParseError(
      `Invalid task header: "${headerLine}"`,
      lineNumber,
    );
  }
  const id = match[1];
  const shortName = match[2];
  const status = match[3] as Status | undefined;
  if (id === undefined || shortName === undefined || status === undefined) {
    throw new VineParseError(
      `Invalid task header: "${headerLine}"`,
      lineNumber,
    );
  }
  const annotations = parseAnnotations(match[4] ?? '');
  return { kind: 'task', id, shortName, status, headerIndex, annotations };
}

// ---------------------------------------------------------------------------
// Unified block parser
// ---------------------------------------------------------------------------

/**
 * Parse a raw block into a {@link Task}.
 *
 * Handles both concrete task blocks and reference (`ref`) blocks. The first
 * **non-empty** line is the header. All subsequent lines are classified by
 * prefix in priority order:
 *
 * - `-> `        → dependency (target task id)
 * - `> `         → decision text
 * - `@artifact ` → artifact attachment  (forbidden on ref nodes)
 * - `@guidance ` → guidance attachment  (forbidden on ref nodes)
 * - `@file `     → file attachment      (forbidden on ref nodes)
 * - anything else → description line (preserved verbatim, NOT trimmed)
 *
 * Blank lines within the block are treated as empty description lines.
 * Description lines are joined with `\n`.
 */
export function parseBlock(block: RawBlock): Task {
  const header = parseHeader(block);

  const dependencies: string[] = [];
  const decisions: string[] = [];
  const descriptionParts: string[] = [];
  const attachments: Attachment[] = [];

  // Process body lines (everything after the header).
  for (let i = header.headerIndex + 1; i < block.lines.length; i++) {
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
          if (header.kind === 'ref') {
            throw new VineParseError(
              'Attachments are not allowed on reference nodes',
              lineNumber,
            );
          }
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

  if (header.kind === 'ref') {
    const ref: RefTask = {
      kind: 'ref',
      id: header.id,
      shortName: header.shortName,
      description,
      dependencies,
      decisions,
      vine: header.vine,
      annotations: header.annotations,
    };
    return ref;
  }

  const task: ConcreteTask = {
    kind: 'task',
    id: header.id,
    shortName: header.shortName,
    description,
    status: header.status,
    dependencies,
    decisions,
    attachments,
    annotations: header.annotations,
  };
  return task;
}
