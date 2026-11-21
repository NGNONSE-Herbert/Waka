import { loadConfig, loadDotEnv } from '../config.js';
import { createDatabase } from './client.js';
import { migrate } from './migrate.js';
import { isSeeded, seed } from './seed.js';

loadDotEnv();
const config = loadConfig();
if (config.isProduction) {
  process.stderr.write('Refus : le seed de démonstration ne s’exécute jamais en production.\n');
  process.exit(1);
}
const database = await createDatabase({ databaseUrl: config.databaseUrl, pgliteDir: config.pgliteDir });
await migrate(database);
if (await isSeeded(database)) {
  process.stdout.write('Base déjà initialisée : seed ignoré. (Supprimez apps/api/.pglite pour repartir de zéro.)\n');
} else {
  const r = await seed(database, config);
  process.stdout.write(`Seed de démonstration terminé : ${r.trips} trajets à venir (données fictives).\n`);
}
await database.close();
