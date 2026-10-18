import { z } from 'zod';
import { PAYMENT_MODES } from '../enums';
import { idParam, isoDate, optionalText, paginationQuery } from './common';
import { paymentDetailsSchema } from './subscription';

export const recordPaymentSchema = paymentDetailsSchema
  .extend({
    userId: z.number().int().positive(),
    subscriptionId: z.number().int().positive().nullish(),
    /** A one-time booking; a payment is for a subscription or a booking, not both. */
    bookingId: z.number().int().positive().nullish(),
    notes: optionalText(1000),
  })
  .refine((p) => !(p.subscriptionId && p.bookingId), {
    path: ['bookingId'],
    message: 'A payment is for a subscription or a booking, not both',
  });
export type RecordPaymentInput = z.input<typeof recordPaymentSchema>;

export const paymentListQuery = paginationQuery.extend({
  from: isoDate.optional(),
  to: isoDate.optional(),
  mode: z.enum(PAYMENT_MODES).optional(),
  userId: idParam.optional(),
});
