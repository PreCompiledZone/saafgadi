import { z } from 'zod';
import { VEHICLE_TYPES } from '../enums';
import { amountSchema, optionalText, requiredText } from './common';

export const planUpdateSchema = z.object({
  name: requiredText(80),
  description: optionalText(1000),
  isActive: z.boolean(),
  sortOrder: z.coerce.number().int().min(0).max(1000).default(0),
});

export const planActivityInputSchema = z.object({
  id: z.number().int().positive().optional(),
  name: requiredText(120),
  description: optionalText(500),
  quotaPerMonth: z.coerce.number().int().min(1, 'At least 1').max(62),
  minGapDays: z.coerce.number().int().min(1, 'At least 1').max(31).default(1),
  sortOrder: z.coerce.number().int().min(0).max(1000).default(0),
  isActive: z.boolean().default(true),
});
export const planActivitiesSchema = z.object({
  activities: z.array(planActivityInputSchema).min(1, 'A plan needs at least one activity').max(20),
});

export const planPricesSchema = z.object({
  prices: z
    .array(
      z.object({
        vehicleType: z.enum(VEHICLE_TYPES),
        monthlyPrice: amountSchema,
        isActive: z.boolean().default(true),
      }),
    )
    .min(1)
    .max(VEHICLE_TYPES.length),
});
