import { Command } from 'commander';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { handleCommandError } from './errors.js';
import { validateCommand } from './commands/validate.js';
import { showCommand } from './commands/show.js';
import { listCommand } from './commands/list.js';
import { addCommand } from './commands/add.js';
import { statusCommand } from './commands/status.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(
  readFileSync(join(__dirname, '..', 'package.json'), 'utf-8'),
) as { version: string };

async function main(): Promise<void> {
  const program = new Command();

  program
    .name('vine')
    .description('CLI for working with VINE task graphs')
    .version(pkg.version);

  program.addCommand(validateCommand);
  program.addCommand(showCommand);
  program.addCommand(listCommand);
  program.addCommand(addCommand);
  program.addCommand(statusCommand);

  await program.parseAsync();
}

main().catch((error: unknown) => {
  handleCommandError(error, '<unknown>');
});
