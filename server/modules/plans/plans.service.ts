import { and, asc, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { CAR_TYPES, type VehicleType } from '../../../shared/enums';
import { planActivitiesSchema, planPricesSchema, planUpdateSchema } from '../../../shared/schemas';
import type { PlanDto } from '../../../shared/types';
import { getDb } from '../../db';
import { planActivities, planPrices, plans } from '../../db/schema';
import { audit } from '../../lib/audit';
import { badRequest, notFound } from '../../lib/errors';
import { toDecimal, toNumber } from '../../lib/money';

export async function listPlans(opts: { publicOnly: boolean }): Promise<PlanDto[]> {
  const db = getDb();
  const planRows = await db
    .select()
    .from(plans)
    .where(opts.publicOnly ? eq(plans.isActive, true) : undefined)
    .orderBy(asc(plans.sortOrder), asc(plans.id));
  if (!planRows.length) return [];
  const ids = planRows.map((p) => p.id);
  const [acts, prices] = await Promise.all([
    db
      .select()
      .from(planActivities)
      .where(
        and(
          inArray(planActivities.planId, ids),
          opts.publicOnly ? eq(planActivities.isActive, true) : undefined,
        ),
      )
      .orderBy(asc(planActivities.sortOrder), asc(planActivities.id)),
    db
      .select()
      .from(planPrices)
      .where(
        and(
          inArray(planPrices.planId, ids),
          opts.publicOnly ? eq(planPrices.isActive, true) : undefined,
        ),
      ),
  ]);
  const order: VehicleType[] = ['HATCHBACK', 'SEDAN', 'SUV', 'BIKE'];
  return planRows.map((p) => ({
    id: p.id,
    name: p.name,
    vehicleCategory: p.vehicleCategory,
    description: p.description,
    isActive: p.isActive,
    sortOrder: p.sortOrder,
    activities: acts
      .filter((a) => a.planId === p.id)
      .map((a) => ({
        id: a.id,
        name: a.name,
        description: a.description,
        quotaPerMonth: a.quotaPerMonth,
        minGapDays: a.minGapDays,
        sortOrder: a.sortOrder,
        isActive: a.isActive,
      })),
    prices: prices
      .filter((r) => r.planId === p.id)
      .sort((a, b) => order.indexOf(a.vehicleType) - order.indexOf(b.vehicleType))
      .map((r) => ({
        vehicleType: r.vehicleType,
        monthlyPrice: toNumber(r.monthlyPrice),
        isActive: r.isActive,
      })),
  }));
}

export async function getPlan(id: number): Promise<PlanDto> {
  const plan = (await listPlans({ publicOnly: false })).find((p) => p.id === id);
  if (!plan) throw notFound('Plan');
  return plan;
}

export async function updatePlan(
  actorId: number,
  id: number,
  input: z.output<typeof planUpdateSchema>,
) {
  await getPlan(id);
  const db = getDb();
  await db.update(plans).set(input).where(eq(plans.id, id));
  await audit(db, actorId, 'PLAN_UPDATED', 'plan', id, input);
  return getPlan(id);
}

/**
 * Replaces the plan's activity list. Activities can't be deleted (wash logs
 * point at them), so ones left out are deactivated instead.
 */
export async function replaceActivities(
  actorId: number,
  id: number,
  input: z.output<typeof planActivitiesSchema>,
) {
  const plan = await getPlan(id);
  const existingIds = new Set(plan.activities.map((a) => a.id));
  for (const a of input.activities) {
    if (a.id && !existingIds.has(a.id))
      throw badRequest(`Activity ${a.id} does not belong to this plan`);
  }
  const db = getDb();
  await db.transaction(async (tx) => {
    const kept = new Set<number>();
    for (const a of input.activities) {
      const values = {
        name: a.name,
        description: a.description,
        quotaPerMonth: a.quotaPerMonth,
        minGapDays: a.minGapDays,
        sortOrder: a.sortOrder,
        isActive: a.isActive,
      };
      if (a.id) {
        kept.add(a.id);
        await tx.update(planActivities).set(values).where(eq(planActivities.id, a.id));
      } else {
        await tx.insert(planActivities).values({ ...values, planId: id });
      }
    }
    const dropped = [...existingIds].filter((x) => !kept.has(x));
    if (dropped.length) {
      await tx
        .update(planActivities)
        .set({ isActive: false })
        .where(inArray(planActivities.id, dropped));
    }
    await audit(tx, actorId, 'ACTIVITIES_UPDATED', 'plan', id, {
      before: plan.activities,
      after: input.activities,
    });
  });
  return getPlan(id);
}

export async function replacePrices(
  actorId: number,
  id: number,
  input: z.output<typeof planPricesSchema>,
) {
  const plan = await getPlan(id);
  const allowed: VehicleType[] = plan.vehicleCategory === 'CAR' ? [...CAR_TYPES] : ['BIKE'];
  for (const p of input.prices) {
    if (!allowed.includes(p.vehicleType)) {
      throw badRequest(`${p.vehicleType} prices don't apply to ${plan.name}`);
    }
  }
  const db = getDb();
  await db.transaction(async (tx) => {
    for (const p of input.prices) {
      const monthlyPrice = toDecimal(p.monthlyPrice);
      await tx
        .insert(planPrices)
        .values({ planId: id, vehicleType: p.vehicleType, monthlyPrice, isActive: p.isActive })
        .onDuplicateKeyUpdate({ set: { monthlyPrice, isActive: p.isActive } });
    }
    await audit(tx, actorId, 'PRICE_CHANGED', 'plan', id, {
      before: plan.prices,
      after: input.prices,
    });
  });
  return getPlan(id);
}
