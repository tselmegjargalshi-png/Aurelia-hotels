#!/usr/bin/env node
/** Development: rebuild the client on change and restart the API server on change. */
import { spawn } from 'node:child_process';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const bin = (name) => path.join(root, 'node_modules/.bin', name);
const procs = [
  spawn(process.execPath, [path.join(root, 'scripts/build-client.mjs'), '--watch'], { stdio: 'inherit', cwd: root }),
  spawn(bin('tsx'), ['watch', '--clear-screen=false', 'server/src/index.ts'], {
    stdio: 'inherit', cwd: root, env: { ...process.env, NODE_OPTIONS: '--disable-warning=ExperimentalWarning' },
  }),
];
const stop = () => { for (const p of procs) p.kill('SIGTERM'); process.exit(0); };
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
