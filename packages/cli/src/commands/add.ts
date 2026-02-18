import { Command } from 'commander';
import { readGraph, writeGraph } from '../io.js';
import {
  addTask,
  VALID_STATUSES,
  isValidStatus,
  VineParseError,
  VineValidationError,
  VineError,
} from '@bacchus/core';
import type { Task } from '@bacchus/core';

export const addCommand = new Command('add')
  .description('Add a new task to a .vine file')
  .argument('<file>', 'path to .vine file')
  .requiredOption('--id <id>', 'task id (alphanumeric + hyphens)')
  .requiredOption('--name <name>', 'short name for the task')
  .option('--status <status>', 'task status', 'notstarted')
  .option('--description <text>', 'task description', '')
  .option('--depends-on <ids...>', 'dependency task ids')
  .action(
    (
      file: string,
      opts: {
        id: string;
        name: string;
        status: string;
        description: string;
        dependsOn?: string[];
      },
    ) => {
      if (!isValidStatus(opts.status)) {
        console.error(
          `Invalid status "${opts.status}". Valid: ${VALID_STATUSES.join(', ')}`,
        );
        process.exitCode = 1;
        return;
      }

      if (!/^[a-z0-9-]+$/i.test(opts.id)) {
        console.error(
          'Invalid task id: must contain only letters, digits, and hyphens.',
        );
        process.exitCode = 1;
        return;
      }

      try {
        const task: Task = {
          id: opts.id,
          shortName: opts.name,
          description: opts.description,
          status: opts.status,
          dependencies: opts.dependsOn ?? [],
          decisions: [],
        };

        let graph = readGraph(file);
        graph = addTask(graph, task);
        writeGraph(file, graph);

        console.log(`✓ Added task "${opts.id}" to ${file}`);
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
    },
  );
