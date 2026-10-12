# Vehicle Wash Tracking App — Release 1 Plan

> **For Claude Code:** This is the build spec for release 1. Work through the phases in order. At the end of each phase, run the app and the tests, then stop and summarise what was built before moving on. Do not add features marked "Out of scope". Where something is unclear, use the "Assumptions" section; if still unclear, ask.

App name: **Chamak** (Hindi/Marathi for "shine"). Use it in the page title, header, landing page and the default WhatsApp message; the display name comes from `APP_NAME` in config, so it's never hard-coded in the UI.

---

## 1. Goal

A single web application (one repo, one deployment) for a vehicle washing business:

- **Admin** manages customers, vehicles, plans, pricing, offline payments, plan activation, washers and contact details.
- **Washer** sees vehicles assigned to them and records each day's wash activity.
- **User** (customer) signs up with personal and vehicle details, browses plans, contacts the business (WhatsApp / call) to get onboarded, and tracks their plan and wash history.

No online payments in release 1. Payments are collected offline and recorded by admin.

---

## 2. Hosting constraints (drive the tech choices)

- Deployed on **Hostinger Business web hosting** as a **Node.js Web App** (hPanel → Websites → Node.js / Web App). Deployed from GitHub or a zip upload. Hostinger runs `npm install`, the build script, then starts the entry file.
- Database: **MySQL** provided by Hostinger (created in hPanel → Databases).
- Node apps on Hostinger can run **on demand** (may sleep when idle) → **no in-process cron jobs**. Anything time-based (expiry, due dates) must be computed when data is read.
- **One process serves both** the API and the built frontend. No separate frontend hosting.
- Avoid dependencies with native binaries (they may fail to build on shared hosting): use `bcryptjs` not `bcrypt`, `mysql2` (pure JS).
- All configuration comes from a separate env/property file — **no secrets, hosts, or credentials in code**.

---

## 3. Tech stack

| Layer | Choice |
|---|---|
| Language | TypeScript everywhere |
| Backend | Node.js (LTS) + **Express** |
| DB access | **Drizzle ORM** + `mysql2` driver, migrations via `drizzle-kit` |
| Validation | **zod** (shared schemas between client and server) |
| Auth | JWT stored in **httpOnly cookie**, passwords hashed with `bcryptjs` |
| Frontend | **React + Vite**, React Router, TanStack Query, react-hook-form + zod |
| Styling | Tailwind CSS, **mobile-first** (washers and users will mostly be on phones) |
| Security | `helmet`, `express-rate-limit` on auth routes, `cookie-parser` |
| Dates | `date-fns` + `date-fns-tz` (all business dates in `APP_TIMEZONE`, default `Asia/Kolkata`) |
| Tests | Vitest (unit) + Supertest (API) |
| Lint/format | ESLint + Prettier |

---

## 4. Repository structure

Single `package.json` at the root (simplest for Hostinger's build).

```
chamak/
├── .env.example            # every config key, with comments; committed
├── .env                    # real values; NOT committed (in .gitignore)
├── package.json
├── tsconfig.json
├── drizzle.config.ts
├── README.md               # setup + Hostinger deployment steps
├── shared/                 # zod schemas, enums, types used by both sides
│   ├── enums.ts
│   └── schemas/
├── server/
│   ├── index.ts            # entry: load config, run migrations, seed, start Express
│   ├── config.ts           # reads + validates env (zod). Only place process.env is read
│   ├── db/
│   │   ├── schema.ts       # Drizzle tables
│   │   ├── migrations/     # generated SQL migrations (committed)
│   │   └── seed.ts         # first admin, two fixed plans, default settings
│   ├── middleware/         # auth, requireRole, error handler, validate
│   ├── modules/
│   │   ├── auth/
│   │   ├── users/
│   │   ├── vehicles/
│   │   ├── plans/
│   │   ├── subscriptions/
│   │   ├── payments/
│   │   ├── wash-logs/
│   │   ├── enquiries/
│   │   └── settings/
│   └── lib/                # dates, schedule calc, registration-number helpers
├── client/
│   ├── index.html
│   └── src/
│       ├── api/            # fetch wrapper + TanStack Query hooks
│       ├── components/
│       ├── layouts/        # PublicLayout, AdminLayout, WasherLayout, UserLayout
│       └── pages/
│           ├── public/
│           ├── admin/
│           ├── washer/
│           └── user/
└── tests/
```

**Build output:** `npm run build` → Vite builds client to `dist/client`, server compiles to `dist/server`. Express serves `dist/client` as static files and falls back to `index.html` for non-`/api` routes (SPA routing).

**Scripts (root `package.json`):**
- `dev` — run Vite dev server and Express (with watch) together; Vite proxies `/api` to Express.
- `build` — build client + server.
- `start` — `node dist/server/index.js` (this is the Hostinger entry file).
- `db:generate` — generate migration from schema changes.
- `db:migrate` — apply migrations manually.
- `test`, `lint`.

---

## 5. Configuration (property file)

- All config lives in **`.env`** at the project root. Path can be overridden with `ENV_FILE=/path/to/file`.
- Load order: real environment variables (e.g. set in hPanel) override values from the file.
- `server/config.ts` is the **only** place that reads `process.env`. It validates with zod and **refuses to start** with a clear message listing missing/invalid keys.
- `.env.example` is committed with every key and a one-line comment; `.env` is git-ignored.

```dotenv
# --- App ---
NODE_ENV=production
PORT=3000                       # Hostinger may provide PORT; always read it from env
APP_URL=https://yourdomain.com
APP_NAME=Chamak
APP_TIMEZONE=Asia/Kolkata

# --- Database (values from hPanel → Databases) ---
DB_HOST=
DB_PORT=3306
DB_NAME=
DB_USER=
DB_PASSWORD=
DB_CONNECTION_LIMIT=5

# --- Auth ---
JWT_SECRET=                     # long random string, min 32 chars
JWT_EXPIRES_IN=7d
COOKIE_SECURE=true              # false only for local http dev
BCRYPT_ROUNDS=10

# --- First admin (used only if no admin exists yet) ---
SEED_ADMIN_NAME=
SEED_ADMIN_MOBILE=
SEED_ADMIN_EMAIL=
SEED_ADMIN_PASSWORD=

# --- Migrations ---
RUN_MIGRATIONS_ON_START=true

# --- Logging ---
LOG_LEVEL=info
```

Business contact numbers (WhatsApp / call) are **not** env values — admin edits them in the app (stored in the `settings` table).

---

## 6. Roles and access

| Role | How created | Access |
|---|---|---|
| ADMIN | Seeded from env on first start; an admin can create one more admin (soft limit, 1–2 total) | Everything |
| WASHER | Created by admin, with a password set by admin | Own assigned vehicles + own wash logs |
| USER | Self sign-up on the portal (default role for every sign-up) | Own profile, vehicles, subscriptions, wash history, enquiries |

- Role is enforced on the server for every `/api` route (`requireRole` middleware). The client hides UI by role but is never trusted.
- Users can only ever see their own data; washers only data for vehicles currently assigned to them.
- Deactivated accounts (`is_active = false`) cannot log in.

---

## 7. Domain model (MySQL tables)

All tables have `id` (BIGINT auto-increment PK), `created_at`, `updated_at`. Timestamps stored in UTC; "business dates" (`DATE` columns) are in `APP_TIMEZONE`.

### users
`name`, `mobile` (unique, 10-digit Indian mobile), `email` (unique, nullable), `password_hash`, `role` (ADMIN | WASHER | USER), `is_active`, `address_line`, `society_or_building`, `flat_or_house_no`, `area`, `city`, `pincode`, `last_login_at`.

### vehicles
`user_id` → users, `category` (CAR | BIKE), `car_type` (SEDAN | HATCHBACK | SUV; required when CAR, null when BIKE), `registration_number` (unique, stored normalised: uppercase, no spaces/hyphens), `make`, `model`, `color`, `parking_notes` (e.g. "B-wing basement, slot 42"), `is_active`.

### plans
`name`, `vehicle_category` (CAR | BIKE), `description`, `is_active`, `sort_order`.

### plan_prices
`plan_id` → plans, `vehicle_type` (SEDAN | HATCHBACK | SUV | BIKE), `monthly_price` (DECIMAL(10,2), INR), `is_active`. Unique (`plan_id`, `vehicle_type`).

### plan_activities
`plan_id` → plans, `name`, `description`, `quota_per_month` (int — how many times this service is included per subscription month), `min_gap_days` (int, default 1 — suggested spacing between services; `2` = alternate day; used only to decide what shows as "due today"), `sort_order`, `is_active`.

### subscriptions
`user_id`, `vehicle_id`, `plan_id`, `vehicle_type` (snapshot), `monthly_price` (snapshot at activation), `months`, `total_amount`, `start_date`, `end_date`, `status` (PENDING | ACTIVE | CANCELLED), `assigned_washer_id` → users (nullable), `activated_by` → users, `activated_at`, `notes`.
- "Expired" is **computed** (`ACTIVE` and `end_date < today`), not stored — no cron needed.
- Rule: at most one ACTIVE, non-expired subscription per vehicle (checked in service layer inside a transaction).

### payments
`subscription_id` → subscriptions (nullable, for advance payments), `user_id`, `amount`, `mode` (CASH | UPI | BANK_TRANSFER | OTHER), `reference` (UPI ref / note), `paid_on` (DATE), `recorded_by` → users, `notes`.

### wash_logs
`subscription_id`, `vehicle_id`, `plan_activity_id`, `washer_id`, `service_date` (DATE in APP_TIMEZONE), `performed_at` (DATETIME, **server time at submit**), `status` (DONE | NOT_DONE), `reason` (required when NOT_DONE: VEHICLE_NOT_AVAILABLE | NO_ACCESS | WEATHER | OTHER), `notes`, `edited_by`, `edited_at`.
- Unique (`subscription_id`, `plan_activity_id`, `service_date`).

### enquiries
`user_id` (nullable for guests later), `vehicle_id` (nullable), `plan_id` (nullable), `type` (NEW_PLAN | CHANGE_PLAN | GENERAL), `message`, `status` (OPEN | CONTACTED | CLOSED), `admin_notes`, `handled_by`.

### settings
`key` (unique), `value`. Keys seeded: `whatsapp_number`, `call_number`, `business_name`, `business_address`, `support_hours`, `whatsapp_default_message`.

### audit_log (lightweight)
`actor_id`, `action` (e.g. SUBSCRIPTION_ACTIVATED, PAYMENT_RECORDED, PRICE_CHANGED, WASH_LOG_EDITED), `entity`, `entity_id`, `details` (JSON).

---

## 8. Seed data (runs on startup, idempotent)

1. **First admin** from `SEED_ADMIN_*` env keys — only if no ADMIN exists. Log a warning if keys are missing and no admin exists.
2. **Two fixed plans** — only if the `plans` table is empty:

**Car Care Plan** (vehicle_category CAR)
| Activity | Per month | Spacing (`min_gap_days`) |
|---|---|---|
| Exterior wash — high-pressure gun wash with foam | 15 | 2 (alternate day) |
| Interior wash with vacuum cleaning and dashboard polish | 1 | — (any day in the month) |

Prices: one row each for SEDAN, HATCHBACK, SUV (seed with `0.00`; admin sets real prices).

**Bike Care Plan** (vehicle_category BIKE)
| Activity | Per month | Spacing (`min_gap_days`) |
|---|---|---|
| Exterior wash | 15 *(assumption — see §16)* | 2 (alternate day) |

Price: one row for BIKE (seed `0.00`).

3. **Settings** with empty contact numbers and `business_name = APP_NAME`.

---

## 9. Business rules

### Registration number
- Normalise input: uppercase, strip spaces and hyphens (`mh 14 eh-1234` → `MH14EH1234`).
- Accept standard format `^[A-Z]{2}[0-9]{1,2}[A-Z]{0,3}[0-9]{4}$` and BH series `^[0-9]{2}BH[0-9]{4}[A-Z]{1,2}$`.
- Display formatted with spaces (`MH 14 EH 1234`). Must be unique across the system.

### Plan activation (admin only)
1. User signs up and adds a vehicle → no subscription yet.
2. User browses plans and contacts admin (WhatsApp / call / in-app enquiry).
3. Payment is collected offline.
4. Admin opens **Activate plan**: picks user → vehicle → plan (filtered by vehicle category) → months (1, 3, 6, 12) → start date (default today) → washer (optional) → payment details (amount, mode, reference, paid on).
5. On save (single DB transaction): create subscription with price snapshot, `end_date = start_date + months − 1 day`, status ACTIVE; create payment row; write audit log.
- Saving without a payment is allowed only with an explicit "Activate without payment" checkbox (records reason in notes) — the dashboard shows these as **unpaid**.
- Renewal = new subscription whose start date is the day after the current end date.
- Price changes never affect existing subscriptions (snapshot).

### Monthly quota model (what is "due" on a given day)
Plans are sold as a **number of services per month** (car: 15 exterior + 1 interior). Computed in `server/lib/schedule.ts` (pure functions, unit tested):
- **Subscription month** = start date to the day before the same date next month (e.g. 10 Oct → 9 Nov). A multi-month subscription has one quota per subscription month. A final partial month (if `end_date` cuts it short) gets a pro-rated quota, rounded up.
- **Used** = count of DONE logs for that activity in the current subscription month. **Remaining** = `quota_per_month − used`.
- **Due today** when remaining > 0 **and** the last DONE for that activity was at least `min_gap_days` ago (or there is none yet this month). For the exterior wash (`min_gap_days = 2`) this gives the alternate-day rhythm.
- **Pending (not due)**: remaining > 0 but the gap hasn't passed. Washer can still log it as a catch-up (e.g. after a missed day); it counts toward the quota.
- **Completed for the month**: remaining = 0. The server **rejects** further DONE logs for that activity this month.
- **Behind schedule** flag (for admin and user): remaining > days left in the month ÷ `min_gap_days`, i.e. the quota can no longer be met at normal spacing.
- Unused services **do not carry forward** to the next month.
- Nothing is due outside `start_date … end_date`, or if the subscription isn't ACTIVE.

### Washer logging
- Washer can log only for subscriptions where they are `assigned_washer_id` and that are active today.
- `service_date` is always **today in APP_TIMEZONE** and `performed_at` is **server now** — the client never sends dates. No backdating.
- One log per activity per subscription per day. Washer may change their own log (DONE ↔ NOT_DONE) until end of that same day; after that only admin can edit (audit logged).
- NOT_DONE requires a reason.
- Washer may log a pending (not-due) activity as a catch-up; it counts toward the monthly quota and shows as "catch-up" in history.
- Only DONE counts toward the quota; NOT_DONE is recorded for tracking but doesn't use up a service.

### Plan change / enquiry
- Users cannot change plans themselves. "Change plan" and "Book this plan" create an **enquiry** and offer WhatsApp/call buttons with a prefilled message (name, mobile, vehicle reg, plan wanted).
- Admin handles it: cancel current subscription (status CANCELLED, end date set) and activate the new one.

### Contact links
- WhatsApp: `https://wa.me/<number in international format, digits only>?text=<url-encoded message>`.
- Call: `tel:+91XXXXXXXXXX`.
- Numbers come from `settings`; buttons hidden if a number isn't set.

---

## 10. Screens

### Public
- **Home / landing** — what the service is, the two plans with prices per vehicle type, WhatsApp + call buttons, Sign up / Log in.
- **Plans** — plan cards listing activities and prices.
- **Sign up** — step 1: name, mobile, email (optional), password; step 2: address (society, flat, area, city, pincode); step 3: vehicle(s) (category, car type, reg number, make, model, colour, parking notes). Can add more vehicles later.
- **Log in** — mobile (or email) + password. "Forgot password? Contact us" → WhatsApp/call (no email reset in R1).

### User
- **Dashboard** — per vehicle: current plan, status (Active / Expiring in N days / Expired / No plan), validity dates, assigned washer name, this month's progress (e.g. "Exterior: 9 of 15 done · Interior: 0 of 1", with a progress bar and the month's reset date), last 5 activities.
- **Wash history** — calendar or list per vehicle; filter by month; shows DONE / NOT_DONE (+reason) / missed with timestamp.
- **My vehicles** — add / edit vehicle (reg number edit locked once a subscription exists; ask admin).
- **Plans** — browse; "Book / Enquire" → enquiry + WhatsApp/call.
- **My enquiries** — list with status.
- **Profile** — edit personal details, change password.

### Washer (phone-first, big tap targets)
- **Today** — list of assigned vehicles with something due or pending today: reg number (large), vehicle type, colour, owner name, society/flat, parking notes, and per activity a **Done** / **Not done** button. Shows current date; already-logged items show their status and time. Sorted by society/area.
- **History** — own logs for the last 14 days.
- **Profile** — change password.

### Admin
- **Dashboard** — today: due vs done vs not-done; active subscriptions; expiring in next 7 days; expired (not renewed); unpaid activations; open enquiries; payments this month (total).
- **Users** — search by name / mobile / reg number; view a user with vehicles, subscriptions, payments, enquiries; activate/deactivate; reset password.
- **Washers** — create (name, mobile, password), edit, deactivate, reset password; see assigned vehicles and today's completion.
- **Vehicles** — list/search; edit; assign/reassign washer (on the active subscription).
- **Plans & pricing** — edit plan name/description, activities (name, services per month, spacing in days), monthly price per vehicle type; activate/deactivate. (Schema supports more plans; R1 UI edits the two fixed plans.)
- **Subscriptions** — list with filters (active, expiring, expired, cancelled, unpaid); **Activate plan** flow; renew; cancel.
- **Payments** — record payment; list with filters (date range, mode, user); export CSV.
- **Wash logs** — filter by date, washer, vehicle; edit a log (audit logged); see missed due activities.
- **Enquiries** — list, update status, notes, quick WhatsApp/call to the user.
- **Settings** — WhatsApp number, call number, business name/address, support hours, default WhatsApp message.
- **Admins** — create a second admin (warn if 2 already exist).

---

## 11. API (REST, JSON, all under `/api`)

Errors use one shape: `{ "error": { "code": "VALIDATION_ERROR", "message": "...", "details": {...} } }`. Lists support `?page=&pageSize=&search=`.

**Auth** — `POST /auth/signup` (creates USER + optional vehicles), `POST /auth/login`, `POST /auth/logout`, `GET /auth/me`, `POST /auth/change-password`.

**Public** — `GET /public/plans` (active plans, activities, prices), `GET /public/contact`.

**User (`/me/...`)** — `GET/PUT /me/profile`, `GET/POST/PUT /me/vehicles`, `GET /me/subscriptions`, `GET /me/wash-logs?vehicleId=&month=`, `GET/POST /me/enquiries`, `GET /me/dashboard`.

**Washer (`/washer/...`)** — `GET /washer/today`, `POST /washer/logs` (body: subscriptionId, planActivityId, status, reason?, notes?), `PUT /washer/logs/:id` (same day only), `GET /washer/history`.

**Admin (`/admin/...`)** — `GET /admin/dashboard`; CRUD `users`, `washers`, `admins`, `vehicles`; `POST /admin/users/:id/reset-password`; `GET/PUT plans`, `PUT plans/:id/activities`, `PUT plans/:id/prices`; `GET subscriptions`, `POST subscriptions/activate`, `POST subscriptions/:id/renew`, `POST subscriptions/:id/cancel`, `PUT subscriptions/:id/washer`; `GET/POST payments`, `GET payments/export.csv`; `GET wash-logs`, `PUT wash-logs/:id`; `GET/PUT enquiries`; `GET/PUT settings`.

---

## 12. Security checklist

- Passwords: `bcryptjs`, min 8 chars. Never return `password_hash`.
- JWT in httpOnly, `SameSite=Lax`, `Secure` (from `COOKIE_SECURE`) cookie; contains only user id + role; re-check `is_active` on each request (cheap query or short cache).
- Rate-limit `/api/auth/*`.
- `helmet` with a CSP that allows the app's own assets.
- Every input validated with zod; Drizzle parameterised queries only.
- Ownership checks in the service layer (user → own records; washer → assigned subscriptions).
- No secrets in code or logs; `.env` git-ignored.

---

## 13. Delivery phases

### Phase 0 — Scaffolding
Repo structure, TypeScript, ESLint/Prettier, Vite + Express wired together, `config.ts` with zod validation, `.env.example`, health route `GET /api/health` (checks DB), Express serving built client with SPA fallback.
**Done when:** `npm run dev` works locally; `npm run build && npm start` serves the app from one process; missing env keys produce a clear startup error.

### Phase 1 — Database, auth, seed
Drizzle schema for all tables, first migration, migrations run on start (when `RUN_MIGRATIONS_ON_START=true`), seed (admin, two plans, settings). Signup (multi-step incl. vehicle), login/logout, `me`, role middleware, layouts per role with route guards.
**Done when:** a fresh DB is fully created by starting the app; seeded admin can log in; a new sign-up becomes USER with a vehicle; wrong role gets 403.

### Phase 2 — Admin core
Plans & pricing editor, settings (contacts), users/washers/admins management, vehicles, activate-plan flow with payment, payments list + CSV, subscriptions list with computed status, enquiries.
**Done when:** admin can set prices, create a washer, activate a plan for a user's vehicle with a payment and washer, and see it on the dashboard.

### Phase 3 — Washer
`schedule.ts` due/pending logic with unit tests, washer Today screen, log submit/edit rules, history.
**Done when:** tests cover quota counting, the 15-wash cap, `min_gap_days` due logic, catch-up logs, month rollover (incl. 31-day months and February), pro-rated last month, out-of-range dates and the timezone boundary (e.g. 23:50 vs 00:10 IST); a washer sees only assigned vehicles with something due/pending and can mark them; duplicate, over-quota and backdated logs are rejected.

### Phase 4 — User
Dashboard, wash history, vehicles, plans browse + enquiry with WhatsApp/call prefilled links, profile.
**Done when:** a user sees plan status, month progress and the washer's logs with timestamps; enquiry appears for admin.

### Phase 5 — Admin dashboard, polish, deploy
Dashboard counters, wash-log admin editing with audit, mobile layout pass, empty/loading/error states, README with deployment steps.
**Done when:** full walkthrough below passes on a Hostinger deployment.

### End-to-end acceptance walkthrough
1. Start with empty DB → app creates tables and admin.
2. Admin sets prices and WhatsApp/call numbers.
3. Admin creates washer "Ravi".
4. Visitor signs up with a sedan `MH14EH1234`.
5. User clicks "Book" on Car Care Plan → enquiry created, WhatsApp opens with prefilled text.
6. Admin activates Car Care for 1 month, ₹ amount via UPI, assigns Ravi.
7. Ravi logs in on a phone → sees the car under Today → marks exterior DONE and interior wash DONE.
8. User dashboard shows plan active, "Exterior 1 of 15 · Interior 1 of 1", with today's time.
9. Next day the exterior wash shows as pending, not due (alternate day); interior is complete for the month and can't be logged again.
10. After 15 exterior washes in the month, a 16th is rejected; quotas reset on the next subscription month.
11. Admin sees today's numbers and the payment in the payments list/CSV.

---

## 14. Deployment on Hostinger (to go in README)

1. hPanel → Databases → create MySQL database + user; note host, name, user, password.
2. Push repo to GitHub (private is fine) — `.env` must **not** be committed.
3. hPanel → add a **Node.js Web App**, connect the GitHub repo/branch (or upload a zip).
4. Build settings: Node LTS version; build command `npm run build`; entry file `dist/server/index.js` (or start command `npm start`).
5. Provide config: either set the keys from `.env.example` in hPanel's **Environment Variables**, or upload a `.env` file to the app root via File Manager (editable later without touching code). Real env vars override the file.
6. Deploy. On first start the app runs migrations and seeds the admin.
7. After first login, change the admin password and remove `SEED_ADMIN_PASSWORD` from config.
8. Check `https://yourdomain/api/health`.

---

## 15. Out of scope for release 1

Online payment gateway · SMS / WhatsApp API notifications · email (verification, password reset) · photo proof of wash · washer route optimisation · invoices/GST · native mobile apps / PWA install · multi-branch or franchise support · customer ratings · automatic plan renewal.

(Good candidates for release 2: photo proof, WhatsApp notifications for expiry, PWA, invoices, carry-forward or admin adjustment of unused washes.)

---

## 16. Assumptions and open questions

Built with these defaults; each is easy to change later.

| # | Question | Default used |
|---|---|---|
| 1 | How many bike exterior washes per month? | **Confirmed:** 15, alternate-day spacing (editable by admin) |
| 2 | Billing period | Monthly price; admin activates for 1/3/6/12 months |
| 3 | Can a user have several vehicles? | Yes, each with its own subscription |
| 4 | Washer assignment | One washer per subscription, reassignable by admin |
| 5 | Sundays / holidays | No skip days in R1; washer marks NOT_DONE with reason if skipped |
| 6 | Login identifier | Mobile number (email optional) |
| 7 | Can a washer fix a wrong entry? | Same day only; later corrections by admin |
| 8 | Should price differ by car type? | Yes — separate price for sedan, hatchback, SUV |
| 9 | Missed wash | Quota stays available; washer can catch up any day; "behind schedule" flag if 15 can't be met at alternate-day spacing |
| 10 | Unused washes at month end | **Confirmed:** lapse — no carry-forward in R1. Keep quota logic in one function (`schedule.ts`) so a carry-forward/adjustment rule can be added later without schema rework |
