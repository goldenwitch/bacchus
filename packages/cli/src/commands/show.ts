import { Command } from 'commander';
import { readGraph } from '../io.js';
import { handleCommandError } from '../errors.js';
import { getSummary, VALID_STATUSES } from '@bacchus/core';
import type { Status } from '@bacchus/core';

/** Human-readable status labels. */
const STATUS_LABELS: Readonly<Record<Status, string>> = {
  complete: 'Complete',
  started: 'Started',
  reviewing: 'Reviewing',
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
      handleCommandError(error, file);
    }
  });
