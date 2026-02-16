import { Command } from 'commander';
import { validateCommand } from './commands/validate.js';
import { showCommand } from './commands/show.js';
import { listCommand } from './commands/list.js';
import { addCommand } from './commands/add.js';
import { statusCommand } from './commands/status.js';

const program = new Command();

program
  .name('vine')
  .description('CLI for working with VINE task graphs')
  .version('0.1.0');

program.addCommand(validateCommand);
program.addCommand(showCommand);
program.addCommand(listCommand);
program.addCommand(addCommand);
program.addCommand(statusCommand);

program.parse();
