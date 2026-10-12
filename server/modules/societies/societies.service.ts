import { and, asc, count, eq, gte, inArray, isNull, lte, sql } from 'drizzle-orm';
import { qualified } from '../../lib/sql';
import type { z } from 'zod';
import type { societyAssignWasherSchema, societyInputSchema } from '../../../shared/schemas';
import type {
  PublicSociety,
  SocietyDetail,
  SocietyDto,
  UnlistedSociety,
} from '../../../shared/types';
import { getDb, type DbOrTx } from '../../db';
import { societies, subscriptions, users, vehicles } from '../../db/schema';
import { audit } from '../../lib/audit';
import { today } from '../../lib/clock';
import { badRequest, conflict, isDuplicateKey, notFound } from '../../lib/errors';
import { findSubscriptions } from '../subscriptions/subscription.repo';
import { toUserDto } from '../users/users.repo';
import { todaySummary } from '../wash-logs/wash-logs.service';

type SocietyInput = z.output<typeof societyInputSchema>;
type SocietyRow = typeof societies.$inferSelect;

/** `Kumar  Pebble-Park ` → `kumar pebble park`, for matching typed names. */
export function societyKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export async function listPublicSocieties(): Promise<PublicSociety[]> {
  const rows = await getDb()
    .select()
    .from(societies)
    .where(eq(societies.isActive, true))
    .orderBy(asc(societies.name));
  return rows.map((s) => ({
    id: s.id,
    name: s.name,
    area: s.area,
    city: s.city,
    pincode: s.pincode,
  }));
}

/** An onboarded, active society — for customers choosing one. */
export async function resolveSociety(db: DbOrTx, id: number): Promise<SocietyRow> {
  const [s] = await db.select().from(societies).where(eq(societies.id, id));
  if (!s || !s.isActive) {
    throw badRequest('Choose a society from the list', {
      fieldErrors: { societyId: ['This society is not available'] },
    });
  }
  return s;
}

async function assertWasher(db: DbOrTx, washerId: number | null | undefined) {
  if (!washerId) return;
  const [w] = await db.select().from(users).where(eq(users.id, washerId));
  if (!w || w.role !== 'WASHER') throw badRequest('Choose a washer');
  if (!w.isActive) throw badRequest(`${w.name} is deactivated`);
}

/** Active subscriptions running today (or later) for customers of the given societies. */
const liveSubsFor = (t: string) =>
  and(
    eq(subscriptions.status, 'ACTIVE'),
    gte(subscriptions.endDate, t),
    lte(subscriptions.startDate, t),
  );

async function buildDtos(rows: SocietyRow[]): Promise<SocietyDto[]> {
  if (!rows.length) return [];
  const db = getDb();
  const ids = rows.map((r) => r.id);
  const t = today();
  const [customerCounts, vehicleCounts, subRows, washerRows] = await Promise.all([
    db
      .select({ societyId: users.societyId, n: count() })
      .from(users)
      .where(and(inArray(users.societyId, ids), eq(users.role, 'USER')))
      .groupBy(users.societyId),
    db
      .select({ societyId: users.societyId, n: count() })
      .from(vehicles)
      .innerJoin(users, eq(users.id, vehicles.userId))
      .where(and(inArray(users.societyId, ids), eq(vehicles.isActive, true)))
      .groupBy(users.societyId),
    db
      .select({
        societyId: users.societyId,
        washerId: subscriptions.assignedWasherId,
        washerName: sql<
          string | null
        >`(select w.name from ${users} w where w.id = ${qualified(subscriptions.assignedWasherId)})`,
        n: count(),
      })
      .from(subscriptions)
      .innerJoin(users, eq(users.id, subscriptions.userId))
      .where(and(inArray(users.societyId, ids), liveSubsFor(t)))
      .groupBy(users.societyId, subscriptions.assignedWasherId),
    db
      .select({ id: users.id, name: users.name })
      .from(users)
      .where(
        inArray(
          users.id,
          rows.map((r) => r.defaultWasherId ?? 0),
        ),
      ),
  ]);
  const num = (list: { societyId: number | null; n: number }[], id: number) =>
    Number(list.find((x) => x.societyId === id)?.n ?? 0);

  return rows.map((s) => {
    const mine = subRows.filter((r) => r.societyId === s.id);
    return {
      id: s.id,
      name: s.name,
      area: s.area,
      city: s.city,
      pincode: s.pincode,
      addressLine: s.addressLine,
      notes: s.notes,
      isActive: s.isActive,
      defaultWasherId: s.defaultWasherId,
      defaultWasherName: washerRows.find((w) => w.id === s.defaultWasherId)?.name ?? null,
      customers: num(customerCounts, s.id),
      vehicles: num(vehicleCounts, s.id),
      activeSubscriptions: mine.reduce((a, r) => a + Number(r.n), 0),
      unassigned: Number(mine.find((r) => r.washerId === null)?.n ?? 0),
      washers: mine
        .filter((r) => r.washerId !== null)
        .map((r) => ({ id: r.washerId!, name: r.washerName ?? 'Washer', count: Number(r.n) }))
        .sort((a, b) => b.count - a.count),
      createdAt: s.createdAt.toISOString(),
    };
  });
}

export async function listSocieties(): Promise<SocietyDto[]> {
  const rows = await getDb()
    .select()
    .from(societies)
    .orderBy(sql`${societies.isActive} desc`, asc(societies.name));
  return buildDtos(rows);
}

export async function getSociety(id: number): Promise<SocietyDto> {
  const [row] = await getDb().select().from(societies).where(eq(societies.id, id));
  if (!row) throw notFound('Society');
  return (await buildDtos([row]))[0];
}

export async function getSocietyDetail(id: number): Promise<SocietyDetail> {
  const society = await getSociety(id);
  const db = getDb();
  const t = today();
  const [customers, subs, summary] = await Promise.all([
    db
      .select()
      .from(users)
      .where(and(eq(users.societyId, id), eq(users.role, 'USER')))
      .orderBy(asc(users.flatOrHouseNo), asc(users.name)),
    findSubscriptions(
      db,
      t,
      and(
        eq(users.societyId, id),
        eq(subscriptions.status, 'ACTIVE'),
        gte(subscriptions.endDate, t),
      ),
      { orderBy: [asc(subscriptions.startDate)] },
    ),
    todaySummary(),
  ]);
  const s = summary.bySociety.get(id);
  return {
    society,
    customers: customers.map(toUserDto),
    subscriptions: subs,
    today: {
      societyId: id,
      name: society.name,
      due: s?.due ?? 0,
      done: s?.done ?? 0,
      notDone: s?.notDone ?? 0,
      behind: s?.behind ?? 0,
    },
  };
}

/** Links customers whose typed society name matches, and syncs the shown name. */
async function linkCustomers(db: DbOrTx, society: SocietyRow, typedName: string): Promise<number> {
  const key = societyKey(typedName);
  const candidates = await db
    .select({ id: users.id, typed: users.societyOrBuilding })
    .from(users)
    .where(and(isNull(users.societyId), eq(users.role, 'USER')));
  const ids = candidates.filter((c) => c.typed && societyKey(c.typed) === key).map((c) => c.id);
  if (ids.length) {
    await db
      .update(users)
      .set({ societyId: society.id, societyOrBuilding: society.name })
      .where(inArray(users.id, ids));
  }
  return ids.length;
}

export async function createSociety(actorId: number, input: SocietyInput) {
  const db = getDb();
  try {
    const id = await db.transaction(async (tx) => {
      await assertWasher(tx, input.defaultWasherId);
      const [row] = await tx
        .insert(societies)
        .values({
          name: input.name,
          area: input.area,
          city: input.city,
          pincode: input.pincode,
          addressLine: input.addressLine,
          notes: input.notes,
          defaultWasherId: input.defaultWasherId ?? null,
          isActive: input.isActive,
        })
        .$returningId();
      const [society] = await tx.select().from(societies).where(eq(societies.id, row.id));
      const linked = input.linkUnlistedName
        ? await linkCustomers(tx, society, input.linkUnlistedName)
        : 0;
      await audit(tx, actorId, 'SOCIETY_CREATED', 'society', row.id, {
        name: input.name,
        defaultWasherId: input.defaultWasherId ?? null,
        linkedCustomers: linked,
      });
      return row.id;
    });
    return getSociety(id);
  } catch (err) {
    if (isDuplicateKey(err)) {
      throw conflict(`${input.name} in ${input.area} is already onboarded`, 'SOCIETY_EXISTS', {
        fieldErrors: { name: ['Already onboarded in this area'] },
      });
    }
    throw err;
  }
}

export async function updateSociety(actorId: number, id: number, input: SocietyInput) {
  const db = getDb();
  const before = await getSociety(id);
  try {
    await db.transaction(async (tx) => {
      await assertWasher(tx, input.defaultWasherId);
      await tx
        .update(societies)
        .set({
          name: input.name,
          area: input.area,
          city: input.city,
          pincode: input.pincode,
          addressLine: input.addressLine,
          notes: input.notes,
          defaultWasherId: input.defaultWasherId ?? null,
          isActive: input.isActive,
        })
        .where(eq(societies.id, id));
      if (input.name !== before.name) {
        await tx
          .update(users)
          .set({ societyOrBuilding: input.name })
          .where(eq(users.societyId, id));
      }
      const [society] = await tx.select().from(societies).where(eq(societies.id, id));
      if (input.linkUnlistedName) await linkCustomers(tx, society, input.linkUnlistedName);
      await audit(tx, actorId, 'SOCIETY_UPDATED', 'society', id, {
        before: {
          name: before.name,
          defaultWasherId: before.defaultWasherId,
          isActive: before.isActive,
        },
        after: {
          name: input.name,
          defaultWasherId: input.defaultWasherId ?? null,
          isActive: input.isActive,
        },
      });
    });
  } catch (err) {
    if (isDuplicateKey(err)) {
      throw conflict(`${input.name} in ${input.area} is already onboarded`, 'SOCIETY_EXISTS', {
        fieldErrors: { name: ['Already onboarded in this area'] },
      });
    }
    throw err;
  }
  return getSociety(id);
}

/** Assigns one washer to the society's running and upcoming subscriptions. */
export async function assignSocietyWasher(
  actorId: number,
  id: number,
  input: z.output<typeof societyAssignWasherSchema>,
): Promise<{ updated: number; society: SocietyDto }> {
  await getSociety(id);
  const db = getDb();
  const t = today();
  const updated = await db.transaction(async (tx) => {
    await assertWasher(tx, input.washerId);
    const targets = await tx
      .select({ id: subscriptions.id, from: subscriptions.assignedWasherId })
      .from(subscriptions)
      .innerJoin(users, eq(users.id, subscriptions.userId))
      .where(
        and(
          eq(users.societyId, id),
          eq(subscriptions.status, 'ACTIVE'),
          gte(subscriptions.endDate, t),
          input.onlyUnassigned ? isNull(subscriptions.assignedWasherId) : undefined,
        ),
      );
    if (targets.length) {
      await tx
        .update(subscriptions)
        .set({ assignedWasherId: input.washerId })
        .where(
          inArray(
            subscriptions.id,
            targets.map((x) => x.id),
          ),
        );
    }
    if (input.makeDefault) {
      await tx
        .update(societies)
        .set({ defaultWasherId: input.washerId })
        .where(eq(societies.id, id));
    }
    await audit(tx, actorId, 'SOCIETY_WASHER_ASSIGNED', 'society', id, {
      washerId: input.washerId,
      onlyUnassigned: input.onlyUnassigned,
      makeDefault: input.makeDefault,
      subscriptions: targets.map((x) => ({ id: x.id, from: x.from })),
    });
    return targets.length;
  });
  return { updated, society: await getSociety(id) };
}

/** Society names customers typed that aren't onboarded yet, grouped by name. */
export async function listUnlisted(): Promise<UnlistedSociety[]> {
  const db = getDb();
  const t = today();
  const rows = await db
    .select({
      id: users.id,
      typed: users.societyOrBuilding,
      area: users.area,
      city: users.city,
      pincode: users.pincode,
      live: sql<number>`(select count(*) from ${subscriptions} s where s.user_id = ${qualified(users.id)} and s.status = 'ACTIVE' and s.end_date >= ${t})`,
    })
    .from(users)
    .where(and(isNull(users.societyId), eq(users.role, 'USER')));
  const groups = new Map<string, UnlistedSociety>();
  for (const r of rows) {
    if (!r.typed) continue;
    const key = societyKey(r.typed);
    if (!key) continue;
    const g = groups.get(key) ?? {
      key,
      name: r.typed.trim(),
      area: r.area,
      city: r.city,
      pincode: r.pincode,
      customers: 0,
      activeSubscriptions: 0,
    };
    g.customers++;
    g.activeSubscriptions += Number(r.live);
    groups.set(key, g);
  }
  return [...groups.values()].sort(
    (a, b) => b.activeSubscriptions - a.activeSubscriptions || b.customers - a.customers,
  );
}

/** Default washer for a customer's society, if it's set and still active. */
export async function defaultWasherForUser(db: DbOrTx, userId: number): Promise<number | null> {
  const [row] = await db
    .select({ washerId: societies.defaultWasherId })
    .from(users)
    .innerJoin(societies, eq(societies.id, users.societyId))
    .where(eq(users.id, userId));
  if (!row?.washerId) return null;
  const [w] = await db.select().from(users).where(eq(users.id, row.washerId));
  return w && w.isActive && w.role === 'WASHER' ? w.id : null;
}

/**
 * The society columns to store for an address: a picked society (its name is
 * copied for display) or a typed name that isn't onboarded yet.
 * Returns undefined fields when the input doesn't touch the society.
 */
export async function societyFields(
  db: DbOrTx,
  input: { societyId?: number | null; societyOrBuilding?: string | null },
  opts: { allowInactive?: boolean } = {},
): Promise<{ societyId?: number | null; societyOrBuilding?: string | null }> {
  if (input.societyId) {
    const s = opts.allowInactive
      ? (await db.select().from(societies).where(eq(societies.id, input.societyId)))[0]
      : await resolveSociety(db, input.societyId);
    if (!s) throw notFound('Society');
    return { societyId: s.id, societyOrBuilding: s.name };
  }
  if (input.societyId === null || input.societyOrBuilding !== undefined) {
    return { societyId: null, societyOrBuilding: input.societyOrBuilding ?? null };
  }
  return {};
}
