import { asc, eq, inArray } from 'drizzle-orm';
import type { z } from 'zod';
import { VEHICLE_TYPES } from '../../../shared/enums';
import type { oneTimeServiceSchema } from '../../../shared/schemas';
import type { OneTimeServiceDto } from '../../../shared/types';
import { getDb, type DbOrTx } from '../../db';
import { oneTimeServicePrices, oneTimeServices } from '../../db/schema';
import { audit } from '../../lib/audit';
import { notFound } from '../../lib/errors';

type ServiceRow = typeof oneTimeServices.$inferSelect;
type PriceRow = typeof oneTimeServicePrices.$inferSelect;

function toDto(s: ServiceRow, prices: PriceRow[]): OneTimeServiceDto {
  const applies = VEHICLE_TYPES.filter((t) => s.appliesTo.includes(t));
  const own = prices
    .filter((p) => p.serviceId === s.id && applies.includes(p.vehicleType))
    .sort((a, b) => VEHICLE_TYPES.indexOf(a.vehicleType) - VEHICLE_TYPES.indexOf(b.vehicleType))
    .map((p) => ({ vehicleType: p.vehicleType, price: p.price }));
  return {
    id: s.id,
    name: s.name,
    description: s.description,
    includes: s.includes,
    appliesTo: applies,
    durationMinutes: s.durationMinutes,
    isActive: s.isActive,
    sortOrder: s.sortOrder,
    prices: own,
    fromPrice: own.length ? Math.min(...own.map((p) => p.price)) : 0,
  };
}

async function load(db: DbOrTx, rows: ServiceRow[]): Promise<OneTimeServiceDto[]> {
  if (!rows.length) return [];
  const prices = await db
    .select()
    .from(oneTimeServicePrices)
    .where(
      inArray(
        oneTimeServicePrices.serviceId,
        rows.map((r) => r.id),
      ),
    );
  return rows.map((r) => toDto(r, prices));
}

/** `activeOnly` for the welcome page and booking form. */
export async function listServices(activeOnly: boolean): Promise<OneTimeServiceDto[]> {
  const db = getDb();
  const rows = await db
    .select()
    .from(oneTimeServices)
    .where(activeOnly ? eq(oneTimeServices.isActive, true) : undefined)
    .orderBy(asc(oneTimeServices.sortOrder), asc(oneTimeServices.id));
  return load(db, rows);
}

export async function getService(db: DbOrTx, id: number): Promise<OneTimeServiceDto> {
  const rows = await db.select().from(oneTimeServices).where(eq(oneTimeServices.id, id));
  if (!rows.length) throw notFound('Service');
  return (await load(db, rows))[0];
}

type Input = z.output<typeof oneTimeServiceSchema>;

async function savePrices(db: DbOrTx, serviceId: number, input: Input) {
  for (const p of input.prices) {
    await db
      .insert(oneTimeServicePrices)
      .values({ serviceId, vehicleType: p.vehicleType, price: p.price })
      .onDuplicateKeyUpdate({ set: { price: p.price } });
  }
}

export async function createService(actorId: number, input: Input): Promise<OneTimeServiceDto> {
  const db = getDb();
  const id = await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(oneTimeServices)
      .values({
        name: input.name,
        description: input.description,
        includes: input.includes,
        appliesTo: input.appliesTo,
        durationMinutes: input.durationMinutes,
        isActive: input.isActive,
        sortOrder: input.sortOrder,
      })
      .$returningId();
    await savePrices(tx, row.id, input);
    await audit(tx, actorId, 'PLAN_UPDATED', 'one_time_service', row.id, { created: input.name });
    return row.id;
  });
  return getService(db, id);
}

/** Bookings keep their own price snapshot, so changing prices here never touches them. */
export async function updateService(
  actorId: number,
  id: number,
  input: Input,
): Promise<OneTimeServiceDto> {
  const db = getDb();
  await db.transaction(async (tx) => {
    const before = await getService(tx, id);
    await tx
      .update(oneTimeServices)
      .set({
        name: input.name,
        description: input.description,
        includes: input.includes,
        appliesTo: input.appliesTo,
        durationMinutes: input.durationMinutes,
        isActive: input.isActive,
        sortOrder: input.sortOrder,
      })
      .where(eq(oneTimeServices.id, id));
    await savePrices(tx, id, input);
    const changed = input.prices.filter(
      (p) => before.prices.find((b) => b.vehicleType === p.vehicleType)?.price !== p.price,
    );
    if (changed.length) {
      await audit(tx, actorId, 'PRICE_CHANGED', 'one_time_service', id, { prices: changed });
    }
    await audit(tx, actorId, 'PLAN_UPDATED', 'one_time_service', id, { name: input.name });
  });
  return getService(db, id);
}
