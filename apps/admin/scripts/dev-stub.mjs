#!/usr/bin/env node
/** Lance le stub d'API fictif (port 4010) + `next dev` (port 3001) pointé dessus. Développement uniquement. */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const cwd = fileURLToPath(new URL('..', import.meta.url));
const stub = spawn(process.execPath, ['scripts/stub-api.mjs'], { cwd, stdio: 'inherit' });
const nextBin = fileURLToPath(new URL('../node_modules/next/dist/bin/next', import.meta.url));
const next = spawn(process.execPath, [nextBin, 'dev', '--port', '3001'], { cwd, stdio: 'inherit', env: { ...process.env, API_URL: 'http://localhost:4010' } });
const stop = () => { stub.kill(); next.kill(); process.exit(0); };
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
next.on('exit', stop);
