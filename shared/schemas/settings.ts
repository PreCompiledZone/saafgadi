import { z } from 'zod';
import { optionalText, requiredText } from './common';

/** Phone numbers in settings: digits only after cleanup; 10 digits means India (+91). */
const phoneSetting = z
  .string()
  .trim()
  .nullish()
  .transform((v) => (v ? v.replace(/[^\d+]/g, '') : ''))
  .refine((v) => v === '' || /^\+?\d{10,13}$/.test(v), 'Enter a phone number, e.g. 9876543210');

export const settingsSchema = z.object({
  whatsapp_number: phoneSetting,
  call_number: phoneSetting,
  business_name: requiredText(120),
  business_address: optionalText(255).transform((v) => v ?? ''),
  support_hours: optionalText(120).transform((v) => v ?? ''),
  whatsapp_default_message: optionalText(500).transform((v) => v ?? ''),
  /** Shown in the public footer. */
  support_email: z
    .string()
    .trim()
    .toLowerCase()
    .nullish()
    .transform((v) => v ?? '')
    .refine(
      (v) => v === '' || z.string().email().max(190).safeParse(v).success,
      'Enter a valid email',
    ),
  /** Stored as 'true' / 'false'. */
  show_washer_contact: z
    .union([z.boolean(), z.enum(['true', 'false'])])
    .default(true)
    .transform((v) => (String(v) === 'true' ? 'true' : 'false')),
});
export type SettingsInput = z.input<typeof settingsSchema>;
