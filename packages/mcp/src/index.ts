#!/usr/bin/env node
import { resolve } from 'node:path';
import { setRoots } from './io.js';
import { startServer } from './server.js';

// ---------------------------------------------------------------------------
// Optional --cwd flag — lets non-VS-Code clients (e.g. Claude Desktop)
// specify where .vine files live.
// ---------------------------------------------------------------------------

const cwdIdx = process.argv.indexOf('--cwd');
if (cwdIdx !== -1 && process.argv[cwdIdx + 1]) {
  const dir = resolve(process.argv[cwdIdx + 1]);
  process.chdir(dir);
  setRoots([dir]);
}

await startServer();
