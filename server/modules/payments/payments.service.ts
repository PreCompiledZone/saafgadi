import { and, count, desc, eq, gte, lte, sql, sum } from 'drizzle-orm';
import { alias } from 'drizzle-orm/mysql-core';
import type { z } from 'zod';
import type { PaymentMode } from '../../../shared/enums';
import { LABELS } from '../../../shared/enums';
import { formatRegistration } from '../../../shared/registration';
import type { recordPaymentSchema } from '../../../shared/schemas';
import type { Paged, PaymentDto } from '../../../shared/types';
import { getDb, type DbOrTx } from '../../db';
import { bookings, payments, plans, subscriptions, users, vehicles } from '../../db/schema';
import { refreshPaymentStatus } from '../one-time/bookings.service';
import { audit } from '../../lib/audit';
import { badRequest } from '../../lib/errors';
import { toDecimal, toNumber } from '../../lib/money';
import { qualified } from '../../lib/sql';
import { getUser } from '../users/users.service';

const recorder = alias(users, 'recorder');

/** Paid towards the subscription up to and including this payment. */
const paidToDateSql = sql<string>`(select coalesce(sum(\`earlier\`.\`amount\`), 0) from \`payments\` \`earlier\` where \`earlier\`.\`subscription_id\` = ${qualified(payments.subscriptionId)} and \`earlier\`.\`id\` <= ${qualified(payments.id)})`;

export interface PaymentFilter {
  page: number;
  pageSize: number;
  search?: string;
  from?: string;
  to?: string;
  mode?: PaymentMode;
  userId?: number;
}

function whereFor(f: PaymentFilter) {
  const term = f.search?.trim();
  return and(
    f.from ? gte(payments.paidOn, f.from) : undefined,
    f.to ? lte(payments.paidOn, f.to) : undefined,
    f.mode ? eq(payments.mode, f.mode) : undefined,
    f.userId ? eq(payments.userId, f.userId) : undefined,
    term
      ? sql`(${users.name} like ${`%${term}%`} or ${users.mobile} like ${`%${term}%`} or ${payments.reference} like ${`%${term}%`})`
      : undefined,
  );
}

function baseQuery(db: DbOrTx) {
  return db
    .select({
      p: payments,
      userName: users.name,
      userMobile: users.mobile,
      reg: vehicles.registrationNumber,
      bookingReg: bookings.registrationNumber,
      serviceName: bookings.serviceName,
      planName: plans.name,
      startDate: subscriptions.startDate,
      endDate: subscriptions.endDate,
      subscriptionTotal: subscriptions.totalAmount,
      paidToDate: paidToDateSql,
      recordedByName: recorder.name,
    })
    .from(payments)
    .innerJoin(users, eq(users.id, payments.userId))
    .innerJoin(recorder, eq(recorder.id, payments.recordedBy))
    .leftJoin(subscriptions, eq(subscriptions.id, payments.subscriptionId))
    .leftJoin(vehicles, eq(vehicles.id, subscriptions.vehicleId))
    .leftJoin(plans, eq(plans.id, subscriptions.planId))
    .leftJoin(bookings, eq(bookings.id, payments.bookingId))
    .$dynamic();
}

type Row = Awaited<ReturnType<ReturnType<typeof baseQuery>['execute']>>[number];

function toDto(r: Row): PaymentDto {
  return {
    id: r.p.id,
    subscriptionId: r.p.subscriptionId,
    bookingId: r.p.bookingId,
    serviceName: r.serviceName,
    userId: r.p.userId,
    userName: r.userName,
    userMobile: r.userMobile,
    registrationNumber:
      (r.reg ?? r.bookingReg) ? formatRegistration((r.reg ?? r.bookingReg)!) : null,
    planName: r.planName,
    periodStart: r.startDate,
    periodEnd: r.endDate,
    subscriptionTotal: r.subscriptionTotal === null ? null : toNumber(r.subscriptionTotal),
    paidToDate: r.p.subscriptionId ? toNumber(r.paidToDate) : null,
    amount: toNumber(r.p.amount),
    mode: r.p.mode,
    reference: r.p.reference,
    paidOn: r.p.paidOn,
    recordedByName: r.recordedByName,
    notes: r.p.notes,
    createdAt: r.p.createdAt.toISOString(),
  };
}

export async function listPayments(
  f: PaymentFilter,
): Promise<Paged<PaymentDto> & { totalAmount: number }> {
  const db = getDb();
  const where = whereFor(f);
  const [agg] = await db
    .select({ total: count(), amount: sum(payments.amount) })
    .from(payments)
    .innerJoin(users, eq(users.id, payments.userId))
    .where(where);
  const rows = await baseQuery(db)
    .where(where)
    .orderBy(desc(payments.paidOn), desc(payments.id))
    .limit(f.pageSize)
    .offset((f.page - 1) * f.pageSize);
  return {
    items: rows.map(toDto),
    total: agg.total,
    page: f.page,
    pageSize: f.pageSize,
    totalAmount: toNumber(agg.amount),
  };
}

export async function insertPayment(
  db: DbOrTx,
  actorId: number,
  p: {
    userId: number;
    subscriptionId: number | null;
    bookingId?: number | null;
    amount: number;
    mode: PaymentMode;
    reference: string | null;
    paidOn: string;
    notes?: string | null;
  },
): Promise<number> {
  const [row] = await db
    .insert(payments)
    .values({
      userId: p.userId,
      subscriptionId: p.subscriptionId,
      bookingId: p.bookingId ?? null,
      amount: toDecimal(p.amount),
      mode: p.mode,
      reference: p.reference,
      paidOn: p.paidOn,
      notes: p.notes ?? null,
      recordedBy: actorId,
    })
    .$returningId();
  await audit(db, actorId, 'PAYMENT_RECORDED', 'payment', row.id, {
    userId: p.userId,
    subscriptionId: p.subscriptionId,
    bookingId: p.bookingId ?? null,
    amount: p.amount,
    mode: p.mode,
  });
  return row.id;
}

export async function recordPayment(
  actorId: number,
  input: z.output<typeof recordPaymentSchema>,
): Promise<PaymentDto> {
  await getUser(input.userId);
  const db = getDb();
  if (input.subscriptionId) {
    const [s] = await db
      .select({ userId: subscriptions.userId })
      .from(subscriptions)
      .where(eq(subscriptions.id, input.subscriptionId));
    if (!s || s.userId !== input.userId) {
      throw badRequest('That subscription does not belong to this customer');
    }
  }
  if (input.bookingId) {
    const [b] = await db
      .select({ userId: bookings.userId })
      .from(bookings)
      .where(eq(bookings.id, input.bookingId));
    if (!b || b.userId !== input.userId) {
      throw badRequest('That booking does not belong to this customer');
    }
  }
  const id = await db.transaction(async (tx) => {
    const paymentId = await insertPayment(tx, actorId, {
      userId: input.userId,
      subscriptionId: input.subscriptionId ?? null,
      bookingId: input.bookingId ?? null,
      amount: input.amount,
      mode: input.mode,
      reference: input.reference,
      paidOn: input.paidOn,
      notes: input.notes,
    });
    if (input.bookingId) await refreshPaymentStatus(tx, input.bookingId);
    return paymentId;
  });
  const [row] = await baseQuery(db).where(eq(payments.id, id));
  return toDto(row);
}

function csvCell(v: string | number | null): string {
  if (v === null) return '';
  const s = String(v);
  // Neutralise spreadsheet formulas and quote everything else that needs it.
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export async function paymentsCsv(f: Omit<PaymentFilter, 'page' | 'pageSize'>): Promise<string> {
  const rows = await baseQuery(getDb())
    .where(whereFor({ ...f, page: 1, pageSize: 1 }))
    .orderBy(desc(payments.paidOn), desc(payments.id));
  const header = [
    'Paid on',
    'Customer',
    'Mobile',
    'Amount (INR)',
    'Mode',
    'Reference',
    'Vehicle',
    'Plan',
    'Subscription ID',
    'Recorded by',
    'Notes',
  ];
  const lines = rows
    .map(toDto)
    .map((p) =>
      [
        p.paidOn,
        p.userName,
        p.userMobile,
        p.amount.toFixed(2),
        LABELS.paymentMode[p.mode],
        p.reference,
        p.registrationNumber,
        p.planName ?? (p.serviceName ? `One-time: ${p.serviceName}` : null),
        p.subscriptionId,
        p.recordedByName,
        p.notes,
      ]
        .map(csvCell)
        .join(','),
    );
  return [header.join(','), ...lines].join('\r\n') + '\r\n';
}
