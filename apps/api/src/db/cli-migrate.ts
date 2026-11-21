import { loadConfig, loadDotEnv } from '../config.js';
import { createDatabase } from './client.js';
import { migrate } from './migrate.js';

loadDotEnv();
const config = loadConfig();
const database = await createDatabase({ databaseUrl: config.databaseUrl, pgliteDir: config.pgliteDir });
const applied = await migrate(database);
process.stdout.write(`Migrations appliquées : ${applied.length ? applied.join(', ') : 'aucune (à jour)'}\n`);
await database.close();
