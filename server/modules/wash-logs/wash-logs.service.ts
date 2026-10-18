import { and, asc, count, desc, eq, gte, inArray, lte, type SQL } from 'drizzle-orm';
import { alias } from 'drizzle-orm/mysql-core';
import type { z } from 'zod';
import { vehicleTypeOf } from '../../../shared/enums';
import { formatRegistration } from '../../../shared/registration';
import type {
  adminWashLogQuery,
  washerLogCreateSchema,
  washLogUpdateSchema,
} from '../../../shared/schemas';
import type {
  HistoryEntry,
  MissedActivity,
  Paged,
  WasherBookingItem,
  WasherToday,
  WasherTodayActivity,
  WasherTodayItem,
  WashLogDto,
} from '../../../shared/types';
import { getDb, type DbOrTx } from '../../db';
import { planActivities, subscriptions, users, vehicles, washLogs } from '../../db/schema';
import { audit } from '../../lib/audit';
import { now, today } from '../../lib/clock';
import { addDays, calendarMonth, minDate } from '../../lib/dates';
import { AppError, conflict, forbidden, isDuplicateKey, notFound } from '../../lib/errors';
import {
  activityStatus,
  canRecordLog,
  missedDates,
  type ActivityRule,
  type LogLite,
} from '../../lib/schedule';
import { vehicleLabel } from '../subscriptions/subscription.repo';

/** Long enough to cover the current subscription month for any date. */
const LOOKBACK_DAYS = 62;
export const WASHER_HISTORY_DAYS = 14;

const washer = alias(users, 'washer');
const editor = alias(users, 'editor');
const owner = alias(users, 'owner');

// ---------------------------------------------------------------- log DTOs

function logQuery(db: DbOrTx) {
  return db
    .select({
      l: washLogs,
      reg: vehicles.registrationNumber,
      activityName: planActivities.name,
      washerName: washer.name,
      editedByName: editor.name,
    })
    .from(washLogs)
    .innerJoin(vehicles, eq(vehicles.id, washLogs.vehicleId))
    .innerJoin(planActivities, eq(planActivities.id, washLogs.planActivityId))
    .innerJoin(washer, eq(washer.id, washLogs.washerId))
    .leftJoin(editor, eq(editor.id, washLogs.editedBy))
    .$dynamic();
}

type LogRow = Awaited<ReturnType<ReturnType<typeof logQuery>['execute']>>[number];

function toLogDto(r: LogRow): WashLogDto {
  return {
    id: r.l.id,
    subscriptionId: r.l.subscriptionId,
    vehicleId: r.l.vehicleId,
    registrationNumber: formatRegistration(r.reg),
    planActivityId: r.l.planActivityId,
    activityName: r.activityName,
    washerId: r.l.washerId,
    washerName: r.washerName,
    serviceDate: r.l.serviceDate,
    performedAt: r.l.performedAt.toISOString(),
    status: r.l.status,
    reason: r.l.reason,
    notes: r.l.notes,
    isCatchUp: r.l.isCatchUp,
    editedAt: r.l.editedAt ? r.l.editedAt.toISOString() : null,
    editedByName: r.editedByName,
  };
}

export async function findLogs(
  db: DbOrTx,
  where: SQL | undefined,
  opts: { limit?: number; offset?: number } = {},
): Promise<WashLogDto[]> {
  let q = logQuery(db)
    .where(where)
    .orderBy(desc(washLogs.serviceDate), desc(washLogs.performedAt), desc(washLogs.id));
  if (opts.limit) q = q.limit(opts.limit);
  if (opts.offset) q = q.offset(opts.offset);
  return (await q).map(toLogDto);
}

async function findLog(db: DbOrTx, id: number): Promise<WashLogDto> {
  const [log] = await findLogs(db, eq(washLogs.id, id), { limit: 1 });
  if (!log) throw notFound('Wash log');
  return log;
}

// ---------------------------------------------------- schedule context

interface SubContext {
  sub: typeof subscriptions.$inferSelect;
  vehicle: typeof vehicles.$inferSelect;
  owner: typeof users.$inferSelect;
  washerName: string | null;
  activities: ActivityRule[];
  logs: (LogLite & { id: number })[];
}

/** Subscriptions matching `where`, with their plan's activities and recent logs. */
async function loadContexts(db: DbOrTx, where: SQL, logsFrom: string, logsTo: string) {
  const rows = await db
    .select({ sub: subscriptions, vehicle: vehicles, owner, washerName: washer.name })
    .from(subscriptions)
    .innerJoin(vehicles, eq(vehicles.id, subscriptions.vehicleId))
    .innerJoin(owner, eq(owner.id, subscriptions.userId))
    .leftJoin(washer, eq(washer.id, subscriptions.assignedWasherId))
    .where(where);
  if (!rows.length) return [];

  const planIds = [...new Set(rows.map((r) => r.sub.planId))];
  const subIds = rows.map((r) => r.sub.id);
  const [acts, logs] = await Promise.all([
    db
      .select()
      .from(planActivities)
      .where(inArray(planActivities.planId, planIds))
      .orderBy(asc(planActivities.sortOrder), asc(planActivities.id)),
    db
      .select({
        id: washLogs.id,
        subscriptionId: washLogs.subscriptionId,
        planActivityId: washLogs.planActivityId,
        serviceDate: washLogs.serviceDate,
        status: washLogs.status,
      })
      .from(washLogs)
      .where(
        and(
          inArray(washLogs.subscriptionId, subIds),
          gte(washLogs.serviceDate, logsFrom),
          lte(washLogs.serviceDate, logsTo),
        ),
      ),
  ]);
  return rows.map((r): SubContext => ({
    ...r,
    activities: acts.filter((a) => a.planId === r.sub.planId),
    logs: logs.filter((l) => l.subscriptionId === r.sub.id),
  }));
}

const coveringDate = (date: string) =>
  and(
    eq(subscriptions.status, 'ACTIVE'),
    lte(subscriptions.startDate, date),
    gte(subscriptions.endDate, date),
  )!;

// -------------------------------------------------------------- washer

/** Subscription washes due today, plus the washer's confirmed one-time jobs. */
export async function washerToday(
  washerId: number,
  washerName: string,
  oneTime: WasherBookingItem[] = [],
): Promise<WasherToday> {
  const db = getDb();
  const t = today();
  const contexts = await loadContexts(
    db,
    and(coveringDate(t), eq(subscriptions.assignedWasherId, washerId))!,
    addDays(t, -LOOKBACK_DAYS),
    t,
  );
  const todayLogIds = contexts.flatMap((c) =>
    c.logs.filter((l) => l.serviceDate === t).map((l) => l.id),
  );
  const todayLogs = todayLogIds.length ? await findLogs(db, inArray(washLogs.id, todayLogIds)) : [];

  const counts = { toDo: 0, done: 0, notDone: 0 };
  const items: WasherTodayItem[] = [];
  for (const c of contexts) {
    const earlier = c.logs.filter((l) => l.serviceDate < t);
    const activities: WasherTodayActivity[] = [];
    for (const a of c.activities.filter((x) => x.isActive)) {
      const before = activityStatus({ sub: c.sub, activity: a, logs: earlier, today: t });
      const log =
        todayLogs.find((l) => l.subscriptionId === c.sub.id && l.planActivityId === a.id) ?? null;
      const open = before.state === 'DUE' || before.state === 'PENDING';
      if (!open && !log) continue;
      if (log?.status === 'DONE') counts.done++;
      else if (log?.status === 'NOT_DONE') counts.notDone++;
      else if (before.state === 'DUE') counts.toDo++;
      activities.push({
        activityId: a.id,
        name: a.name,
        quota: before.quota,
        used: before.used + (log?.status === 'DONE' ? 1 : 0),
        minGapDays: a.minGapDays,
        state: before.state,
        log,
        canLog: open && !log,
      });
    }
    if (!activities.length) continue;
    items.push({
      subscriptionId: c.sub.id,
      vehicleId: c.vehicle.id,
      registrationNumber: formatRegistration(c.vehicle.registrationNumber),
      vehicleLabel: vehicleLabel(c.vehicle),
      vehicleType: vehicleTypeOf(c.vehicle.category, c.vehicle.carType),
      color: c.vehicle.color,
      ownerName: c.owner.name,
      societyOrBuilding: c.owner.societyOrBuilding,
      flatOrHouseNo: c.owner.flatOrHouseNo,
      area: c.owner.area,
      parkingNotes: c.vehicle.parkingNotes,
      activities,
    });
  }

  for (const b of oneTime) {
    if (b.status === 'COMPLETED') counts.done++;
    else if (b.status === 'NOT_DONE') counts.notDone++;
    else counts.toDo++;
  }

  // Sorted by society/area so the washer can work through one building at a time.
  type Place = Pick<WasherTodayItem, 'area' | 'societyOrBuilding' | 'flatOrHouseNo'>;
  const key = (i: Place) =>
    [i.area ?? '', i.societyOrBuilding ?? '', i.flatOrHouseNo ?? ''].join('|').toLowerCase();
  const all = [
    ...items.map((item) => ({ item, booking: null })),
    ...oneTime.map((booking) => ({ item: null, booking })),
  ].sort((a, b) =>
    key((a.item ?? a.booking)!).localeCompare(key((b.item ?? b.booking)!), 'en', {
      numeric: true,
    }),
  );
  const groups: WasherToday['groups'] = [];
  for (const { item, booking } of all) {
    const place = (item ?? booking)!;
    const society = [place.societyOrBuilding, place.area].filter(Boolean).join(', ') || 'Other';
    let group = groups.find((g) => g.society === society);
    if (!group) {
      group = { society, items: [], bookings: [] };
      groups.push(group);
    }
    if (item) group.items.push(item);
    if (booking) group.bookings.push(booking);
  }
  return { today: t, washerName, counts, groups };
}

async function lockSubscription(db: DbOrTx, id: number) {
  const [s] = await db.select().from(subscriptions).where(eq(subscriptions.id, id)).for('update');
  if (!s) throw notFound('Subscription');
  return s;
}

async function activityFor(db: DbOrTx, planId: number, activityId: number): Promise<ActivityRule> {
  const [a] = await db.select().from(planActivities).where(eq(planActivities.id, activityId));
  if (!a || a.planId !== planId) throw notFound('Activity');
  return a;
}

async function logsForActivity(db: DbOrTx, subscriptionId: number, activityId: number) {
  return db
    .select({
      id: washLogs.id,
      planActivityId: washLogs.planActivityId,
      serviceDate: washLogs.serviceDate,
      status: washLogs.status,
    })
    .from(washLogs)
    .where(
      and(eq(washLogs.subscriptionId, subscriptionId), eq(washLogs.planActivityId, activityId)),
    );
}

function ruleError(code: string, message: string) {
  return new AppError(422, code, message);
}

/** Service date is always today and the time is the server's; no backdating. */
export async function washerCreateLog(
  washerId: number,
  input: z.output<typeof washerLogCreateSchema>,
): Promise<WashLogDto> {
  const db = getDb();
  const t = today();
  try {
    const id = await db.transaction(async (tx) => {
      const sub = await lockSubscription(tx, input.subscriptionId);
      if (sub.assignedWasherId !== washerId) throw forbidden('This vehicle is not assigned to you');
      const activity = await activityFor(tx, sub.planId, input.planActivityId);
      const logs = await logsForActivity(tx, sub.id, activity.id);
      if (logs.some((l) => l.serviceDate === t)) {
        throw conflict(
          'Already recorded today — change the existing entry instead',
          'ALREADY_LOGGED',
        );
      }
      const decision = canRecordLog(sub, activity, logs, t, input.status);
      if (!decision.ok) throw ruleError(decision.code, decision.message);
      const [row] = await tx
        .insert(washLogs)
        .values({
          subscriptionId: sub.id,
          vehicleId: sub.vehicleId,
          planActivityId: activity.id,
          washerId,
          serviceDate: t,
          performedAt: now(),
          status: input.status,
          reason: input.reason,
          notes: input.notes,
          isCatchUp: input.status === 'DONE' && decision.isCatchUp,
        })
        .$returningId();
      return row.id;
    });
    return findLog(db, id);
  } catch (err) {
    if (isDuplicateKey(err)) {
      throw conflict(
        'Already recorded today — change the existing entry instead',
        'ALREADY_LOGGED',
      );
    }
    throw err;
  }
}

/** Washers may change their own entry until the end of the same day. */
export async function washerUpdateLog(
  washerId: number,
  logId: number,
  input: z.output<typeof washLogUpdateSchema>,
): Promise<WashLogDto> {
  const db = getDb();
  const t = today();
  await db.transaction(async (tx) => {
    const [log] = await tx.select().from(washLogs).where(eq(washLogs.id, logId)).for('update');
    if (!log || log.washerId !== washerId) throw notFound('Wash log');
    if (log.serviceDate !== t) {
      throw forbidden('Entries can only be changed on the same day. Ask an admin to correct it.');
    }
    const sub = await lockSubscription(tx, log.subscriptionId);
    if (sub.assignedWasherId !== washerId)
      throw forbidden('This vehicle is no longer assigned to you');
    const activity = await activityFor(tx, sub.planId, log.planActivityId);
    const others = (await logsForActivity(tx, sub.id, activity.id)).filter((l) => l.id !== log.id);
    const decision = canRecordLog(sub, activity, others, t, input.status);
    if (!decision.ok) throw ruleError(decision.code, decision.message);
    await tx
      .update(washLogs)
      .set({
        status: input.status,
        reason: input.reason,
        notes: input.notes,
        performedAt: now(),
        isCatchUp: input.status === 'DONE' && decision.isCatchUp,
      })
      .where(eq(washLogs.id, log.id));
  });
  return findLog(db, logId);
}

export async function washerHistory(washerId: number): Promise<WashLogDto[]> {
  const t = today();
  return findLogs(
    getDb(),
    and(
      eq(washLogs.washerId, washerId),
      gte(washLogs.serviceDate, addDays(t, -(WASHER_HISTORY_DAYS - 1))),
      lte(washLogs.serviceDate, t),
    ),
  );
}

// --------------------------------------------------------------- admin

/** Activities expected on `date` with no entry (for today: not logged yet). */
export async function missedOn(
  date: string,
  filter: { washerId?: number; vehicleId?: number; societyId?: number } = {},
): Promise<MissedActivity[]> {
  if (date > today()) return [];
  const contexts = await loadContexts(
    getDb(),
    and(
      coveringDate(date),
      filter.washerId ? eq(subscriptions.assignedWasherId, filter.washerId) : undefined,
      filter.vehicleId ? eq(subscriptions.vehicleId, filter.vehicleId) : undefined,
      filter.societyId ? eq(owner.societyId, filter.societyId) : undefined,
    )!,
    addDays(date, -LOOKBACK_DAYS),
    date,
  );
  const out: MissedActivity[] = [];
  for (const c of contexts) {
    // missedDates restarts every subscription month, so the loaded logs
    // (which cover the month containing `date`) are all it needs.
    for (const a of c.activities) {
      if (!missedDates(c.sub, a, c.logs, date).includes(date)) continue;
      out.push({
        date,
        subscriptionId: c.sub.id,
        vehicleId: c.vehicle.id,
        registrationNumber: formatRegistration(c.vehicle.registrationNumber),
        activityId: a.id,
        activityName: a.name,
        washerId: c.sub.assignedWasherId,
        washerName: c.washerName,
        ownerName: c.owner.name,
      });
    }
  }
  return out;
}

export async function adminListLogs(
  q: z.output<typeof adminWashLogQuery>,
): Promise<{ logs: Paged<WashLogDto>; missed: MissedActivity[] }> {
  const db = getDb();
  const where = and(
    q.date ? eq(washLogs.serviceDate, q.date) : undefined,
    q.washerId ? eq(washLogs.washerId, q.washerId) : undefined,
    q.vehicleId ? eq(washLogs.vehicleId, q.vehicleId) : undefined,
    q.societyId
      ? inArray(
          washLogs.vehicleId,
          db
            .select({ id: vehicles.id })
            .from(vehicles)
            .innerJoin(users, eq(users.id, vehicles.userId))
            .where(eq(users.societyId, q.societyId)),
        )
      : undefined,
  );
  const [{ total }] = await db.select({ total: count() }).from(washLogs).where(where);
  const items = await findLogs(db, where, {
    limit: q.pageSize,
    offset: (q.page - 1) * q.pageSize,
  });
  const missed = q.date
    ? await missedOn(q.date, {
        washerId: q.washerId,
        vehicleId: q.vehicleId,
        societyId: q.societyId,
      })
    : [];
  return { logs: { items, total, page: q.page, pageSize: q.pageSize }, missed };
}

/** Admin correction of any entry; quota rules still apply. Audit logged. */
export async function adminUpdateLog(
  actorId: number,
  logId: number,
  input: z.output<typeof washLogUpdateSchema>,
): Promise<WashLogDto> {
  const db = getDb();
  await db.transaction(async (tx) => {
    const [log] = await tx.select().from(washLogs).where(eq(washLogs.id, logId)).for('update');
    if (!log) throw notFound('Wash log');
    const sub = await lockSubscription(tx, log.subscriptionId);
    const activity = await activityFor(tx, sub.planId, log.planActivityId);
    const others = (await logsForActivity(tx, sub.id, activity.id)).filter((l) => l.id !== log.id);
    // Corrections are allowed on cancelled plans too, within their dates.
    const decision = canRecordLog(
      { ...sub, status: 'ACTIVE' },
      activity,
      others,
      log.serviceDate,
      input.status,
    );
    if (!decision.ok) throw ruleError(decision.code, decision.message);
    await tx
      .update(washLogs)
      .set({
        status: input.status,
        reason: input.reason,
        notes: input.notes,
        isCatchUp: input.status === 'DONE' && decision.isCatchUp,
        editedBy: actorId,
        editedAt: now(),
      })
      .where(eq(washLogs.id, log.id));
    await audit(tx, actorId, 'WASH_LOG_EDITED', 'wash_log', log.id, {
      before: { status: log.status, reason: log.reason, notes: log.notes },
      after: input,
    });
  });
  return findLog(db, logId);
}

// ---------------------------------------------------------------- user

/** A vehicle's logs for one calendar month, plus days that were missed. */
export async function vehicleHistory(
  vehicleId: number,
  month: string,
): Promise<{ month: string; logs: WashLogDto[]; entries: HistoryEntry[] }> {
  const db = getDb();
  const { start, end } = calendarMonth(`${month}-01`);
  const logs = await findLogs(
    db,
    and(
      eq(washLogs.vehicleId, vehicleId),
      gte(washLogs.serviceDate, start),
      lte(washLogs.serviceDate, end),
    ),
  );
  const entries: HistoryEntry[] = logs.map((l) => ({
    date: l.serviceDate,
    activityId: l.planActivityId,
    activityName: l.activityName,
    kind: l.status,
    log: l,
  }));

  const yesterday = addDays(today(), -1);
  const upTo = minDate(end, yesterday);
  if (upTo >= start) {
    const contexts = await loadContexts(
      db,
      and(
        eq(subscriptions.vehicleId, vehicleId),
        eq(subscriptions.status, 'ACTIVE'),
        lte(subscriptions.startDate, upTo),
        gte(subscriptions.endDate, start),
      )!,
      addDays(start, -LOOKBACK_DAYS),
      upTo,
    );
    for (const c of contexts) {
      for (const a of c.activities) {
        for (const d of missedDates(c.sub, a, c.logs, upTo)) {
          if (d < start) continue;
          entries.push({
            date: d,
            activityId: a.id,
            activityName: a.name,
            kind: 'MISSED',
            log: null,
          });
        }
      }
    }
  }
  entries.sort((a, b) =>
    a.date === b.date
      ? (b.log?.performedAt ?? '').localeCompare(a.log?.performedAt ?? '')
      : b.date.localeCompare(a.date),
  );
  return { month, logs, entries };
}

// ------------------------------------------------------ daily summaries

export interface DueSummary {
  due: number;
  done: number;
  notDone: number;
  toDo: number;
  behind: number;
}

/** Today's due/done/not-done numbers: overall, per washer and per society. */
export async function todaySummary(): Promise<{
  total: DueSummary;
  byWasher: Map<number | null, DueSummary>;
  /** Keyed by society id; null = customers whose society isn't onboarded. */
  bySociety: Map<number | null, DueSummary>;
  assignedCount: Map<number | null, number>;
}> {
  const t = today();
  const contexts = await loadContexts(getDb(), coveringDate(t), addDays(t, -LOOKBACK_DAYS), t);
  const empty = (): DueSummary => ({ due: 0, done: 0, notDone: 0, toDo: 0, behind: 0 });
  const total = empty();
  const byWasher = new Map<number | null, DueSummary>();
  const bySociety = new Map<number | null, DueSummary>();
  const assignedCount = new Map<number | null, number>();
  for (const c of contexts) {
    const w = c.sub.assignedWasherId;
    assignedCount.set(w, (assignedCount.get(w) ?? 0) + 1);
    const s = byWasher.get(w) ?? empty();
    byWasher.set(w, s);
    const soc = bySociety.get(c.owner.societyId) ?? empty();
    bySociety.set(c.owner.societyId, soc);
    const earlier = c.logs.filter((l) => l.serviceDate < t);
    for (const a of c.activities.filter((x) => x.isActive)) {
      const before = activityStatus({ sub: c.sub, activity: a, logs: earlier, today: t });
      const afterNow = activityStatus({ sub: c.sub, activity: a, logs: c.logs, today: t });
      const log = c.logs.find((l) => l.planActivityId === a.id && l.serviceDate === t);
      const add = (k: keyof DueSummary) => {
        s[k]++;
        soc[k]++;
        total[k]++;
      };
      if (afterNow.behindSchedule) add('behind');
      if (before.state !== 'DUE' && !log) continue;
      add('due');
      if (log?.status === 'DONE') add('done');
      else if (log?.status === 'NOT_DONE') add('notDone');
      else add('toDo');
    }
  }
  return { total, byWasher, bySociety, assignedCount };
}

export { coveringDate };
