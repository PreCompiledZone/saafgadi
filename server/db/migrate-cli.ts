// `npm run db:migrate` — apply pending migrations and exit.
import { closeDb } from './index';
import { runMigrations } from './migrate';
import { loadConfig, ConfigError } from '../config';

try {
  loadConfig();
  await runMigrations();
  await closeDb();
} catch (err) {
  console.error(err instanceof ConfigError ? err.message : err);
  process.exit(1);
}
