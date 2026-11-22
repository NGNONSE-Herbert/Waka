// Lance Expo pour un téléphone Android branché en USB (aucune connexion entrante sur le PC).
import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const PORT = '8081';
const candidates = [
  process.env.ANDROID_HOME && join(process.env.ANDROID_HOME, 'platform-tools', 'adb.exe'),
  process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, 'Android', 'Sdk', 'platform-tools', 'adb.exe'),
  process.env.USERPROFILE && join(process.env.USERPROFILE, 'platform-tools', 'adb.exe'),
].filter(Boolean);
const adb = candidates.find((p) => existsSync(p)) ?? 'adb';

const run = (...args) => spawnSync(adb, args, { encoding: 'utf8' });
const stop = (message) => {
  console.error(`\n[Waka] ${message}\n`);
  process.exit(1);
};

const devices = run('devices');
if (devices.error) stop('adb est introuvable. Placez Android Platform Tools dans %USERPROFILE%\\platform-tools (voir apps/mobile/README.md).');

const lines = devices.stdout.split(/\r?\n/).slice(1).filter((l) => l.trim());
if (lines.some((l) => /\bunauthorized\b/.test(l))) stop('Sur le téléphone, acceptez « Autoriser le débogage USB », puis relancez.');
const online = lines.filter((l) => /\bdevice$/.test(l.trim()));
if (online.length === 0) stop('Aucun téléphone détecté. Branchez-le en USB et activez le débogage USB.');
if (online.length > 1) stop('Plusieurs appareils détectés. Gardez un seul téléphone branché.');

const reverse = run('reverse', `tcp:${PORT}`, `tcp:${PORT}`);
if (reverse.status !== 0) stop(`Échec de la redirection USB : ${reverse.stderr.trim()}`);
console.log(`[Waka] Téléphone connecté, port ${PORT} redirigé par USB.`);

const pathWithAdb = adb === 'adb' ? process.env.PATH : `${join(adb, '..')};${process.env.PATH}`;
const child = spawn('npx', ['expo', 'start', '--localhost', '--android', '--port', PORT], {
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, PATH: pathWithAdb },
});
child.on('exit', (code) => process.exit(code ?? 0));
