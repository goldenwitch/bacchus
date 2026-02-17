import { Command } from 'commander';
import { readGraph } from '../io.js';
import { VineParseError, VineValidationError } from '@bacchus/core';

export const validateCommand = new Command('validate')
  .description('Validate a .vine file and report errors')
  .argument('<file>', 'path to .vine file')
  .action((file: string) => {
    try {
      readGraph(file);
      console.log('✓ Valid — no errors found.');
    } catch (error: unknown) {
      if (error instanceof VineParseError) {
        console.error(
          `Parse error (line ${String(error.line)}): ${error.message}`,
        );
        process.exitCode = 1;
      } else if (error instanceof VineValidationError) {
        console.error(
          `Validation error [${error.constraint}]: ${error.message}`,
        );
        process.exitCode = 1;
      } else {
        throw error;
      }
    }
  });
