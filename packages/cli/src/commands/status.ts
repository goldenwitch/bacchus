import { Command } from 'commander';
import { readGraph, writeGraph } from '../io.js';
import { handleCommandError } from '../errors.js';
import { setStatus, getTask, VALID_STATUSES, isValidStatus } from '@bacchus/core';

export const statusCommand = new Command('status')
  .description('Update the status of a task')
  .argument('<file>', 'path to .vine file')
  .argument('<id>', 'task id')
  .argument(
    '<status>',
    `new status (${['complete', 'started', 'reviewing', 'planning', 'notstarted', 'blocked'].join(', ')})`,
  )
  .action((file: string, id: string, statusArg: string) => {
    if (!isValidStatus(statusArg)) {
      console.error(
        `Invalid status "${statusArg}". Valid: ${VALID_STATUSES.join(', ')}`,
      );
      process.exitCode = 1;
      return;
    }

    try {
      let graph = readGraph(file);
      const task = getTask(graph, id);
      if (task.kind === 'ref') {
        console.error(`Task "${id}" is a ref node and has no status.`);
        process.exitCode = 1;
        return;
      }
      const oldStatus = task.status;
      graph = setStatus(graph, id, statusArg);
      writeGraph(file, graph);

      console.log(`✓ ${id}: ${String(oldStatus)} → ${statusArg}`);
    } catch (error: unknown) {
      handleCommandError(error, file);
    }
  });
