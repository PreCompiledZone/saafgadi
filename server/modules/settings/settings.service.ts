import { inArray } from 'drizzle-orm';
import { SETTING_KEYS, type SettingKey } from '../../../shared/enums';
import type { z } from 'zod';
import type { settingsSchema } from '../../../shared/schemas';
import type { ContactInfo } from '../../../shared/types';
import { getConfig } from '../../config';
import { getDb } from '../../db';
import { settings } from '../../db/schema';
import { audit } from '../../lib/audit';

export type Settings = Record<SettingKey, string>;

export async function getSettings(): Promise<Settings> {
  const rows = await getDb()
    .select()
    .from(settings)
    .where(inArray(settings.key, [...SETTING_KEYS]));
  const out = Object.fromEntries(SETTING_KEYS.map((k) => [k, ''])) as Settings;
  for (const r of rows) out[r.key as SettingKey] = r.value;
  if (!out.business_name) out.business_name = getConfig().appName;
  return out;
}

export async function updateSettings(
  actorId: number,
  input: z.output<typeof settingsSchema>,
): Promise<Settings> {
  const db = getDb();
  await db.transaction(async (tx) => {
    for (const key of SETTING_KEYS) {
      const value = input[key] ?? '';
      await tx.insert(settings).values({ key, value }).onDuplicateKeyUpdate({ set: { value } });
    }
    await audit(tx, actorId, 'SETTINGS_UPDATED', 'settings', null, { keys: SETTING_KEYS });
  });
  return getSettings();
}

/** International format, digits only: 10 digits are assumed to be Indian (+91). */
export function toInternational(number: string): string {
  const digits = number.replace(/\D/g, '');
  if (!digits) return '';
  if (digits.length === 10) return `91${digits}`;
  if (digits.length === 11 && digits.startsWith('0')) return `91${digits.slice(1)}`;
  return digits;
}

export async function getContactInfo(): Promise<ContactInfo> {
  const s = await getSettings();
  return {
    appName: getConfig().appName,
    businessName: s.business_name,
    businessAddress: s.business_address,
    supportHours: s.support_hours,
    whatsappNumber: toInternational(s.whatsapp_number),
    callNumber: toInternational(s.call_number),
    whatsappDefaultMessage: s.whatsapp_default_message,
  };
}
