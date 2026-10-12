import mysql from 'mysql2/promise';
import { drizzle, type MySql2Database } from 'drizzle-orm/mysql2';
import { getConfig } from '../config';
import * as schema from './schema';

export type Db = MySql2Database<typeof schema>;
/** A transaction handle; services accept either. */
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
export type DbOrTx = Db | Tx;

let pool: mysql.Pool | undefined;
let db: Db | undefined;

export function getPool(): mysql.Pool {
  if (!pool) {
    const { db: c } = getConfig();
    pool = mysql.createPool({
      host: c.host,
      port: c.port,
      database: c.name,
      user: c.user,
      password: c.password,
      connectionLimit: c.connectionLimit,
      waitForConnections: true,
      // Store and read all timestamps as UTC.
      timezone: 'Z',
      dateStrings: ['DATE'],
      enableKeepAlive: true,
    });
    pool.on('connection', (conn) => {
      conn.query("SET time_zone = '+00:00'");
    });
  }
  return pool;
}

export function getDb(): Db {
  if (!db) db = drizzle(getPool(), { schema, mode: 'default' });
  return db;
}

export async function closeDb(): Promise<void> {
  if (pool) {
    const p = pool;
    pool = undefined;
    db = undefined;
    await p.end();
  }
}

export async function pingDb(): Promise<void> {
  await getPool().query('SELECT 1');
}
