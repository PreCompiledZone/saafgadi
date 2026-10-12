import path from 'node:path';
import mysql from 'mysql2/promise';
import supertest from 'supertest';
import { vi } from 'vitest';

process.env.ENV_FILE ??= path.resolve(__dirname, '../.env.test');

const { loadConfig } = await import('../server/config');

/** True when the test database server is reachable; API tests skip otherwise. */
export async function dbAvailable(): Promise<boolean> {
  try {
    const c = loadConfig().db;
    const conn = await mysql.createConnection({
      host: c.host,
      port: c.port,
      user: c.user,
      password: c.password,
      connectTimeout: 3000,
    });
    await conn.end();
    return true;
  } catch {
    return false;
  }
}

/** Drops and recreates the test database, then migrates and seeds it like a real start. */
export async function freshApp() {
  const config = loadConfig();
  if (config.env !== 'test' || !config.db.name.includes('test')) {
    throw new Error('Refusing to reset a database that is not a test database');
  }
  const c = config.db;
  const conn = await mysql.createConnection({
    host: c.host,
    port: c.port,
    user: c.user,
    password: c.password,
  });
  await conn.query(`DROP DATABASE IF EXISTS \`${c.name}\``);
  await conn.query(
    `CREATE DATABASE \`${c.name}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
  );
  await conn.end();

  const db = await import('../server/db');
  await db.closeDb();
  const { runMigrations } = await import('../server/db/migrate');
  const { seed } = await import('../server/db/seed');
  const { createApp } = await import('../server/app');
  await runMigrations();
  await seed();
  return { app: createApp(), close: db.closeDb };
}

/** An agent that keeps cookies, i.e. one logged-in browser. */
export function agent(app: Parameters<typeof supertest.agent>[0]) {
  return supertest.agent(app);
}

/** Fakes only Date, so DB drivers and timers keep working. */
export function setNow(iso: string) {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(iso));
}

/** 08:30 IST on the given business date. */
export const morningIst = (date: string) => `${date}T03:00:00Z`;
