import { Command } from 'commander';
import { readGraph } from '../io.js';
import { filterByStatus, searchTasks, getTask } from '@bacchus/core';
import type { Status, Task } from '@bacchus/core';

/** Valid status keywords for the --status flag. */
const VALID_STATUSES: readonly Status[] = [
  'complete',
  'started',
  'planning',
  'notstarted',
  'blocked',
];

function printTaskTable(tasks: Task[]): void {
  if (tasks.length === 0) {
    console.log('No tasks found.');
    return;
  }

  // Calculate column widths.
  const idWidth = Math.max(2, ...tasks.map((t) => t.id.length));
  const nameWidth = Math.max(4, ...tasks.map((t) => t.shortName.length));
  const statusWidth = Math.max(6, ...tasks.map((t) => t.status.length));

  const header = `${'ID'.padEnd(idWidth)}  ${'NAME'.padEnd(nameWidth)}  ${'STATUS'.padEnd(statusWidth)}`;
  console.log(header);
  console.log('-'.repeat(header.length));

  for (const task of tasks) {
    console.log(
      `${task.id.padEnd(idWidth)}  ${task.shortName.padEnd(nameWidth)}  ${task.status.padEnd(statusWidth)}`,
    );
  }
}

export const listCommand = new Command('list')
  .description('List tasks in a .vine file')
  .argument('<file>', 'path to .vine file')
  .option('-s, --status <status>', 'filter by status')
  .option('-q, --search <query>', 'search by text')
  .action((file: string, opts: { status?: string; search?: string }) => {
    const graph = readGraph(file);

    let tasks: Task[];

    if (opts.status !== undefined) {
      const status = opts.status as Status;
      if (!VALID_STATUSES.includes(status)) {
        console.error(
          `Invalid status "${opts.status}". Valid: ${VALID_STATUSES.join(', ')}`,
        );
        process.exitCode = 1;
        return;
      }
      tasks = filterByStatus(graph, status);
    } else if (opts.search !== undefined) {
      tasks = searchTasks(graph, opts.search);
    } else {
      // Default: all tasks in order.
      tasks = graph.order.map((id) => getTask(graph, id));
    }

    printTaskTable(tasks);
  });
