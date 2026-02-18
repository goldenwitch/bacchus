import { Command } from 'commander';
import { readGraph } from '../io.js';
import {
  getSummary,
  VALID_STATUSES,
  VineParseError,
  VineValidationError,
  VineError,
} from '@bacchus/core';
import type { Status } from '@bacchus/core';

/** Human-readable status labels. */
const STATUS_LABELS: Readonly<Record<Status, string>> = {
  complete: 'Complete',
  started: 'Started',
  notstarted: 'Not Started',
  planning: 'Planning',
  blocked: 'Blocked',
};

export const showCommand = new Command('show')
  .description('Display a summary of a .vine task graph')
  .argument('<file>', 'path to .vine file')
  .action((file: string) => {
    try {
      const graph = readGraph(file);
      const summary = getSummary(graph);

      console.log(`Root:   ${summary.rootName} (${summary.rootId})`);
      console.log(`Tasks:  ${String(summary.total)}`);
      console.log(`Leaves: ${String(summary.leafCount)}`);
      console.log('');
      console.log('Status breakdown:');

      for (const s of VALID_STATUSES) {
        const count = summary.byStatus[s];
        if (count > 0) {
          console.log(`  ${STATUS_LABELS[s]}: ${String(count)}`);
        }
      }
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
      } else if (error instanceof VineError) {
        console.error(error.message);
        process.exitCode = 1;
      } else if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        console.error(`File not found: ${file}`);
        process.exitCode = 1;
      } else if ((error as NodeJS.ErrnoException).code === 'EACCES') {
        console.error(`Permission denied: ${file}`);
        process.exitCode = 1;
      }
    }
  });
