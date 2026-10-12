import { z } from 'zod';
import { NOT_DONE_REASONS, WASH_STATUSES } from '../enums';
import { idParam, isoDate, optionalText, paginationQuery } from './common';

const statusFields = z
  .object({
    status: z.enum(WASH_STATUSES),
    reason: z.enum(NOT_DONE_REASONS).nullish(),
    notes: optionalText(500),
  })
  .superRefine((v, ctx) => {
    if (v.status === 'NOT_DONE' && !v.reason) {
      ctx.addIssue({ code: 'custom', path: ['reason'], message: 'Choose a reason' });
    }
  })
  .transform((v) => ({ ...v, reason: v.status === 'NOT_DONE' ? (v.reason ?? null) : null }));

/** The client never sends a date: service date is today and time is server time. */
export const washerLogCreateSchema = z
  .object({
    subscriptionId: z.number().int().positive(),
    planActivityId: z.number().int().positive(),
  })
  .and(statusFields);

export const washLogUpdateSchema = statusFields;

export const adminWashLogQuery = paginationQuery.extend({
  date: isoDate.optional(),
  washerId: idParam.optional(),
  vehicleId: idParam.optional(),
  societyId: idParam.optional(),
});
