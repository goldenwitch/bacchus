import { Command } from 'commander';
import { readGraph, writeGraph } from '../io.js';
import { setStatus, getTask } from '@bacchus/core';
import type { Status } from '@bacchus/core';

const VALID_STATUSES: readonly Status[] = [
  'complete',
  'started',
  'planning',
  'notstarted',
  'blocked',
];

export const statusCommand = new Command('status')
  .description('Update the status of a task')
  .argument('<file>', 'path to .vine file')
  .argument('<id>', 'task id')
  .argument('<status>', `new status (${['complete', 'started', 'planning', 'notstarted', 'blocked'].join(', ')})`)
  .action((file: string, id: string, statusArg: string) => {
    const status = statusArg as Status;
    if (!VALID_STATUSES.includes(status)) {
      console.error(
        `Invalid status "${statusArg}". Valid: ${VALID_STATUSES.join(', ')}`,
      );
      process.exitCode = 1;
      return;
    }

    let graph = readGraph(file);
    const task = getTask(graph, id);
    const oldStatus = task.status;
    graph = setStatus(graph, id, status);
    writeGraph(file, graph);

    console.log(`✓ ${id}: ${oldStatus} → ${status}`);
  });
