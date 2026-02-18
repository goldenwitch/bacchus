import { Command } from 'commander';
import { readGraph, writeGraph } from '../io.js';
import {
  setStatus,
  getTask,
  VALID_STATUSES,
  isValidStatus,
  VineParseError,
  VineValidationError,
  VineError,
} from '@bacchus/core';

export const statusCommand = new Command('status')
  .description('Update the status of a task')
  .argument('<file>', 'path to .vine file')
  .argument('<id>', 'task id')
  .argument(
    '<status>',
    `new status (${['complete', 'started', 'planning', 'notstarted', 'blocked'].join(', ')})`,
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
      const oldStatus = task.status;
      graph = setStatus(graph, id, statusArg);
      writeGraph(file, graph);

      console.log(`✓ ${id}: ${oldStatus} → ${statusArg}`);
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
