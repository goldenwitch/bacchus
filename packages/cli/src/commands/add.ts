import { Command } from 'commander';
import { readGraph, writeGraph } from '../io.js';
import { addTask } from '@bacchus/core';
import type { Status, Task } from '@bacchus/core';

const VALID_STATUSES: readonly Status[] = [
  'complete',
  'started',
  'planning',
  'notstarted',
  'blocked',
];

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
      const status = opts.status as Status;
      if (!VALID_STATUSES.includes(status)) {
        console.error(
          `Invalid status "${opts.status}". Valid: ${VALID_STATUSES.join(', ')}`,
        );
        process.exitCode = 1;
        return;
      }

      const task: Task = {
        id: opts.id,
        shortName: opts.name,
        description: opts.description,
        status,
        dependencies: opts.dependsOn ?? [],
        decisions: [],
      };

      let graph = readGraph(file);
      graph = addTask(graph, task);
      writeGraph(file, graph);

      console.log(`✓ Added task "${opts.id}" to ${file}`);
    },
  );
