# SaafGadi

Vehicle wash tracking for a doorstep wash business, in one Node.js app:

- **Admin**: customers, vehicles, plans and prices, offline payments, plan activation, washers, contact details.
- **Washer**: today's assigned vehicles, with a big Done / Not done button for each service.
- **Customer**: sign up with their vehicle, browse and book plans (WhatsApp / call / enquiry), and track each month's washes.

There are no online payments. Admins collect payment offline and record it in the app.

Stack: TypeScript, Express 5, Drizzle ORM + MySQL (`mysql2`), React 19 + Vite, TanStack Query, react-hook-form + zod, and Tailwind CSS 4. A single process serves both the API (`/api`) and the built client.

## Local development

Requirements: Node 20+ and a MySQL 8 or MariaDB 10.6+ database.

```bash
npm install
cp .env.example .env          # fill in DB_*, JWT_SECRET, SEED_ADMIN_*; set COOKIE_SECURE=false, NODE_ENV=development
npm run dev                   # Express on :3000 (watch) + Vite on :5173 (proxies /api)
```

Open http://localhost:5173. On first start the app creates the tables and seeds:

- the first admin, from `SEED_ADMIN_*`
- the Car Care and Bike Care plans, with prices at ₹0 (set the real prices in **Plans & pricing**)
- empty contact settings (set the WhatsApp and call numbers in **Settings**)

To get a throwaway database with Docker:

```bash
docker run -d --name saafgadi-mysql -p 3307:3306 \
  -e MYSQL_ROOT_PASSWORD=rootpw -e MYSQL_DATABASE=saafgadi -e MYSQL_USER=saafgadi -e MYSQL_PASSWORD=saafgadipw mysql:8.0
```

### Scripts

| Script                | What it does                                                                                     |
| --------------------- | ------------------------------------------------------------------------------------------------ |
| `npm run dev`         | API + client with hot reload                                                                     |
| `npm run build`       | Builds the client to `dist/client` and bundles the server to `dist/server` (migrations included) |
| `npm start`           | `node dist/server/index.js`, the production entry                                                |
| `npm test`            | Unit tests (quota/schedule rules) and API tests (needs the DB in `.env.test`)                    |
| `npm run lint`        | ESLint + Prettier check                                                                          |
| `npm run typecheck`   | `tsc --noEmit` over server, client and shared code                                               |
| `npm run db:generate` | Generates a new SQL migration after changing `server/db/schema.ts`                               |
| `npm run db:migrate`  | Applies pending migrations without starting the app                                              |

API tests use `.env.test`, which points at a separate `saafgadi_test` database that is **dropped and recreated** on every run. The tests refuse to run against a database whose name doesn't contain `test`. If that database server isn't reachable, the API tests are skipped.

## Configuration

All configuration lives in `.env`. Every key is listed and explained in `.env.example`.

- Real environment variables (for example, ones set in hPanel) override values from the file.
- To load a different file, set `ENV_FILE=/path/to/file`.
- `server/config.ts` is the only code that reads `process.env`. If a key is missing or invalid, the app refuses to start and lists exactly which keys need fixing.
- Business contact numbers aren't configured here: admins edit them in **Settings**.

## Deploying to Hostinger (Business web hosting, Node.js Web App)

1. **Database**: in hPanel → Databases, create a MySQL database and user. Note the host, database name, user and password.
2. **Code**: push this repo to GitHub (a private repo is fine). `.env` is git-ignored and must not be committed.
3. **App**: in hPanel → Websites → add a **Node.js Web App**, then connect the GitHub repo and branch (or upload a zip).
4. **Build settings**:
   - Node version: current LTS (20 or 22)
   - Build command: `npm run build`
   - Entry file: `dist/server/index.js` (or start command `npm start`)
5. **Configuration**: provide the keys from `.env.example` in one of two ways:
   - set them in hPanel's **Environment Variables**, or
   - upload a `.env` file to the app root with File Manager (you can edit it later without touching code).

   Use `NODE_ENV=production`, `COOKIE_SECURE=true`, a random `JWT_SECRET` of at least 32 characters (for example, `openssl rand -hex 32`), and the `DB_*` values from step 1. Hostinger sets `PORT` itself, so you don't need to.

6. **Deploy**. On first start the app runs migrations and creates the admin from `SEED_ADMIN_*`.
7. **Secure the admin**: log in as admin, open **Password** (bottom of the sidebar) and change the password. Then remove `SEED_ADMIN_PASSWORD` from the config.
8. **Check** `https://yourdomain/api/health`. It should return `{"status":"ok","db":"ok",…}`.

Notes for shared hosting:

- No native modules: the app uses `bcryptjs` and `mysql2`, which are pure JavaScript.
- Build tools (Vite, Tailwind, esbuild) are regular `dependencies`, so `npm run build` still works if the host skips devDependencies.
- The app may sleep when idle. Nothing depends on background jobs: "expired", "due today", "behind schedule" and similar states are all computed when data is read.
- Every business date uses `APP_TIMEZONE` (default `Asia/Kolkata`), whatever the server's own timezone.
- The app is tested against both MySQL 8.0 and MariaDB 10.11.

## How the wash rules work

All quota rules live in `server/lib/schedule.ts` as pure functions, covered by the tests in `tests/schedule.test.ts`.

- A **subscription month** runs from the start date to the day before the same date next month (10 Oct → 9 Nov). Each month has its own quota, and unused services don't carry forward.
- **Due today**: services remain this month, and the last DONE was at least `min_gap_days` ago (`2` gives the alternate-day rhythm).
- **Pending**: services remain, but the gap hasn't passed yet. A washer can still log it as a **catch-up**, which counts toward the quota.
- **Complete**: the quota is used up. The server rejects further entries for that month.
- **Behind schedule**: the remaining services no longer fit before the month ends at the normal spacing. A 28-day February can never fit 15 alternate-day washes, so it is flagged from day one.
- Washers can only log for today, using server time; the client never sends dates. A washer can change their own entry until midnight. After that, only an admin can correct it, and every correction is audit-logged.
- **Missed**: a rhythm service whose expected day passed with no entry. A monthly service like the interior clean only counts as missed if the month ends without it.

## Project layout

```
shared/     zod schemas, enums, DTO types and calendar maths used by both sides
server/     Express app: config, db (schema, migrations, seed), middleware, modules/*, lib/*
client/     React app: api/, components/, layouts/, pages/{public,user,washer,admin}
tests/      Vitest unit tests + Supertest API walkthrough
```
