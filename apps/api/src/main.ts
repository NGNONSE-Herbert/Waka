import 'reflect-metadata';
import { createApp } from './app.js';
import { JsonLogger } from './common/logger.js';
import { loadConfig, loadDotEnv } from './config.js';
import { createDatabase } from './db/client.js';
import { migrate } from './db/migrate.js';
import { isSeeded, seed } from './db/seed.js';

async function bootstrap(): Promise<void> {
  loadDotEnv();
  const config = loadConfig(); // refuse PAYMENT_PROVIDER=mock en production
  const logger = new JsonLogger(config.logLevel);
  const database = await createDatabase({ databaseUrl: config.databaseUrl, pgliteDir: config.pgliteDir });
  const applied = await migrate(database);
  logger.info('db.ready', { driver: database.driver, migrationsApplied: applied, ...(database.driver === 'pglite' ? { dir: config.pgliteDir } : {}) });
  if (config.seedOnEmpty && !(await isSeeded(database))) {
    const r = await seed(database, config);
    logger.info('db.seeded', { trips: r.trips, note: 'Données de démonstration fictives' });
  }
  const waka = await createApp(config, database, logger);
  await waka.app.listen(config.port);
  logger.info('api.listening', { port: config.port, env: config.nodeEnv, docs: config.isProduction ? null : `http://localhost:${config.port}/docs` });
  const shutdown = async (signal: string) => {
    logger.info('api.shutdown', { signal });
    await waka.close();
    await database.close();
    process.exit(0);
  };
  process.once('SIGINT', () => void shutdown('SIGINT'));
  process.once('SIGTERM', () => void shutdown('SIGTERM'));
}

bootstrap().catch((err: unknown) => {
  process.stderr.write(`\n[waka-api] DÉMARRAGE REFUSÉ : ${(err as Error).message}\n\n`);
  process.exit(1);
});
