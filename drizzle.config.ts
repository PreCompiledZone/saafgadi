import { defineConfig } from 'drizzle-kit';

// Used only by `npm run db:generate`, which needs no database connection.
// Migrations are applied by the app on start or via `npm run db:migrate`.
export default defineConfig({
  dialect: 'mysql',
  schema: './server/db/schema.ts',
  out: './server/db/migrations',
});
