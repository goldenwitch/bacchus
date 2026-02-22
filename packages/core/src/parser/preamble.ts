// ---------------------------------------------------------------------------
// Step 1 — Parse magic line
// Step 2 — Parse preamble metadata
// ---------------------------------------------------------------------------

import type { Preamble } from './constants.js';
import { MAGIC_RE, PREAMBLE_TERMINATOR } from './constants.js';
import { VineParseError } from '../errors.js';

/**
 * Validate and extract the version from the magic first line.
 *
 * @returns The extracted semver version string.
 * @throws {VineParseError} if the first line is missing or malformed.
 */
export function parseMagicLine(firstLine: string | undefined): string {
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

/**
 * Read lines from index 1 (after the magic line) until we find the preamble
 * terminator (`---`). Each non-blank line before the terminator is parsed as
 * `key: value` metadata.
 *
 * The preamble terminator is always `---`, regardless of any `delimiter` key.
 *
 * @throws {VineParseError} if the preamble terminator is never found.
 */
export function parsePreamble(lines: string[]): Preamble {
  let title: string | undefined;
  let delimiter = '---';
  let prefix: string | undefined;
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
      } else if (key === 'prefix') {
        prefix = value;
      }
      // Unknown keys are silently ignored.
    }
  }

  if (terminatorIndex === -1) {
    throw new VineParseError('Missing preamble terminator "---"', lines.length);
  }

  return {
    title,
    delimiter,
    prefix,
    bodyStartIndex: terminatorIndex + 1,
  };
}
