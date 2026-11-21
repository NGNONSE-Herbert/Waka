// Mode développement : compilation tsc en continu + redémarrage automatique de node (node --watch).
// tsc est utilisé (et non esbuild/tsx) car NestJS a besoin des métadonnées de décorateurs.
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const cwd = fileURLToPath(new URL('..', import.meta.url));
const tsc = fileURLToPath(new URL('../node_modules/typescript/bin/tsc', import.meta.url));

const first = spawnSync(process.execPath, [tsc, '-p', 'tsconfig.build.json'], { cwd, stdio: 'inherit' });
if (first.status !== 0) process.exit(first.status ?? 1);

const watcher = spawn(process.execPath, [tsc, '-p', 'tsconfig.build.json', '--watch', '--preserveWatchOutput'], { cwd, stdio: 'inherit' });
const server = spawn(process.execPath, ['--watch', '--enable-source-maps', 'dist/main.js'], { cwd, stdio: 'inherit', env: { PORT: '4000', ...process.env } });

const stop = () => {
  watcher.kill();
  server.kill();
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
