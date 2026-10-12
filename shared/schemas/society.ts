import { z } from 'zod';
import { idParam, optionalText, paginationQuery, pincodeSchema, requiredText } from './common';

export const societyInputSchema = z.object({
  name: requiredText(160, 'Enter the society name'),
  area: requiredText(120, 'Enter the area'),
  city: requiredText(80, 'Enter the city'),
  pincode: pincodeSchema,
  addressLine: optionalText(255),
  notes: optionalText(1000),
  defaultWasherId: z.number().int().positive().nullish(),
  isActive: z.boolean().default(true),
  /** When onboarding a typed name: link customers who typed this name. */
  linkUnlistedName: optionalText(160),
});
export type SocietyInput = z.input<typeof societyInputSchema>;

export const societyAssignWasherSchema = z.object({
  washerId: z.number().int().positive().nullable(),
  /** Only fill subscriptions that have no washer yet. */
  onlyUnassigned: z.boolean().default(false),
  /** Also make this washer the society's default for new plans. */
  makeDefault: z.boolean().default(true),
});

export const societyListQuery = paginationQuery.extend({
  includeInactive: z.coerce.boolean().default(true),
});

export const societyFilter = z.object({ societyId: idParam.optional() });
