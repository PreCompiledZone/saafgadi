import { and, eq, gte, lte, notExists, or, sql, type SQL } from 'drizzle-orm';
import type { z } from 'zod';
import { vehicleTypeOf, type VehicleType } from '../../../shared/enums';
import { expireStalePending } from './requests.service';
import { normaliseRegistration } from '../../../shared/registration';
import type { activateSubscriptionSchema, renewSubscriptionSchema } from '../../../shared/schemas';
import type { Paged, SubscriptionDto } from '../../../shared/types';
import { getDb, type Tx } from '../../db';
import { payments, planPrices, plans, subscriptions, users, vehicles } from '../../db/schema';
import { audit } from '../../lib/audit';
import { now, today } from '../../lib/clock';
import { addDays, maxDate } from '../../lib/dates';
import { badRequest, conflict, notFound, unprocessable } from '../../lib/errors';
import { toDecimal, toNumber } from '../../lib/money';
import { subscriptionEndDate } from '../../lib/schedule';
import { EXPIRING_WITHIN_DAYS } from '../../lib/subscription-status';
import { insertPayment } from '../payments/payments.service';
import { defaultWasherForUser } from '../societies/societies.service';
import { findSubscription, findSubscriptions } from './subscription.repo';

export const SUBSCRIPTION_FILTERS = [
  'all',
  'active',
  'upcoming',
  'expiring',
  'expired',
  'cancelled',
  'unpaid',
  'pending',
] as const;
export type SubscriptionFilter = (typeof SUBSCRIPTION_FILTERS)[number];

/** No payment recorded against the subscription. */
export const unpaidSql = () =>
  notExists(
    getDb()
      .select({ one: sql`1` })
      .from(payments)
      .where(eq(payments.subscriptionId, subscriptions.id)),
  );

function filterSql(filter: SubscriptionFilter, t: string): SQL | undefined {
  const active = eq(subscriptions.status, 'ACTIVE');
  switch (filter) {
    case 'active':
      return and(active, lte(subscriptions.startDate, t), gte(subscriptions.endDate, t));
    case 'upcoming':
      return and(active, sql`${subscriptions.startDate} > ${t}`);
    case 'expiring':
      return and(
        active,
        lte(subscriptions.startDate, t),
        gte(subscriptions.endDate, t),
        lte(subscriptions.endDate, addDays(t, EXPIRING_WITHIN_DAYS - 1)),
      );
    case 'expired':
      return and(active, sql`${subscriptions.endDate} < ${t}`);
    case 'cancelled':
      return eq(subscriptions.status, 'CANCELLED');
    case 'unpaid':
      return and(eq(subscriptions.status, 'ACTIVE'), unpaidSql());
    case 'pending':
      return eq(subscriptions.status, 'PENDING');
    default:
      return undefined;
  }
}

export async function listSubscriptions(q: {
  page: number;
  pageSize: number;
  search?: string;
  filter: SubscriptionFilter;
  userId?: number;
  vehicleId?: number;
  washerId?: number;
  societyId?: number;
  status?: 'PENDING' | 'ACTIVE' | 'CANCELLED';
  area?: string;
  planId?: number;
  vehicleType?: VehicleType;
  requestedFrom?: string;
  requestedTo?: string;
}): Promise<Paged<SubscriptionDto>> {
  const db = getDb();
  await expireStalePending(db);
  const t = today();
  const term = q.search?.trim();
  const where = and(
    filterSql(q.status === 'PENDING' ? 'pending' : q.filter, t),
    q.status && q.status !== 'PENDING' ? eq(subscriptions.status, q.status) : undefined,
    q.area ? sql`${users.area} like ${`%${q.area}%`}` : undefined,
    q.planId ? eq(subscriptions.planId, q.planId) : undefined,
    q.vehicleType ? eq(subscriptions.vehicleType, q.vehicleType) : undefined,
    q.requestedFrom ? sql`date(${subscriptions.createdAt}) >= ${q.requestedFrom}` : undefined,
    q.requestedTo ? sql`date(${subscriptions.createdAt}) <= ${q.requestedTo}` : undefined,
    q.userId ? eq(subscriptions.userId, q.userId) : undefined,
    q.vehicleId ? eq(subscriptions.vehicleId, q.vehicleId) : undefined,
    q.washerId ? eq(subscriptions.assignedWasherId, q.washerId) : undefined,
    q.societyId ? eq(users.societyId, q.societyId) : undefined,
    term
      ? or(
          sql`${users.name} like ${`%${term}%`}`,
          sql`${users.mobile} like ${`%${term}%`}`,
          sql`${vehicles.registrationNumber} like ${`%${normaliseRegistration(term)}%`}`,
        )
      : undefined,
  );
  const [{ n }] = await db
    .select({ n: sql<number>`count(*)` })
    .from(subscriptions)
    .innerJoin(users, eq(users.id, subscriptions.userId))
    .innerJoin(vehicles, eq(vehicles.id, subscriptions.vehicleId))
    .where(where);
  const orderBy =
    q.status === 'PENDING' || q.filter === 'pending'
      ? [sql`${subscriptions.createdAt} asc`, sql`${subscriptions.id} asc`]
      : q.filter === 'expiring' || q.filter === 'active'
        ? [sql`${subscriptions.endDate} asc`, sql`${subscriptions.id} asc`]
        : undefined;
  const items = await findSubscriptions(db, t, where, {
    limit: q.pageSize,
    offset: (q.page - 1) * q.pageSize,
    orderBy,
  });
  return { items, total: Number(n), page: q.page, pageSize: q.pageSize };
}

async function lockVehicle(tx: Tx, vehicleId: number) {
  const [v] = await tx.select().from(vehicles).where(eq(vehicles.id, vehicleId)).for('update');
  if (!v) throw notFound('Vehicle');
  return v;
}

/** At most one active subscription per vehicle for any given day. */
export async function assertNoOverlap(tx: Tx, vehicleId: number, start: string, end: string) {
  const [clash] = await tx
    .select({
      id: subscriptions.id,
      startDate: subscriptions.startDate,
      endDate: subscriptions.endDate,
    })
    .from(subscriptions)
    .where(
      and(
        eq(subscriptions.vehicleId, vehicleId),
        eq(subscriptions.status, 'ACTIVE'),
        lte(subscriptions.startDate, end),
        gte(subscriptions.endDate, start),
      ),
    )
    .limit(1);
  if (clash) {
    throw conflict(
      `This vehicle already has an active plan from ${clash.startDate} to ${clash.endDate}. Renew it, or cancel it first.`,
      'SUBSCRIPTION_OVERLAP',
      { subscriptionId: clash.id },
    );
  }
}

export async function assertWasher(tx: Tx, washerId: number | null | undefined) {
  if (!washerId) return;
  const [w] = await tx.select().from(users).where(eq(users.id, washerId));
  if (!w || w.role !== 'WASHER') throw badRequest('Choose a washer');
  if (!w.isActive) throw badRequest(`${w.name} is deactivated`);
}

type PaymentChoice = {
  withoutPayment: boolean;
  withoutPaymentReason: string | null;
  payment?: {
    amount: number;
    mode: 'CASH' | 'UPI' | 'BANK_TRANSFER' | 'OTHER';
    reference: string | null;
    paidOn: string;
  } | null;
  notes: string | null;
  washerId?: number | null;
};

async function createSubscription(
  tx: Tx,
  actorId: number,
  args: {
    userId: number;
    vehicleId: number;
    planId: number;
    months: number;
    startDate: string;
  } & PaymentChoice,
  action: 'SUBSCRIPTION_ACTIVATED' | 'SUBSCRIPTION_RENEWED',
): Promise<number> {
  const vehicle = await lockVehicle(tx, args.vehicleId);
  if (vehicle.userId !== args.userId)
    throw badRequest('That vehicle does not belong to this customer');
  if (!vehicle.isActive) throw badRequest('That vehicle is deactivated');

  const [owner] = await tx.select().from(users).where(eq(users.id, args.userId));
  if (!owner || owner.role !== 'USER') throw badRequest('Choose a customer');

  const [plan] = await tx.select().from(plans).where(eq(plans.id, args.planId));
  if (!plan) throw notFound('Plan');
  if (!plan.isActive) throw badRequest(`${plan.name} is not active`);
  if (plan.vehicleCategory !== vehicle.category) {
    throw badRequest(
      `${plan.name} is for ${plan.vehicleCategory === 'CAR' ? 'cars' : 'bikes'} only`,
    );
  }

  const vehicleType = vehicleTypeOf(vehicle.category, vehicle.carType);
  const [price] = await tx
    .select()
    .from(planPrices)
    .where(and(eq(planPrices.planId, plan.id), eq(planPrices.vehicleType, vehicleType)));
  if (!price || !price.isActive) {
    throw unprocessable(`${plan.name} has no active price for this vehicle type`, 'NO_PRICE');
  }

  const endDate = subscriptionEndDate(args.startDate, args.months);
  await assertNoOverlap(tx, vehicle.id, args.startDate, endDate);
  // No washer given at all → the society's default washer, if it has one.
  const washerId =
    args.washerId === undefined ? await defaultWasherForUser(tx, args.userId) : args.washerId;
  await assertWasher(tx, washerId);

  const monthlyPrice = toNumber(price.monthlyPrice);
  const notes = [
    args.notes,
    args.withoutPayment ? `Activated without payment: ${args.withoutPaymentReason}` : null,
  ]
    .filter(Boolean)
    .join('\n');

  const [row] = await tx
    .insert(subscriptions)
    .values({
      userId: args.userId,
      vehicleId: vehicle.id,
      planId: plan.id,
      vehicleType,
      monthlyPrice: toDecimal(monthlyPrice),
      months: args.months,
      totalAmount: toDecimal(monthlyPrice * args.months),
      startDate: args.startDate,
      endDate,
      status: 'ACTIVE',
      assignedWasherId: washerId ?? null,
      activatedBy: actorId,
      activatedAt: now(),
      notes: notes || null,
    })
    .$returningId();

  if (!args.withoutPayment && args.payment) {
    await insertPayment(tx, actorId, {
      userId: args.userId,
      subscriptionId: row.id,
      ...args.payment,
    });
  }
  await audit(tx, actorId, action, 'subscription', row.id, {
    vehicleId: vehicle.id,
    planId: plan.id,
    months: args.months,
    startDate: args.startDate,
    endDate,
    monthlyPrice,
    withoutPayment: args.withoutPayment,
  });
  return row.id;
}

export async function activateSubscription(
  actorId: number,
  input: z.output<typeof activateSubscriptionSchema>,
): Promise<SubscriptionDto> {
  const id = await getDb().transaction((tx) =>
    createSubscription(tx, actorId, input, 'SUBSCRIPTION_ACTIVATED'),
  );
  return (await findSubscription(getDb(), id, today()))!;
}

/**
 * Renewal: a new subscription starting the day after the current one ends
 * (or today, if it has already lapsed). Optionally on a different plan.
 */
export async function renewSubscription(
  actorId: number,
  id: number,
  input: z.output<typeof renewSubscriptionSchema>,
): Promise<SubscriptionDto> {
  const current = await findSubscription(getDb(), id, today());
  if (!current) throw notFound('Subscription');
  if (current.status === 'CANCELLED')
    throw badRequest('A cancelled subscription cannot be renewed');
  const startDate = maxDate(addDays(current.endDate, 1), today());
  const newId = await getDb().transaction((tx) =>
    createSubscription(
      tx,
      actorId,
      {
        ...input,
        userId: current.userId,
        vehicleId: current.vehicleId,
        planId: input.planId ?? current.planId,
        startDate,
        washerId: input.washerId === undefined ? current.assignedWasherId : input.washerId,
      },
      'SUBSCRIPTION_RENEWED',
    ),
  );
  return (await findSubscription(getDb(), newId, today()))!;
}

/** Cancels and ends the subscription today (or at its start, if it hasn't begun). */
export async function cancelSubscription(
  actorId: number,
  id: number,
  reason: string | null,
): Promise<SubscriptionDto> {
  const db = getDb();
  const t = today();
  await db.transaction(async (tx) => {
    const [s] = await tx.select().from(subscriptions).where(eq(subscriptions.id, id)).for('update');
    if (!s) throw notFound('Subscription');
    if (s.status === 'CANCELLED') throw badRequest('Already cancelled');
    // A request that never started keeps its dates.
    let endDate = s.endDate;
    if (s.status === 'PENDING') endDate = s.endDate;
    else if (s.startDate > t) endDate = s.startDate;
    else if (s.endDate >= t) endDate = t;
    const notes = [s.notes, `Cancelled on ${t}${reason ? `: ${reason}` : ''}`]
      .filter(Boolean)
      .join('\n');
    await tx
      .update(subscriptions)
      .set({ status: 'CANCELLED', endDate, notes })
      .where(eq(subscriptions.id, id));
    await audit(tx, actorId, 'SUBSCRIPTION_CANCELLED', 'subscription', id, {
      previousEndDate: s.endDate,
      endDate,
      reason,
    });
  });
  return (await findSubscription(db, id, t))!;
}

export async function assignWasher(
  actorId: number,
  id: number,
  washerId: number | null,
): Promise<SubscriptionDto> {
  const db = getDb();
  await db.transaction(async (tx) => {
    const [s] = await tx.select().from(subscriptions).where(eq(subscriptions.id, id));
    if (!s) throw notFound('Subscription');
    if (s.status === 'CANCELLED') throw badRequest('This subscription is cancelled');
    await assertWasher(tx, washerId);
    await tx
      .update(subscriptions)
      .set({ assignedWasherId: washerId })
      .where(eq(subscriptions.id, id));
    await audit(tx, actorId, 'WASHER_ASSIGNED', 'subscription', id, {
      from: s.assignedWasherId,
      to: washerId,
    });
  });
  return (await findSubscription(db, id, today()))!;
}
