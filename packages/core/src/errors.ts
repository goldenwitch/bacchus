/**
 * Base error for all vine-related failures.
 */
export class VineError extends Error {
  override readonly name = 'VineError';
}

/**
 * Thrown when the parser encounters a syntax issue.
 */
export class VineParseError extends VineError {
  override readonly name = 'VineParseError';

  /** 1-based line number where the error occurred. */
  readonly line: number;

  constructor(message: string, line: number) {
    super(`Line ${String(line)}: ${message}`);
    this.line = line;
  }
}

/**
 * Constraint identifier for validation errors.
 */
export type ValidationConstraint =
  | 'at-least-one-task'
  | 'valid-dependency-refs'
  | 'no-cycles'
  | 'no-islands'
  | 'ref-uri-required'
  | 'no-ref-attachments';

/**
 * Discriminated union carrying details about which constraint was violated.
 */
export type ValidationDetails =
  | { constraint: 'at-least-one-task' }
  | { constraint: 'valid-dependency-refs'; taskId: string; missingDep: string }
  | { constraint: 'no-cycles'; cycle: string[] }
  | { constraint: 'no-islands'; islandTaskIds: string[] }
  | { constraint: 'ref-uri-required'; taskId: string }
  | { constraint: 'no-ref-attachments'; taskId: string };

/**
 * Thrown when a structural constraint is violated.
 */
export class VineValidationError extends VineError {
  override readonly name = 'VineValidationError';

  readonly constraint: ValidationConstraint;
  readonly details: ValidationDetails;

  constructor(message: string, details: ValidationDetails) {
    super(message);
    this.constraint = details.constraint;
    this.details = details;
  }
}
