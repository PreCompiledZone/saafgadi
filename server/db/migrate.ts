import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { migrate } from 'drizzle-orm/mysql2/migrator';
import { getDb } from './index';
import { logger } from '../lib/logger';

/** Migrations live next to the bundle in production, in the source tree in dev. */
function migrationsFolder(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.join(here, 'migrations'), // dist/server/migrations or server/db/migrations
    path.resolve(here, '../../server/db/migrations'),
    path.resolve(process.cwd(), 'server/db/migrations'),
  ];
  const found = candidates.find((p) => fs.existsSync(path.join(p, 'meta', '_journal.json')));
  if (!found) throw new Error(`Migrations folder not found (looked in ${candidates.join(', ')})`);
  return found;
}

export async function runMigrations(): Promise<void> {
  const folder = migrationsFolder();
  logger.info(`Applying database migrations from ${folder}`);
  await migrate(getDb(), { migrationsFolder: folder });
  logger.info('Database migrations up to date');
}
