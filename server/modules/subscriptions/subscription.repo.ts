import { and, desc, eq, sql, type SQL } from 'drizzle-orm';
import { qualified } from '../../lib/sql';
import { alias } from 'drizzle-orm/mysql-core';
import { LABELS } from '../../../shared/enums';
import { formatRegistration } from '../../../shared/registration';
import type { SubscriptionDto } from '../../../shared/types';
import type { DbOrTx } from '../../db';
import { payments, plans, subscriptions, users, vehicles } from '../../db/schema';
import { toNumber } from '../../lib/money';
import { displayStatus } from '../../lib/subscription-status';

const washer = alias(users, 'washer');

export const paidAmountSql = sql<string>`(select coalesce(sum(${qualified(payments.amount)}), 0) from ${payments} where ${qualified(payments.subscriptionId)} = ${qualified(subscriptions.id)})`;

export function vehicleLabel(v: {
  make: string;
  model: string;
  category: 'CAR' | 'BIKE';
  carType: 'HATCHBACK' | 'SEDAN' | 'SUV' | null;
}): string {
  const type = v.category === 'BIKE' ? 'Bike' : v.carType ? LABELS.carType[v.carType] : 'Car';
  return `${v.make} ${v.model} · ${type}`;
}

export function subscriptionSelect() {
  return {
    sub: subscriptions,
    userName: users.name,
    userMobile: users.mobile,
    reg: vehicles.registrationNumber,
    make: vehicles.make,
    model: vehicles.model,
    category: vehicles.category,
    carType: vehicles.carType,
    planName: plans.name,
    washerName: washer.name,
    paid: paidAmountSql,
  };
}

type Row = {
  sub: typeof subscriptions.$inferSelect;
  userName: string;
  userMobile: string;
  reg: string;
  make: string;
  model: string;
  category: 'CAR' | 'BIKE';
  carType: 'HATCHBACK' | 'SEDAN' | 'SUV' | null;
  planName: string;
  washerName: string | null;
  paid: string;
};

export function toSubscriptionDto(r: Row, today: string): SubscriptionDto {
  const s = r.sub;
  const paidAmount = toNumber(r.paid);
  return {
    id: s.id,
    userId: s.userId,
    userName: r.userName,
    userMobile: r.userMobile,
    vehicleId: s.vehicleId,
    registrationNumber: formatRegistration(r.reg),
    vehicleLabel: vehicleLabel(r),
    planId: s.planId,
    planName: r.planName,
    vehicleType: s.vehicleType,
    monthlyPrice: toNumber(s.monthlyPrice),
    months: s.months,
    totalAmount: toNumber(s.totalAmount),
    startDate: s.startDate,
    endDate: s.endDate,
    status: s.status,
    ...displayStatus(s, today),
    assignedWasherId: s.assignedWasherId,
    assignedWasherName: r.washerName,
    paidAmount,
    isUnpaid: s.status !== 'CANCELLED' && paidAmount <= 0,
    notes: s.notes,
    activatedAt: s.activatedAt ? s.activatedAt.toISOString() : null,
    createdAt: s.createdAt.toISOString(),
  };
}

export function subscriptionQuery(db: DbOrTx) {
  return db
    .select(subscriptionSelect())
    .from(subscriptions)
    .innerJoin(users, eq(users.id, subscriptions.userId))
    .innerJoin(vehicles, eq(vehicles.id, subscriptions.vehicleId))
    .innerJoin(plans, eq(plans.id, subscriptions.planId))
    .leftJoin(washer, eq(washer.id, subscriptions.assignedWasherId))
    .$dynamic();
}

export async function findSubscriptions(
  db: DbOrTx,
  today: string,
  where?: SQL,
  opts: { limit?: number; offset?: number; orderBy?: SQL[] } = {},
): Promise<SubscriptionDto[]> {
  let q = subscriptionQuery(db);
  if (where) q = q.where(where);
  q = q.orderBy(...(opts.orderBy ?? [desc(subscriptions.startDate), desc(subscriptions.id)]));
  if (opts.limit) q = q.limit(opts.limit);
  if (opts.offset) q = q.offset(opts.offset);
  const rows = (await q) as Row[];
  return rows.map((r) => toSubscriptionDto(r, today));
}

export async function findSubscription(
  db: DbOrTx,
  id: number,
  today: string,
): Promise<SubscriptionDto | null> {
  const [s] = await findSubscriptions(db, today, eq(subscriptions.id, id), { limit: 1 });
  return s ?? null;
}

/** Active subscriptions (not cancelled) whose dates cover `date`. */
export function coversDate(date: string): SQL {
  return and(
    eq(subscriptions.status, 'ACTIVE'),
    sql`${subscriptions.startDate} <= ${date}`,
    sql`${subscriptions.endDate} >= ${date}`,
  )!;
}
