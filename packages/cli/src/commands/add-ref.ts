import { Command } from 'commander';
import { readGraph, writeGraph } from '../io.js';
import { handleCommandError } from '../errors.js';
import { addRef, EMPTY_ANNOTATIONS } from '@bacchus/core';
import type { RefTask } from '@bacchus/core';

export const addRefCommand = new Command('add-ref')
  .description('Add a ref node to a .vine file')
  .argument('<file>', 'path to .vine file')
  .requiredOption('--id <id>', 'task id (alphanumeric + hyphens)')
  .requiredOption('--name <name>', 'short name for the ref node')
  .requiredOption('--vine <uri>', 'URI of the external .vine file')
  .option('--description <text>', 'task description', '')
  .option('--depends-on <ids...>', 'dependency task ids')
  .action(
    (
      file: string,
      opts: {
        id: string;
        name: string;
        vine: string;
        description: string;
        dependsOn?: string[];
      },
    ) => {
      if (!/^[a-z0-9-]+(?:\/[a-z0-9-]+)*$/i.test(opts.id)) {
        console.error(
          'Invalid task id: must contain only letters, digits, hyphens, and slashes.',
        );
        process.exitCode = 1;
        return;
      }

      try {
        const ref: RefTask = {
          kind: 'ref',
          id: opts.id,
          shortName: opts.name,
          description: opts.description,
          dependencies: opts.dependsOn ?? [],
          decisions: [],
          annotations: EMPTY_ANNOTATIONS,
          vine: opts.vine,
        };

        let graph = readGraph(file);
        graph = addRef(graph, ref);
        writeGraph(file, graph);

        console.log(`✓ Added ref "${opts.id}" to ${file}`);
      } catch (error: unknown) {
        handleCommandError(error, file);
      }
    },
  );
