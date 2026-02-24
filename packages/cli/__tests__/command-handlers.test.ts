import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { validateCommand } from '../src/commands/validate.js';
import { showCommand } from '../src/commands/show.js';
import { listCommand } from '../src/commands/list.js';
import { addCommand } from '../src/commands/add.js';
import { addRefCommand } from '../src/commands/add-ref.js';
import { statusCommand } from '../src/commands/status.js';
import { handleCommandError } from '../src/errors.js';
import { Command } from 'commander';
import { VineParseError, VineValidationError } from '@bacchus/core';

const SAMPLE_VINE = `\
vine 1.0.0
---
[root] Web Application (planning)
The full web application project.
-> dashboard
---
[dashboard] Dashboard UI (notstarted)
Build the main dashboard interface.
-> auth
---
[auth] Authentication Module (started)
Implement user login and session management.
-> setup
---
[setup] Environment Setup (complete)
Install dependencies and configure the build system.
`;

const INVALID_SYNTAX = `\
This is not a valid vine file at all.
Just random text.
`;

let tempDir: string;
let logSpy: ReturnType<typeof vi.spyOn>;
let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'vine-cmd-test-'));
  logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  process.exitCode = undefined;
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
  logSpy.mockRestore();
  errorSpy.mockRestore();
  process.exitCode = undefined;
});

/**
 * Create a fresh Commander parent and attach a sub-command for isolated testing.
 * Commander mutates internal state, so each test needs its own copy.
 */
function wrapCommand(cmd: Command): Command {
  const parent = new Command();
  parent.exitOverride(); // Throw instead of process.exit
  parent.addCommand(cmd);
  return parent;
}

function writeVine(name: string, content: string): string {
  const p = join(tempDir, name);
  writeFileSync(p, content, 'utf-8');
  return p;
}

// ---------------------------------------------------------------------------
// validate command
// ---------------------------------------------------------------------------

describe('validate command', () => {
  it('prints success for a valid file', async () => {
    const file = writeVine('valid.vine', SAMPLE_VINE);
    const prog = wrapCommand(validateCommand);
    await prog.parseAsync(['node', 'test', 'validate', file]);

    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Valid'));
    expect(process.exitCode).toBeUndefined();
  });

  it('reports parse error for invalid syntax', async () => {
    const file = writeVine('bad.vine', INVALID_SYNTAX);
    const prog = wrapCommand(validateCommand);
    await prog.parseAsync(['node', 'test', 'validate', file]);

    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('Parse error'),
    );
    expect(process.exitCode).toBe(1);
  });

  it('reports file not found', async () => {
    const file = join(tempDir, 'nonexistent.vine');
    const prog = wrapCommand(validateCommand);
    await prog.parseAsync(['node', 'test', 'validate', file]);

    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('File not found'),
    );
    expect(process.exitCode).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// show command
// ---------------------------------------------------------------------------

describe('show command', () => {
  it('prints graph summary', async () => {
    const file = writeVine('test.vine', SAMPLE_VINE);
    const prog = wrapCommand(showCommand);
    await prog.parseAsync(['node', 'test', 'show', file]);

    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Root:'));
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Tasks:'));
    expect(process.exitCode).toBeUndefined();
  });

  it('reports parse error for invalid file', async () => {
    const file = writeVine('bad.vine', INVALID_SYNTAX);
    const prog = wrapCommand(showCommand);
    await prog.parseAsync(['node', 'test', 'show', file]);

    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('Parse error'),
    );
    expect(process.exitCode).toBe(1);
  });

  it('reports file not found', async () => {
    const file = join(tempDir, 'nonexistent.vine');
    const prog = wrapCommand(showCommand);
    await prog.parseAsync(['node', 'test', 'show', file]);

    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('File not found'),
    );
    expect(process.exitCode).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// list command
// ---------------------------------------------------------------------------

describe('list command', () => {
  it('lists all tasks', async () => {
    const file = writeVine('test.vine', SAMPLE_VINE);
    const prog = wrapCommand(listCommand);
    await prog.parseAsync(['node', 'test', 'list', file]);

    expect(logSpy).toHaveBeenCalled();
    expect(process.exitCode).toBeUndefined();
  });

  it('filters by status', async () => {
    const file = writeVine('test.vine', SAMPLE_VINE);
    const prog = wrapCommand(listCommand);
    await prog.parseAsync([
      'node',
      'test',
      'list',
      file,
      '--status',
      'complete',
    ]);

    expect(logSpy).toHaveBeenCalled();
    expect(process.exitCode).toBeUndefined();
  });

  it('searches by text', async () => {
    const file = writeVine('test.vine', SAMPLE_VINE);
    const prog = wrapCommand(listCommand);
    await prog.parseAsync(['node', 'test', 'list', file, '--search', 'auth']);

    expect(logSpy).toHaveBeenCalled();
    expect(process.exitCode).toBeUndefined();
  });

  it('rejects invalid status', async () => {
    const file = writeVine('test.vine', SAMPLE_VINE);
    const prog = wrapCommand(listCommand);
    await prog.parseAsync(['node', 'test', 'list', file, '--status', 'bogus']);

    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('Invalid status'),
    );
    expect(process.exitCode).toBe(1);
  });

  it('warns when --status and --search are both provided', async () => {
    const file = writeVine('test.vine', SAMPLE_VINE);
    const prog = wrapCommand(listCommand);
    await prog.parseAsync([
      'node',
      'test',
      'list',
      file,
      '--status',
      'complete',
      '--search',
      'x',
    ]);

    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('mutually exclusive'),
    );
  });

  it('reports file not found', async () => {
    const file = join(tempDir, 'nonexistent.vine');
    const prog = wrapCommand(listCommand);
    await prog.parseAsync(['node', 'test', 'list', file]);

    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('File not found'),
    );
    expect(process.exitCode).toBe(1);
  });

  it('reports parse error', async () => {
    const file = writeVine('bad.vine', INVALID_SYNTAX);
    const prog = wrapCommand(listCommand);
    await prog.parseAsync(['node', 'test', 'list', file]);

    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('Parse error'),
    );
    expect(process.exitCode).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// add command
// ---------------------------------------------------------------------------

describe('add command', () => {
  it('reports validation error for island task', async () => {
    // Adding a task that nothing depends on creates an island → validation error.
    const file = writeVine('test.vine', SAMPLE_VINE);
    const prog = wrapCommand(addCommand);
    await prog.parseAsync([
      'node',
      'test',
      'add',
      file,
      '--id',
      'orphan',
      '--name',
      'Orphan',
      '--depends-on',
      'setup',
    ]);

    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('Validation error'),
    );
    expect(process.exitCode).toBe(1);
  });

  it('rejects invalid status', async () => {
    const file = writeVine('test.vine', SAMPLE_VINE);
    const prog = wrapCommand(addCommand);
    await prog.parseAsync([
      'node',
      'test',
      'add',
      file,
      '--id',
      'x',
      '--name',
      'X',
      '--status',
      'bogus',
    ]);

    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('Invalid status'),
    );
    expect(process.exitCode).toBe(1);
  });

  it('rejects invalid task id format', async () => {
    const file = writeVine('test.vine', SAMPLE_VINE);
    const prog = wrapCommand(addCommand);
    await prog.parseAsync([
      'node',
      'test',
      'add',
      file,
      '--id',
      'bad id!',
      '--name',
      'Bad ID',
    ]);

    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('Invalid task id'),
    );
    expect(process.exitCode).toBe(1);
  });

  it('reports file not found', async () => {
    const file = join(tempDir, 'nonexistent.vine');
    const prog = wrapCommand(addCommand);
    await prog.parseAsync([
      'node',
      'test',
      'add',
      file,
      '--id',
      'x',
      '--name',
      'X',
      '--depends-on',
      'setup',
    ]);

    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('File not found'),
    );
    expect(process.exitCode).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// add-ref command
// ---------------------------------------------------------------------------

describe('add-ref command', () => {
  it('reports validation error for island ref', async () => {
    // Adding a ref that nothing depends on creates an island → validation error.
    const file = writeVine('test.vine', SAMPLE_VINE);
    const prog = wrapCommand(addRefCommand);
    await prog.parseAsync([
      'node',
      'test',
      'add-ref',
      file,
      '--id',
      'ext',
      '--name',
      'External Graph',
      '--vine',
      'other.vine',
      '--depends-on',
      'setup',
    ]);

    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('Validation error'),
    );
    expect(process.exitCode).toBe(1);
  });

  it('rejects missing --vine flag', async () => {
    const file = writeVine('test.vine', SAMPLE_VINE);
    const prog = wrapCommand(addRefCommand);

    // Commander throws when a required option is missing.
    await expect(
      prog.parseAsync([
        'node',
        'test',
        'add-ref',
        file,
        '--id',
        'ext',
        '--name',
        'External',
      ]),
    ).rejects.toThrow();
  });

  it('rejects invalid task id format', async () => {
    const file = writeVine('test.vine', SAMPLE_VINE);
    const prog = wrapCommand(addRefCommand);
    await prog.parseAsync([
      'node',
      'test',
      'add-ref',
      file,
      '--id',
      'bad id!',
      '--name',
      'Bad',
      '--vine',
      'other.vine',
    ]);

    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('Invalid task id'),
    );
    expect(process.exitCode).toBe(1);
  });

  it('reports file not found', async () => {
    const file = join(tempDir, 'nonexistent.vine');
    const prog = wrapCommand(addRefCommand);
    await prog.parseAsync([
      'node',
      'test',
      'add-ref',
      file,
      '--id',
      'ext',
      '--name',
      'External',
      '--vine',
      'other.vine',
      '--depends-on',
      'setup',
    ]);

    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('File not found'),
    );
    expect(process.exitCode).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// status command
// ---------------------------------------------------------------------------

describe('status command', () => {
  it('updates a task status', async () => {
    const file = writeVine('test.vine', SAMPLE_VINE);
    const prog = wrapCommand(statusCommand);
    await prog.parseAsync(['node', 'test', 'status', file, 'auth', 'complete']);

    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('started'));
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('complete'));
    expect(process.exitCode).toBeUndefined();

    // Verify it was actually written.
    const content = readFileSync(file, 'utf-8');
    expect(content).toContain('(complete)');
    // 'auth' task should now be complete — check for the line.
    expect(content).toMatch(/\[auth\].*\(complete\)/);
  });

  it('rejects invalid status', async () => {
    const file = writeVine('test.vine', SAMPLE_VINE);
    const prog = wrapCommand(statusCommand);
    await prog.parseAsync(['node', 'test', 'status', file, 'auth', 'bogus']);

    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('Invalid status'),
    );
    expect(process.exitCode).toBe(1);
  });

  it('reports file not found', async () => {
    const file = join(tempDir, 'nonexistent.vine');
    const prog = wrapCommand(statusCommand);
    await prog.parseAsync(['node', 'test', 'status', file, 'auth', 'complete']);

    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('File not found'),
    );
    expect(process.exitCode).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// handleCommandError (shared error handler)
// ---------------------------------------------------------------------------

describe('handleCommandError', () => {
  it('handles VineParseError', () => {
    const err = new VineParseError('bad token', 5);
    handleCommandError(err, 'test.vine');

    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('Parse error'),
    );
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('line 5'));
    expect(process.exitCode).toBe(1);
  });

  it('handles VineValidationError', () => {
    const err = new VineValidationError('cycle found', 'no-cycles', []);
    handleCommandError(err, 'test.vine');

    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('Validation error'),
    );
    expect(process.exitCode).toBe(1);
  });

  it('handles ENOENT', () => {
    const err = new Error('ENOENT') as NodeJS.ErrnoException;
    err.code = 'ENOENT';
    handleCommandError(err, 'missing.vine');

    expect(errorSpy).toHaveBeenCalledWith('File not found: missing.vine');
    expect(process.exitCode).toBe(1);
  });

  it('handles EACCES', () => {
    const err = new Error('EACCES') as NodeJS.ErrnoException;
    err.code = 'EACCES';
    handleCommandError(err, 'locked.vine');

    expect(errorSpy).toHaveBeenCalledWith('Permission denied: locked.vine');
    expect(process.exitCode).toBe(1);
  });

  it('re-throws unknown errors', () => {
    const err = new TypeError('unexpected');
    expect(() => handleCommandError(err, 'test.vine')).toThrow(TypeError);
  });
});
