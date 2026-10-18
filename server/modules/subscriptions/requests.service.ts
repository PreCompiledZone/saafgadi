// Monthly plan requests: customers ask (PENDING), admins activate after payment.
import { and, eq, gte, lt, or, sql } from 'drizzle-orm';
import { format, parseISO } from 'date-fns';
import type { z } from 'zod';
import { subscriptionRef, vehicleTypeOf } from '../../../shared/enums';
import type {
  activatePendingSchema,
  planRequestSchema,
  renewRequestSchema,
} from '../../../shared/schemas';
import type { SubscriptionDto } from '../../../shared/types';
import { getConfig } from '../../config';
import { getDb, type DbOrTx, type Tx } from '../../db';
import { planPrices, plans, subscriptions, users, vehicles } from '../../db/schema';
import { audit } from '../../lib/audit';
import { now, today } from '../../lib/clock';
import { addDays, daysBetween } from '../../lib/dates';
import { AppError, badRequest, conflict, forbidden, notFound } from '../../lib/errors';
import { toDecimal, toNumber } from '../../lib/money';
import { subscriptionEndDate } from '../../lib/schedule';
import { sendPlanEmail, type PlanEmailKind } from '../notifications/notifications.service';
import { defaultWasherForUser } from '../societies/societies.service';
import { findSubscription } from './subscription.repo';
import { assertNoOverlap, assertWasher } from './subscriptions.service';

/** How far ahead a customer may ask a plan to start. */
export const PLAN_START_MAX_DAYS = 30;

/**
 * There's no scheduler on the host, so PENDING requests past PLAN_REQUEST_EXPIRY_DAYS
 * are cancelled whenever subscriptions are read.
 */
export async function expireStalePending(db: DbOrTx = getDb()): Promise<void> {
  const days = getConfig().plans.requestExpiryDays;
  const cutoff = new Date(now().getTime() - days * 86_400_000);
  await db
    .update(subscriptions)
    .set({
      status: 'CANCELLED',
      notes: sql`concat_ws('\n', ${subscriptions.notes}, ${`Request expired after ${days} days without activation`})`,
    })
    .where(and(eq(subscriptions.status, 'PENDING'), lt(subscriptions.createdAt, cutoff)));
}

/** ACTIVE (not yet ended) or PENDING subscriptions for a vehicle. */
async function liveFor(tx: DbOrTx, vehicleId: number) {
  return tx
    .select()
    .from(subscriptions)
    .where(
      and(
        eq(subscriptions.vehicleId, vehicleId),
        or(
          eq(subscriptions.status, 'PENDING'),
          and(eq(subscriptions.status, 'ACTIVE'), gte(subscriptions.endDate, today())),
        ),
      ),
    );
}

const PLAN_EXISTS = () =>
  conflict('This vehicle already has a plan or a pending request.', 'PLAN_EXISTS');

async function priceFor(tx: Tx, planId: number, vehicle: typeof vehicles.$inferSelect) {
  const [plan] = await tx.select().from(plans).where(eq(plans.id, planId));
  if (!plan || !plan.isActive) throw notFound('Plan');
  if (plan.vehicleCategory !== vehicle.category) {
    throw badRequest(
      `${plan.name} is for ${plan.vehicleCategory === 'CAR' ? 'cars' : 'bikes'} only`,
      { fieldErrors: { vehicleId: ['Not available for this vehicle'] } },
      'VEHICLE_TYPE_NOT_ALLOWED',
    );
  }
  const vehicleType = vehicleTypeOf(vehicle.category, vehicle.carType);
  const [price] = await tx
    .select()
    .from(planPrices)
    .where(and(eq(planPrices.planId, plan.id), eq(planPrices.vehicleType, vehicleType)));
  if (!price || !price.isActive) {
    throw new AppError(422, 'NO_PRICE', `${plan.name} has no price for this vehicle type yet`);
  }
  return { plan, vehicleType, monthlyPrice: toNumber(price.monthlyPrice) };
}

async function insertPending(
  tx: Tx,
  userId: number,
  vehicle: typeof vehicles.$inferSelect,
  planId: number,
  months: number,
  startDate: string,
  note: string | null,
): Promise<number> {
  const { vehicleType, monthlyPrice } = await priceFor(tx, planId, vehicle);
  const [row] = await tx
    .insert(subscriptions)
    .values({
      userId,
      vehicleId: vehicle.id,
      planId,
      vehicleType,
      monthlyPrice: toDecimal(monthlyPrice),
      months,
      totalAmount: toDecimal(monthlyPrice * months),
      startDate,
      endDate: subscriptionEndDate(startDate, months),
      status: 'PENDING',
      notes: note,
      // App clock, so the expiry window is testable.
      createdAt: now(),
    })
    .$returningId();
  return row.id;
}

async function lockOwnVehicle(tx: Tx, userId: number, vehicleId: number) {
  const [v] = await tx.select().from(vehicles).where(eq(vehicles.id, vehicleId)).for('update');
  if (!v || v.userId !== userId || !v.isActive) {
    throw badRequest('Choose one of your vehicles', {
      fieldErrors: { vehicleId: ['Choose one of your vehicles'] },
    });
  }
  return v;
}

const niceDate = (d: string) => format(parseISO(d), 'EEE, d MMM yyyy');

async function email(kind: PlanEmailKind, s: SubscriptionDto) {
  const [u] = await getDb()
    .select({ email: users.email, name: users.name })
    .from(users)
    .where(eq(users.id, s.userId));
  const data = {
    ref: subscriptionRef(s.id),
    customerName: (u?.name ?? s.userName).trim().split(/\s+/)[0],
    planName: s.planName,
    registrationNumber: s.registrationNumber,
    months: s.months,
    total: s.totalAmount,
    start: niceDate(s.startDate),
    end: kind === 'PLAN_ACTIVE' ? niceDate(s.endDate) : undefined,
  };
  await sendPlanEmail(u?.email, kind, data);
  if (kind === 'PLAN_REQUESTED') {
    await sendPlanEmail(getConfig().booking.adminNotifyEmail, 'PLAN_REQUEST_ADMIN', data);
  }
}

export async function requestPlan(
  userId: number,
  input: z.output<typeof planRequestSchema>,
): Promise<SubscriptionDto> {
  const db = getDb();
  const t = today();
  if (input.preferredStartDate <= t || input.preferredStartDate > addDays(t, PLAN_START_MAX_DAYS)) {
    throw badRequest(
      `Pick a start date from tomorrow up to ${PLAN_START_MAX_DAYS} days ahead`,
      { fieldErrors: { preferredStartDate: ['Pick a date from tomorrow up to 30 days ahead'] } },
      'DATE_OUT_OF_RANGE',
    );
  }
  await expireStalePending(db);
  const id = await db.transaction(async (tx) => {
    const vehicle = await lockOwnVehicle(tx, userId, input.vehicleId);
    if ((await liveFor(tx, vehicle.id)).length) throw PLAN_EXISTS();
    return insertPending(
      tx,
      userId,
      vehicle,
      input.planId,
      input.months,
      input.preferredStartDate,
      null,
    );
  });
  const s = (await findSubscription(db, id, t))!;
  await email('PLAN_REQUESTED', s);
  return s;
}

async function lockOwn(tx: Tx, userId: number, id: number) {
  const [s] = await tx.select().from(subscriptions).where(eq(subscriptions.id, id)).for('update');
  if (!s) throw notFound('Plan');
  if (s.userId !== userId) throw forbidden('This isn’t your plan');
  return s;
}

/** Customers can withdraw a request; only an admin can cancel an active plan. */
export async function cancelRequest(userId: number, id: number): Promise<SubscriptionDto> {
  const db = getDb();
  await expireStalePending(db);
  await db.transaction(async (tx) => {
    const s = await lockOwn(tx, userId, id);
    if (s.status !== 'PENDING') {
      throw forbidden(
        s.status === 'ACTIVE'
          ? 'Active plans can only be cancelled by us. Message us on WhatsApp.'
          : 'This request is no longer pending',
      );
    }
    await tx
      .update(subscriptions)
      .set({
        status: 'CANCELLED',
        notes: sql`concat_ws('\n', ${subscriptions.notes}, ${`Request cancelled by the customer on ${today()}`})`,
      })
      .where(eq(subscriptions.id, id));
  });
  return (await findSubscription(db, id, today()))!;
}

/** Days left on a plan including today. */
const daysLeft = (endDate: string) => daysBetween(today(), endDate) + 1;

/**
 * Within PLAN_RENEW_WINDOW_DAYS of the end: a PENDING plan starting the day after.
 * The only case where a vehicle may have a PENDING request next to an ACTIVE plan.
 */
export async function renewRequest(
  userId: number,
  id: number,
  input: z.output<typeof renewRequestSchema>,
): Promise<SubscriptionDto> {
  const db = getDb();
  const t = today();
  const window = getConfig().plans.renewWindowDays;
  await expireStalePending(db);
  const newId = await db.transaction(async (tx) => {
    const current = await lockOwn(tx, userId, id);
    if (current.status !== 'ACTIVE' || current.startDate > t || current.endDate < t) {
      throw badRequest(
        'Only a plan that is running now can be renewed',
        undefined,
        'NOT_RENEWABLE',
      );
    }
    if (daysLeft(current.endDate) > window) {
      throw badRequest(
        `You can renew in the last ${window} days of your plan`,
        undefined,
        'RENEW_NOT_OPEN',
      );
    }
    const others = (await liveFor(tx, current.vehicleId)).filter((s) => s.id !== current.id);
    if (others.length) {
      throw conflict('This plan is already renewed or has a pending request.', 'PLAN_EXISTS');
    }
    const vehicle = await lockOwnVehicle(tx, userId, current.vehicleId);
    return insertPending(
      tx,
      userId,
      vehicle,
      current.planId,
      input.months,
      addDays(current.endDate, 1),
      `Renewal of ${subscriptionRef(current.id)}`,
    );
  });
  const s = (await findSubscription(db, newId, t))!;
  await email('PLAN_REQUESTED', s);
  return s;
}

/** Admin: PENDING → ACTIVE from the confirmed start date, with a washer. */
export async function activatePending(
  actorId: number,
  id: number,
  input: z.output<typeof activatePendingSchema>,
): Promise<SubscriptionDto> {
  const db = getDb();
  const t = today();
  await expireStalePending(db);
  if (input.startDate < t) {
    throw badRequest('The start date has passed', {
      fieldErrors: { startDate: ['Pick today or later'] },
    });
  }
  await db.transaction(async (tx) => {
    const [s] = await tx.select().from(subscriptions).where(eq(subscriptions.id, id)).for('update');
    if (!s) throw notFound('Plan request');
    if (s.status !== 'PENDING') {
      throw conflict(
        s.status === 'CANCELLED'
          ? 'This request was cancelled or has expired'
          : 'This plan is already active',
        'NOT_PENDING',
      );
    }
    const endDate = subscriptionEndDate(input.startDate, s.months);
    await assertNoOverlap(tx, s.vehicleId, input.startDate, endDate);
    const washerId =
      input.washerId === undefined ? await defaultWasherForUser(tx, s.userId) : input.washerId;
    await assertWasher(tx, washerId);
    await tx
      .update(subscriptions)
      .set({
        status: 'ACTIVE',
        startDate: input.startDate,
        endDate,
        assignedWasherId: washerId ?? null,
        activatedBy: actorId,
        activatedAt: now(),
      })
      .where(eq(subscriptions.id, id));
    await audit(tx, actorId, 'SUBSCRIPTION_ACTIVATED', 'subscription', id, {
      fromRequest: true,
      startDate: input.startDate,
      endDate,
      requestedStart: s.startDate,
    });
  });
  const s = (await findSubscription(db, id, t))!;
  await email('PLAN_ACTIVE', s);
  return s;
}
