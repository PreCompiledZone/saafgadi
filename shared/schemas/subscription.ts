import { z } from 'zod';
import { PAYMENT_MODES, SUBSCRIPTION_MONTH_OPTIONS } from '../enums';
import { amountSchema, isoDate, optionalText } from './common';

export const monthsSchema = z.coerce
  .number()
  .int()
  .refine(
    (m) => (SUBSCRIPTION_MONTH_OPTIONS as readonly number[]).includes(m),
    'Choose 1, 3, 6 or 12',
  );

export const paymentDetailsSchema = z.object({
  amount: amountSchema.refine((v) => v > 0, 'Enter the amount received'),
  mode: z.enum(PAYMENT_MODES),
  reference: optionalText(120),
  paidOn: isoDate,
});

const paymentChoice = z
  .object({
    withoutPayment: z.boolean().default(false),
    withoutPaymentReason: optionalText(255),
    payment: paymentDetailsSchema.nullish(),
    notes: optionalText(1000),
    washerId: z.number().int().positive().nullish(),
  })
  .superRefine((v, ctx) => {
    if (v.withoutPayment) {
      if (!v.withoutPaymentReason) {
        ctx.addIssue({
          code: 'custom',
          path: ['withoutPaymentReason'],
          message: 'Say why there is no payment',
        });
      }
    } else if (!v.payment) {
      ctx.addIssue({ code: 'custom', path: ['payment'], message: 'Enter payment details' });
    }
  });

export const activateSubscriptionSchema = z
  .object({
    userId: z.number().int().positive(),
    vehicleId: z.number().int().positive(),
    planId: z.number().int().positive(),
    months: monthsSchema,
    startDate: isoDate,
  })
  .and(paymentChoice);
export type ActivateSubscriptionInput = z.input<typeof activateSubscriptionSchema>;

export const renewSubscriptionSchema = z
  .object({
    months: monthsSchema,
    planId: z.number().int().positive().optional(),
  })
  .and(paymentChoice);

export const cancelSubscriptionSchema = z.object({
  reason: optionalText(255),
});

export const assignWasherSchema = z.object({
  washerId: z.number().int().positive().nullable(),
});
