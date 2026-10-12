import { sql } from 'drizzle-orm';
import { qualified } from '../../lib/sql';
import { vehicleTypeOf } from '../../../shared/enums';
import { formatRegistration } from '../../../shared/registration';
import type { VehicleDto } from '../../../shared/types';
import { subscriptions, vehicles } from '../../db/schema';

export const hasSubscriptionSql = sql<number>`exists(select 1 from ${subscriptions} where ${qualified(subscriptions.vehicleId)} = ${qualified(vehicles.id)})`;

export function toVehicleDto(
  v: typeof vehicles.$inferSelect,
  hasSubscription: number | boolean | string,
  owner?: { name: string; mobile: string },
): VehicleDto {
  return {
    id: v.id,
    userId: v.userId,
    category: v.category,
    carType: v.carType,
    vehicleType: vehicleTypeOf(v.category, v.carType),
    registrationNumber: formatRegistration(v.registrationNumber),
    make: v.make,
    model: v.model,
    color: v.color,
    parkingNotes: v.parkingNotes,
    isActive: v.isActive,
    hasSubscription: Number(hasSubscription) === 1 || hasSubscription === true,
    ...(owner ? { ownerName: owner.name, ownerMobile: owner.mobile } : {}),
  };
}
