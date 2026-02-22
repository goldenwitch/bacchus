import { VineParseError, VineValidationError, VineError } from '@bacchus/core';

function isErrnoException(e: unknown): e is NodeJS.ErrnoException {
  return e instanceof Error && 'code' in e;
}

/**
 * Shared error handler for CLI commands.
 *
 * Prints a user-friendly message for known error types, sets
 * `process.exitCode = 1`, and re-throws truly unknown errors.
 */
export function handleCommandError(error: unknown, file: string): void {
  if (error instanceof VineParseError) {
    console.error(`Parse error (line ${String(error.line)}): ${error.message}`);
  } else if (error instanceof VineValidationError) {
    console.error(`Validation error [${error.constraint}]: ${error.message}`);
  } else if (error instanceof VineError) {
    console.error(error.message);
  } else if (isErrnoException(error) && error.code === 'ENOENT') {
    console.error(`File not found: ${file}`);
  } else if (isErrnoException(error) && error.code === 'EACCES') {
    console.error(`Permission denied: ${file}`);
  } else {
    // Unknown error — surface it rather than silently swallowing.
    throw error;
  }
  process.exitCode = 1;
}
