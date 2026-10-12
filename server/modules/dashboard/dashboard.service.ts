import { and, asc, count, desc, eq, gte, inArray, lte, sql, sum } from 'drizzle-orm';
import { qualified } from '../../lib/sql';
import type {
  AdminDashboard,
  SocietyToday,
  UserDashboard,
  UserVehicleSummary,
  WasherContact,
  WasherDto,
} from '../../../shared/types';
import { getDb } from '../../db';
import {
  payments,
  planActivities,
  societies,
  subscriptions,
  users,
  washLogs,
} from '../../db/schema';
import { today } from '../../lib/clock';
import { addDays, calendarMonth } from '../../lib/dates';
import { toNumber } from '../../lib/money';
import { activityStatus } from '../../lib/schedule';
import { EXPIRING_WITHIN_DAYS } from '../../lib/subscription-status';
import { countOpenEnquiries, listEnquiries } from '../enquiries/enquiries.service';
import { findSubscriptions } from '../subscriptions/subscription.repo';
import { unpaidSql } from '../subscriptions/subscriptions.service';
import { toUserDto } from '../users/users.repo';
import { getSettings } from '../settings/settings.service';
import { listUserVehicles } from '../vehicles/vehicles.service';
import { coveringDate, findLogs, todaySummary } from '../wash-logs/wash-logs.service';

export async function adminDashboard(): Promise<AdminDashboard> {
  const db = getDb();
  const t = today();
  const month = calendarMonth(t);
  const active = eq(subscriptions.status, 'ACTIVE');

  const [summary, activeRows, expiring, [expired], [unpaid], openCount, open, [paid], washers] =
    await Promise.all([
      todaySummary(),
      findSubscriptions(db, t, coveringDate(t)),
      findSubscriptions(
        db,
        t,
        and(coveringDate(t), lte(subscriptions.endDate, addDays(t, EXPIRING_WITHIN_DAYS - 1))),
        { orderBy: [asc(subscriptions.endDate)] },
      ),
      // Expired and not renewed: no later active subscription for the vehicle.
      db
        .select({ n: count() })
        .from(subscriptions)
        .where(
          and(
            active,
            sql`${subscriptions.endDate} < ${t}`,
            sql`${subscriptions.endDate} >= ${addDays(t, -60)}`,
            sql`not exists (select 1 from ${subscriptions} s2 where s2.vehicle_id = ${qualified(subscriptions.vehicleId)} and s2.status = 'ACTIVE' and s2.end_date >= ${t})`,
          ),
        ),
      db
        .select({ n: count() })
        .from(subscriptions)
        .where(and(active, gte(subscriptions.endDate, t), unpaidSql())),
      countOpenEnquiries(),
      listEnquiries({ page: 1, pageSize: 5, status: 'OPEN' }),
      db
        .select({ total: sum(payments.amount), n: count() })
        .from(payments)
        .where(and(gte(payments.paidOn, month.start), lte(payments.paidOn, month.end))),
      db
        .select({ id: users.id, name: users.name })
        .from(users)
        .where(and(eq(users.role, 'WASHER'), eq(users.isActive, true)))
        .orderBy(asc(users.name)),
    ]);

  return {
    today: t,
    washes: {
      due: summary.total.due,
      done: summary.total.done,
      notDone: summary.total.notDone,
      toDo: summary.total.toDo,
    },
    active: {
      total: activeRows.length,
      cars: activeRows.filter((s) => s.vehicleType !== 'BIKE').length,
      bikes: activeRows.filter((s) => s.vehicleType === 'BIKE').length,
    },
    expiringSoon: { count: expiring.length, items: expiring.slice(0, 8) },
    expired: { count: expired.n },
    unpaid: { count: unpaid.n },
    openEnquiries: { count: openCount, items: open.items },
    paymentsThisMonth: { total: toNumber(paid.total), count: paid.n },
    washers: washers.map((w) => {
      const s = summary.byWasher.get(w.id);
      return {
        id: w.id,
        name: w.name,
        due: s?.due ?? 0,
        done: s?.done ?? 0,
        behind: s?.behind ?? 0,
      };
    }),
    societies: await societiesToday(summary.bySociety),
  };
}

/** Today's numbers per society, busiest first; not-onboarded customers grouped last. */
async function societiesToday(
  bySociety: Awaited<ReturnType<typeof todaySummary>>['bySociety'],
): Promise<SocietyToday[]> {
  const ids = [...bySociety.keys()].filter((k): k is number => k !== null);
  const names = ids.length
    ? await getDb()
        .select({ id: societies.id, name: societies.name })
        .from(societies)
        .where(inArray(societies.id, ids))
    : [];
  return [...bySociety.entries()]
    .filter(([, s]) => s.due > 0 || s.behind > 0)
    .map(([id, s]) => ({
      societyId: id,
      name: id === null ? 'Not onboarded' : (names.find((n) => n.id === id)?.name ?? 'Society'),
      due: s.due,
      done: s.done,
      notDone: s.notDone,
      behind: s.behind,
    }))
    .sort((a, b) => (a.societyId === null ? 1 : b.societyId === null ? -1 : b.due - a.due));
}

export async function listWashers(): Promise<WasherDto[]> {
  const db = getDb();
  const [rows, summary] = await Promise.all([
    db
      .select()
      .from(users)
      .where(eq(users.role, 'WASHER'))
      .orderBy(desc(users.isActive), asc(users.name)),
    todaySummary(),
  ]);
  return rows.map((u) => {
    const s = summary.byWasher.get(u.id);
    return {
      ...toUserDto(u),
      assignedCount: summary.assignedCount.get(u.id) ?? 0,
      today: {
        due: s?.due ?? 0,
        done: s?.done ?? 0,
        notDone: s?.notDone ?? 0,
        behind: s?.behind ?? 0,
      },
    };
  });
}

/**
 * Contact for the washer assigned to a customer's current (or next) plan.
 * Only ever returned to that customer, and only while the washer is active.
 */
async function washerContact(
  sub: { assignedWasherId: number | null } | null,
): Promise<WasherContact | null> {
  if (!sub?.assignedWasherId) return null;
  const [w] = await getDb()
    .select({ name: users.name, mobile: users.mobile, role: users.role, isActive: users.isActive })
    .from(users)
    .where(eq(users.id, sub.assignedWasherId));
  return w && w.role === 'WASHER' && w.isActive ? { name: w.name, mobile: w.mobile } : null;
}

export async function userDashboard(userId: number, name: string): Promise<UserDashboard> {
  const db = getDb();
  const t = today();
  const vehicles = (await listUserVehicles(userId)).filter((v) => v.isActive);
  const subs = await findSubscriptions(db, t, eq(subscriptions.userId, userId));
  const out: UserVehicleSummary[] = [];
  const showWasher = (await getSettings()).show_washer_contact !== 'false';

  for (const v of vehicles) {
    const mine = subs.filter((s) => s.vehicleId === v.id && s.status !== 'PENDING');
    const live = mine.filter((s) => s.status === 'ACTIVE');
    const current = live.find((s) => s.startDate <= t && s.endDate >= t) ?? null;
    const upcoming =
      live
        .filter((s) => s.startDate > t)
        .sort((a, b) => a.startDate.localeCompare(b.startDate))[0] ?? null;
    // Most recent one that has ended (expired or cancelled), shown when nothing is current.
    const past = mine.find((s) => s.startDate <= t && s !== current) ?? null;
    const shown = current ?? past;

    let progress: UserVehicleSummary['progress'] = [];
    if (current) {
      const [acts, logs] = await Promise.all([
        db
          .select()
          .from(planActivities)
          .where(and(eq(planActivities.planId, current.planId), eq(planActivities.isActive, true)))
          .orderBy(asc(planActivities.sortOrder), asc(planActivities.id)),
        db
          .select({
            planActivityId: washLogs.planActivityId,
            serviceDate: washLogs.serviceDate,
            status: washLogs.status,
          })
          .from(washLogs)
          .where(
            and(
              eq(washLogs.subscriptionId, current.id),
              gte(washLogs.serviceDate, addDays(t, -62)),
            ),
          ),
      ]);
      progress = acts.map((a) => activityStatus({ sub: current, activity: a, logs, today: t }));
    }

    const recent = await findLogs(db, eq(washLogs.vehicleId, v.id), { limit: 5 });
    out.push({
      vehicle: v,
      displayStatus:
        current?.displayStatus ?? upcoming?.displayStatus ?? past?.displayStatus ?? 'NO_PLAN',
      subscription: shown,
      upcoming,
      progress,
      recent,
      washer: showWasher ? await washerContact(current ?? upcoming) : null,
    });
  }
  return { today: t, name, vehicles: out };
}
