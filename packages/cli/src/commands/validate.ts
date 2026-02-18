import { Command } from 'commander';
import { readGraph } from '../io.js';
import { handleCommandError } from '../errors.js';

export const validateCommand = new Command('validate')
  .description('Validate a .vine file and report errors')
  .argument('<file>', 'path to .vine file')
  .action((file: string) => {
    try {
      readGraph(file);
      console.log('✓ Valid — no errors found.');
    } catch (error: unknown) {
      handleCommandError(error, file);
    }
  });
