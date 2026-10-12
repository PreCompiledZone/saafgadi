import { z } from 'zod';

/** Strips spaces, dashes and a leading +91 / 91 / 0. */
export function normaliseMobile(input: string): string {
  const digits = input.replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) return digits.slice(2);
  if (digits.length === 11 && digits.startsWith('0')) return digits.slice(1);
  return digits;
}

export const mobileSchema = z
  .string()
  .transform(normaliseMobile)
  .pipe(z.string().regex(/^[6-9][0-9]{9}$/, 'Enter a 10-digit mobile number'));

export const passwordSchema = z
  .string()
  .min(8, 'Use at least 8 characters')
  .max(72, 'Use at most 72 characters');

/** Optional free text: empty strings become null. */
export const optionalText = (max = 255) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => (v ? v : null));

export const requiredText = (max = 255, message = 'Required') =>
  z.string().trim().min(1, message).max(max);

export const optionalEmail = z
  .string()
  .trim()
  .toLowerCase()
  .nullish()
  .transform((v) => (v ? v : null))
  .pipe(z.string().email('Enter a valid email').max(190).nullable());

export const pincodeSchema = z
  .string()
  .trim()
  .regex(/^[1-9][0-9]{5}$/, 'Enter a 6-digit pincode');

/** Business date, `YYYY-MM-DD`. */
export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');

export const idParam = z.coerce.number().int().positive();

export const paginationQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(25),
  search: z.string().trim().max(100).optional(),
});

/** Money in INR, at most 2 decimals. */
export const amountSchema = z.coerce
  .number({ invalid_type_error: 'Enter an amount' })
  .min(0, 'Cannot be negative')
  .max(10_000_000)
  .refine((v) => Math.abs(v * 100 - Math.round(v * 100)) < 1e-6, 'At most 2 decimals');
