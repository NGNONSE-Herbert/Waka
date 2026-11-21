import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { sql } from 'drizzle-orm';
import { PACKAGE_ROOT } from '../config.js';
import { type Database, rows } from './client.js';

export const MIGRATIONS_DIR = join(PACKAGE_ROOT, 'migrations');

/**
 * Applique les migrations SQL versionnées (migrations/NNNN_*.sql) dans l'ordre, une seule fois.
 * Chaque fichier est appliqué dans une transaction ; sa somme de contrôle est enregistrée.
 */
export async function migrate(database: Database): Promise<string[]> {
  await database.execScript(`CREATE TABLE IF NOT EXISTS schema_migrations (
    name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())`);
  const done = new Map(
    (await rows<{ name: string; checksum: string }>(database.db, sql`SELECT name, checksum FROM schema_migrations`)).map((r) => [r.name, r.checksum]),
  );
  const files = readdirSync(MIGRATIONS_DIR).filter((f) => /^\d{4}_.+\.sql$/.test(f)).sort();
  const applied: string[] = [];
  for (const file of files) {
    const text = readFileSync(join(MIGRATIONS_DIR, file), 'utf8');
    const checksum = createHash('sha256').update(text).digest('hex');
    const prev = done.get(file);
    if (prev) {
      if (prev !== checksum) throw new Error(`Migration ${file} modifiée après application (checksum différent).`);
      continue;
    }
    const escaped = checksum.replace(/'/g, "''");
    await database.execScript(`BEGIN;\n${text}\nINSERT INTO schema_migrations (name, checksum) VALUES ('${file.replace(/'/g, "''")}', '${escaped}');\nCOMMIT;`);
    applied.push(file);
  }
  return applied;
}
