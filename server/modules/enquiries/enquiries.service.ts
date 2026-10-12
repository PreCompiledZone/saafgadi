import { and, count, desc, eq, isNull, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/mysql-core';
import type { z } from 'zod';
import type { EnquiryStatus } from '../../../shared/enums';
import { formatRegistration } from '../../../shared/registration';
import type { createEnquirySchema, updateEnquirySchema } from '../../../shared/schemas';
import type { EnquiryDto, Paged } from '../../../shared/types';
import { getDb } from '../../db';
import { enquiries, plans, users, vehicles } from '../../db/schema';
import { badRequest, notFound } from '../../lib/errors';
import { vehicleLabel } from '../subscriptions/subscription.repo';

const handler = alias(users, 'handler');

function baseQuery() {
  return getDb()
    .select({
      e: enquiries,
      userName: users.name,
      userMobile: users.mobile,
      v: vehicles,
      planName: plans.name,
      handledByName: handler.name,
    })
    .from(enquiries)
    .leftJoin(users, eq(users.id, enquiries.userId))
    .leftJoin(vehicles, eq(vehicles.id, enquiries.vehicleId))
    .leftJoin(plans, eq(plans.id, enquiries.planId))
    .leftJoin(handler, eq(handler.id, enquiries.handledBy))
    .$dynamic();
}

type Row = Awaited<ReturnType<ReturnType<typeof baseQuery>['execute']>>[number];

function toDto(r: Row): EnquiryDto {
  return {
    id: r.e.id,
    userId: r.e.userId,
    userName: r.userName,
    userMobile: r.userMobile,
    vehicleId: r.e.vehicleId,
    registrationNumber: r.v ? formatRegistration(r.v.registrationNumber) : null,
    vehicleLabel: r.v ? vehicleLabel(r.v) : null,
    planId: r.e.planId,
    planName: r.planName,
    type: r.e.type,
    message: r.e.message,
    status: r.e.status,
    adminNotes: r.e.adminNotes,
    handledByName: r.handledByName,
    createdAt: r.e.createdAt.toISOString(),
  };
}

export async function listEnquiries(f: {
  page: number;
  pageSize: number;
  status?: EnquiryStatus;
  userId?: number;
  search?: string;
}): Promise<Paged<EnquiryDto>> {
  const term = f.search?.trim();
  const where = and(
    f.status ? eq(enquiries.status, f.status) : undefined,
    f.userId ? eq(enquiries.userId, f.userId) : undefined,
    term
      ? sql`(${users.name} like ${`%${term}%`} or ${users.mobile} like ${`%${term}%`})`
      : undefined,
  );
  const [{ total }] = await getDb()
    .select({ total: count() })
    .from(enquiries)
    .leftJoin(users, eq(users.id, enquiries.userId))
    .where(where);
  const rows = await baseQuery()
    .where(where)
    .orderBy(desc(enquiries.createdAt), desc(enquiries.id))
    .limit(f.pageSize)
    .offset((f.page - 1) * f.pageSize);
  return { items: rows.map(toDto), total, page: f.page, pageSize: f.pageSize };
}

async function getEnquiry(id: number): Promise<EnquiryDto> {
  const [row] = await baseQuery().where(eq(enquiries.id, id));
  if (!row) throw notFound('Enquiry');
  return toDto(row);
}

/**
 * Creates an enquiry. Repeated taps (e.g. WhatsApp, then Call) for the same
 * vehicle and plan reuse the open enquiry instead of creating duplicates.
 */
export async function createEnquiry(
  userId: number,
  input: z.output<typeof createEnquirySchema>,
): Promise<EnquiryDto> {
  const db = getDb();
  if (input.vehicleId) {
    const [v] = await db.select().from(vehicles).where(eq(vehicles.id, input.vehicleId));
    if (!v || v.userId !== userId) throw notFound('Vehicle');
    if (input.planId) {
      const [p] = await db.select().from(plans).where(eq(plans.id, input.planId));
      if (!p || !p.isActive) throw notFound('Plan');
      if (p.vehicleCategory !== v.category) {
        throw badRequest(`${p.name} is not available for this vehicle`);
      }
    }
  } else if (input.planId) {
    const [p] = await db.select().from(plans).where(eq(plans.id, input.planId));
    if (!p || !p.isActive) throw notFound('Plan');
  }

  const [open] = await db
    .select({ id: enquiries.id })
    .from(enquiries)
    .where(
      and(
        eq(enquiries.userId, userId),
        eq(enquiries.status, 'OPEN'),
        eq(enquiries.type, input.type),
        input.vehicleId ? eq(enquiries.vehicleId, input.vehicleId) : isNull(enquiries.vehicleId),
        input.planId ? eq(enquiries.planId, input.planId) : isNull(enquiries.planId),
      ),
    )
    .limit(1);
  if (open) {
    if (input.message) {
      await db.update(enquiries).set({ message: input.message }).where(eq(enquiries.id, open.id));
    }
    return getEnquiry(open.id);
  }

  const [row] = await db
    .insert(enquiries)
    .values({
      userId,
      vehicleId: input.vehicleId ?? null,
      planId: input.planId ?? null,
      type: input.type,
      message: input.message,
    })
    .$returningId();
  return getEnquiry(row.id);
}

export async function updateEnquiry(
  actorId: number,
  id: number,
  input: z.output<typeof updateEnquirySchema>,
): Promise<EnquiryDto> {
  await getEnquiry(id);
  await getDb()
    .update(enquiries)
    .set({ status: input.status, adminNotes: input.adminNotes, handledBy: actorId })
    .where(eq(enquiries.id, id));
  return getEnquiry(id);
}

export async function countOpenEnquiries(): Promise<number> {
  const [{ n }] = await getDb()
    .select({ n: count() })
    .from(enquiries)
    .where(eq(enquiries.status, 'OPEN'));
  return n;
}
