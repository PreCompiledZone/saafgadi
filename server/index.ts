// Entry point: load config, run migrations, seed, start Express.
import { ConfigError, loadConfig } from './config';
import { logger } from './lib/logger';

async function main() {
  let config;
  try {
    config = loadConfig();
  } catch (err) {
    if (err instanceof ConfigError) {
      console.error(`\n${err.message}\n`);
      process.exit(1);
    }
    throw err;
  }

  // Imported after config is valid so nothing touches the DB with bad settings.
  const { closeDb, pingDb } = await import('./db');
  const { runMigrations } = await import('./db/migrate');
  const { seed } = await import('./db/seed');
  const { createApp } = await import('./app');

  try {
    await pingDb();
  } catch (err) {
    logger.error(
      `Cannot connect to MySQL at ${config.db.host}:${config.db.port} (database "${config.db.name}"). Check the DB_* settings.`,
      err,
    );
    process.exit(1);
  }
  if (config.runMigrationsOnStart) await runMigrations();
  await seed();

  const server = createApp().listen(config.port, () => {
    logger.info(`${config.appName} listening on port ${config.port} (${config.env})`);
  });

  const shutdown = (signal: string) => {
    logger.info(`${signal} received, shutting down`);
    server.close(() => {
      closeDb().finally(() => process.exit(0));
    });
    setTimeout(() => process.exit(0), 5000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
  logger.error('Failed to start', err);
  process.exit(1);
});
