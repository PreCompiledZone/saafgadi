import { z } from 'zod';
import { PAYMENT_MODES } from '../enums';
import { idParam, isoDate, optionalText, paginationQuery } from './common';
import { paymentDetailsSchema } from './subscription';

export const recordPaymentSchema = paymentDetailsSchema.extend({
  userId: z.number().int().positive(),
  subscriptionId: z.number().int().positive().nullish(),
  notes: optionalText(1000),
});
export type RecordPaymentInput = z.input<typeof recordPaymentSchema>;

export const paymentListQuery = paginationQuery.extend({
  from: isoDate.optional(),
  to: isoDate.optional(),
  mode: z.enum(PAYMENT_MODES).optional(),
  userId: idParam.optional(),
});
