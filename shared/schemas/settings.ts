import { z } from 'zod';
import { BOOKING_SLOTS, DEFAULT_BOOKING_SLOTS } from '../enums';
import { optionalText, requiredText } from './common';

/** Phone numbers in settings: digits only after cleanup; 10 digits means India (+91). */
const phoneSetting = z
  .string()
  .trim()
  .nullish()
  .transform((v) => (v ? v.replace(/[^\d+]/g, '') : ''))
  .refine((v) => v === '' || /^\+?\d{10,13}$/.test(v), 'Enter a phone number, e.g. 9876543210');

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:MM');

export const slotSettingSchema = z
  .object({
    key: z.enum(BOOKING_SLOTS),
    label: requiredText(40, 'Enter a name'),
    start: hhmm,
    end: hhmm,
    enabled: z.boolean(),
  })
  .refine((s) => s.start < s.end, { path: ['end'], message: 'Must be after the start' });

/** Accepts the slot list or its stored JSON; stored as JSON. */
const slotsSetting = z
  .union([z.string(), z.array(z.unknown())])
  .nullish()
  .transform((v, ctx) => {
    if (v === null || v === undefined || v === '') return DEFAULT_BOOKING_SLOTS;
    try {
      return typeof v === 'string' ? (JSON.parse(v) as unknown) : v;
    } catch {
      ctx.addIssue({ code: 'custom', message: 'Invalid slot list' });
      return z.NEVER;
    }
  })
  .pipe(
    z
      .array(slotSettingSchema)
      .length(BOOKING_SLOTS.length)
      .refine((l) => new Set(l.map((s) => s.key)).size === l.length, 'Each slot once')
      .refine((l) => l.some((s) => s.enabled), 'Keep at least one slot on'),
  )
  .transform((l) => JSON.stringify(l));

const boolSetting = (fallback: boolean) =>
  z
    .union([z.boolean(), z.enum(['true', 'false'])])
    .default(fallback)
    .transform((v) => (String(v) === 'true' ? 'true' : 'false'));

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
  show_washer_contact: boolSetting(true),
  booking_slots: slotsSetting,
  booking_allow_same_day: boolSetting(false),
});
export type SettingsInput = z.input<typeof settingsSchema>;
