// ---------------------------------------------------------------------------
// Constants, regex patterns & internal types shared across parser modules
// ---------------------------------------------------------------------------

/** Matches the magic first line: `vine 1.0.0` (semver-like). */
export const MAGIC_RE = /^vine\s+(\d+\.\d+\.\d+)$/;

/**
 * Matches a task header line:
 *   [some-id] Short Name (status)
 *
 * The status alternation includes `reviewing` per v1.0.0.
 */
export const HEADER_RE =
  /^\[([a-zA-Z0-9-]+(?:\/[a-zA-Z0-9-]+)*)\]\s+(.+?)\s+\((complete|notstarted|planning|blocked|started|reviewing)\)((?:\s+@[a-zA-Z][a-zA-Z0-9]*\([^)]*\))*)$/;

/** Matches a reference node header: `ref [id] Short Name (uri)` */
export const REF_HEADER_RE =
  /^ref\s+\[([a-zA-Z0-9-]+(?:\/[a-zA-Z0-9-]+)*)\]\s+(.+?)\s+\((\S+)\)((?:\s+@[a-zA-Z][a-zA-Z0-9]*\([^)]*\))*)$/;

/** Matches a single annotation: @key(values) */
export const ANNOTATION_RE = /@([a-zA-Z][a-zA-Z0-9]*)\(([^)]*)\)/g;

/** The fixed line that terminates the preamble section. */
export const PREAMBLE_TERMINATOR = '---';

/** Recognized attachment class prefixes. */
export const ATTACHMENT_CLASSES: ReadonlySet<string> = new Set<string>([
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
export interface RawBlock {
  /** 1-based line number of the first line in this block. */
  startLine: number;
  /** All lines that make up the block (including blank lines). */
  lines: string[];
}

/**
 * Parsed preamble metadata returned by {@link parsePreamble}.
 */
export interface Preamble {
  /** Parsed key-value metadata from the preamble. */
  title: string | undefined;
  /** The delimiter to use for splitting task blocks. */
  delimiter: string;
  /** ID namespace prefix for reference expansion. */
  prefix: string | undefined;
  /** Index into the lines array of the first line after the preamble terminator. */
  bodyStartIndex: number;
}
