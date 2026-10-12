import { and, asc, desc, eq, inArray, like, or, sql } from 'drizzle-orm';
import type { z } from 'zod';
import { normaliseRegistration } from '../../../shared/registration';
import type { adminVehicleUpdateSchema, vehicleInputSchema } from '../../../shared/schemas';
import type { Paged, SubscriptionDto, VehicleDto } from '../../../shared/types';
import { getDb, type DbOrTx } from '../../db';
import { subscriptions, users, vehicles } from '../../db/schema';
import { today } from '../../lib/clock';
import { conflict, notFound, unprocessable } from '../../lib/errors';
import { findSubscriptions } from '../subscriptions/subscription.repo';
import { hasSubscriptionSql, toVehicleDto } from './vehicles.repo';

type VehicleInput = z.output<typeof vehicleInputSchema>;

export async function assertRegistrationFree(db: DbOrTx, reg: string, exceptId?: number) {
  const [row] = await db
    .select({ id: vehicles.id })
    .from(vehicles)
    .where(eq(vehicles.registrationNumber, reg))
    .limit(1);
  if (row && row.id !== exceptId) {
    throw conflict('This registration number is already registered', 'REGISTRATION_TAKEN', {
      fieldErrors: {
        registrationNumber: ['Already registered — contact us if this is your vehicle'],
      },
    });
  }
}

export async function insertVehicle(db: DbOrTx, userId: number, v: VehicleInput): Promise<number> {
  await assertRegistrationFree(db, v.registrationNumber);
  const [row] = await db
    .insert(vehicles)
    .values({
      userId,
      category: v.category,
      carType: v.carType,
      registrationNumber: v.registrationNumber,
      make: v.make,
      model: v.model,
      color: v.color,
      parkingNotes: v.parkingNotes,
    })
    .$returningId();
  return row.id;
}

export async function getVehicle(id: number): Promise<VehicleDto> {
  const [row] = await getDb()
    .select({
      v: vehicles,
      has: hasSubscriptionSql,
      ownerName: users.name,
      ownerMobile: users.mobile,
    })
    .from(vehicles)
    .innerJoin(users, eq(users.id, vehicles.userId))
    .where(eq(vehicles.id, id))
    .limit(1);
  if (!row) throw notFound('Vehicle');
  return toVehicleDto(row.v, row.has, { name: row.ownerName, mobile: row.ownerMobile });
}

export async function listUserVehicles(userId: number): Promise<VehicleDto[]> {
  const rows = await getDb()
    .select({ v: vehicles, has: hasSubscriptionSql })
    .from(vehicles)
    .where(eq(vehicles.userId, userId))
    .orderBy(desc(vehicles.isActive), asc(vehicles.id));
  return rows.map((r) => toVehicleDto(r.v, r.has));
}

export async function addUserVehicle(userId: number, input: VehicleInput): Promise<VehicleDto> {
  const id = await insertVehicle(getDb(), userId, input);
  return getVehicle(id);
}

/** Owners can't change the registration number or category once a plan has been activated. */
export async function updateOwnVehicle(
  userId: number,
  id: number,
  input: VehicleInput,
): Promise<VehicleDto> {
  const current = await getVehicle(id);
  if (current.userId !== userId) throw notFound('Vehicle');
  const reg = normaliseRegistration(input.registrationNumber);
  const regChanged = reg !== normaliseRegistration(current.registrationNumber);
  if (current.hasSubscription && (regChanged || input.category !== current.category)) {
    throw unprocessable(
      'This vehicle has a plan, so its registration number and type are locked. Please ask us to change them.',
      'VEHICLE_LOCKED',
    );
  }
  const db = getDb();
  if (regChanged) await assertRegistrationFree(db, reg, id);
  await db
    .update(vehicles)
    .set({
      category: input.category,
      carType: input.carType,
      registrationNumber: reg,
      make: input.make,
      model: input.model,
      color: input.color,
      parkingNotes: input.parkingNotes,
    })
    .where(eq(vehicles.id, id));
  return getVehicle(id);
}

export async function adminUpdateVehicle(
  id: number,
  input: z.output<typeof adminVehicleUpdateSchema>,
): Promise<VehicleDto> {
  await getVehicle(id);
  const db = getDb();
  await assertRegistrationFree(db, input.registrationNumber, id);
  await db.update(vehicles).set(input).where(eq(vehicles.id, id));
  return getVehicle(id);
}

export interface AdminVehicleRow extends VehicleDto {
  current: SubscriptionDto | null;
}

export async function adminListVehicles(q: {
  page: number;
  pageSize: number;
  search?: string;
  societyId?: number;
}): Promise<Paged<AdminVehicleRow>> {
  const db = getDb();
  const term = q.search?.trim();
  const where = and(
    q.societyId ? eq(users.societyId, q.societyId) : undefined,
    term
      ? or(
          like(vehicles.registrationNumber, `%${normaliseRegistration(term)}%`),
          like(users.name, `%${term}%`),
          like(users.mobile, `%${term.replace(/\D/g, '') || term}%`),
          like(vehicles.make, `%${term}%`),
          like(vehicles.model, `%${term}%`),
        )
      : undefined,
  );
  const [{ total }] = await db
    .select({ total: sql<number>`count(*)` })
    .from(vehicles)
    .innerJoin(users, eq(users.id, vehicles.userId))
    .where(where);
  const rows = await db
    .select({
      v: vehicles,
      has: hasSubscriptionSql,
      ownerName: users.name,
      ownerMobile: users.mobile,
    })
    .from(vehicles)
    .innerJoin(users, eq(users.id, vehicles.userId))
    .where(where)
    .orderBy(desc(vehicles.id))
    .limit(q.pageSize)
    .offset((q.page - 1) * q.pageSize);

  const t = today();
  const ids = rows.map((r) => r.v.id);
  const subs = ids.length
    ? await findSubscriptions(
        db,
        t,
        and(inArray(subscriptions.vehicleId, ids), eq(subscriptions.status, 'ACTIVE')),
      )
    : [];
  return {
    items: rows.map((r) => {
      const mine = subs.filter((s) => s.vehicleId === r.v.id);
      const current =
        mine.find((s) => s.startDate <= t && s.endDate >= t) ??
        mine.find((s) => s.startDate > t) ??
        mine[0] ??
        null;
      return {
        ...toVehicleDto(r.v, r.has, { name: r.ownerName, mobile: r.ownerMobile }),
        current,
      };
    }),
    total: Number(total),
    page: q.page,
    pageSize: q.pageSize,
  };
}
