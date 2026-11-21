import { PGlite } from '@electric-sql/pglite';
import { type SQL } from 'drizzle-orm';
import { drizzle as drizzlePg } from 'drizzle-orm/node-postgres';
import type { PgDatabase, PgQueryResultHKT, PgTransaction } from 'drizzle-orm/pg-core';
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite';
import pg from 'pg';
import * as schema from './schema.js';

export type Schema = typeof schema;
export type Db = PgDatabase<PgQueryResultHKT, Schema>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Tx = PgTransaction<PgQueryResultHKT, Schema, any>;
export type DbOrTx = Db | Tx;

export interface Database {
  readonly db: Db;
  readonly driver: 'pglite' | 'node-postgres';
  /** Exécute un script SQL multi-instructions (migrations). */
  execScript(sqlText: string): Promise<void>;
  close(): Promise<void>;
}

export interface DatabaseOptions {
  databaseUrl?: string | undefined;
  pgliteDir?: string;
  /** Schéma Postgres dédié (tests contre un vrai Postgres). */
  searchPath?: string;
  poolMax?: number;
}

/**
 * PGlite (Postgres embarqué, WASM) par défaut ; node-postgres si DATABASE_URL est défini.
 * Note : PGlite sérialise toutes les requêtes sur une seule connexion — ne jamais utiliser `db`
 * à l'intérieur d'un callback de transaction (utiliser `tx`), sinon interblocage.
 */
export async function createDatabase(opts: DatabaseOptions): Promise<Database> {
  if (opts.databaseUrl) {
    const pool = new pg.Pool({
      connectionString: opts.databaseUrl,
      max: opts.poolMax ?? 10,
      ...(opts.searchPath ? { options: `-c search_path=${opts.searchPath}` } : {}),
    });
    // Les entiers 64 bits (COUNT, SUM) sont renvoyés en chaîne par défaut : on les caste en SQL.
    const db = drizzlePg(pool, { schema }) as unknown as Db;
    return {
      db,
      driver: 'node-postgres',
      execScript: async (sqlText) => {
        const c = await pool.connect();
        try {
          await c.query(sqlText);
        } catch (e) {
          await c.query('ROLLBACK').catch(() => undefined);
          throw e;
        } finally {
          c.release();
        }
      },
      close: () => pool.end(),
    };
  }
  const dir = opts.pgliteDir ?? 'memory://';
  const client = dir === 'memory://' ? new PGlite() : new PGlite(dir);
  await client.waitReady;
  const db = drizzlePglite(client, { schema }) as unknown as Db;
  return {
    db,
    driver: 'pglite',
    execScript: async (sqlText) => {
      try {
        await client.exec(sqlText);
      } catch (e) {
        await client.exec('ROLLBACK').catch(() => undefined);
        throw e;
      }
    },
    close: () => client.close(),
  };
}

/** Exécute une requête SQL brute et renvoie ses lignes (colonnes snake_case, castées en SQL). */
export async function rows<T = Record<string, unknown>>(dbx: DbOrTx, query: SQL): Promise<T[]> {
  const res = (await dbx.execute(query)) as unknown as { rows: T[] };
  return res.rows;
}

export async function one<T = Record<string, unknown>>(dbx: DbOrTx, query: SQL): Promise<T | undefined> {
  return (await rows<T>(dbx, query))[0];
}
