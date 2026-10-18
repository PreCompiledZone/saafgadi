// Runs on every start; each step only inserts what is missing.
import { count, eq } from 'drizzle-orm';
import { getConfig } from '../config';
import { mobileSchema, optionalEmail, passwordSchema } from '../../shared/schemas/common';
import { DEFAULT_BOOKING_SLOTS, SETTING_KEYS, type SettingKey } from '../../shared/enums';
import { logger } from '../lib/logger';
import { hashPassword } from '../lib/passwords';
import { getDb } from './index';
import {
  oneTimeServicePrices,
  oneTimeServices,
  planActivities,
  planPrices,
  plans,
  settings,
  users,
} from './schema';

export async function seed(): Promise<void> {
  await seedAdmin();
  await seedPlans();
  await seedOneTimeServices();
  await seedSettings();
}

async function seedAdmin() {
  const db = getDb();
  const [{ n }] = await db.select({ n: count() }).from(users).where(eq(users.role, 'ADMIN'));
  if (n > 0) return;

  const { seedAdmin: s } = getConfig();
  if (!s.name || !s.mobile || !s.password) {
    logger.warn(
      'No admin account exists and SEED_ADMIN_NAME / SEED_ADMIN_MOBILE / SEED_ADMIN_PASSWORD are not all set — nobody can log in as admin until they are.',
    );
    return;
  }
  const mobile = mobileSchema.safeParse(s.mobile);
  const password = passwordSchema.safeParse(s.password);
  const email = optionalEmail.safeParse(s.email ?? '');
  if (!mobile.success || !password.success || !email.success) {
    logger.warn(
      'SEED_ADMIN_* values are invalid (mobile must be 10 digits, password at least 8 characters, email valid) — first admin not created.',
    );
    return;
  }
  await db.insert(users).values({
    name: s.name,
    mobile: mobile.data,
    email: email.data,
    passwordHash: await hashPassword(password.data),
    role: 'ADMIN',
  });
  logger.info(`Created first admin (${mobile.data}). Change the password after first login.`);
}

async function seedPlans() {
  const db = getDb();
  const [{ n }] = await db.select({ n: count() }).from(plans);
  if (n > 0) return;

  await db.transaction(async (tx) => {
    const [car] = await tx
      .insert(plans)
      .values({
        name: 'Car Care Plan',
        vehicleCategory: 'CAR',
        description:
          'Doorstep foam wash in your parking, every other day, plus a monthly interior clean.',
        sortOrder: 1,
      })
      .$returningId();
    await tx.insert(planActivities).values([
      {
        planId: car.id,
        name: 'Exterior foam wash',
        description: 'High-pressure gun wash with foam',
        quotaPerMonth: 15,
        minGapDays: 2,
        sortOrder: 1,
      },
      {
        planId: car.id,
        name: 'Interior clean & polish',
        description: 'Interior wash with vacuum cleaning and dashboard polish',
        quotaPerMonth: 1,
        minGapDays: 1,
        sortOrder: 2,
      },
    ]);
    await tx.insert(planPrices).values(
      (['HATCHBACK', 'SEDAN', 'SUV'] as const).map((vehicleType) => ({
        planId: car.id,
        vehicleType,
        monthlyPrice: '0.00',
      })),
    );

    const [bike] = await tx
      .insert(plans)
      .values({
        name: 'Bike Care Plan',
        vehicleCategory: 'BIKE',
        description: 'Doorstep exterior wash for your two-wheeler, every other day.',
        sortOrder: 2,
      })
      .$returningId();
    await tx.insert(planActivities).values({
      planId: bike.id,
      name: 'Exterior wash',
      description: 'Exterior wash',
      quotaPerMonth: 15,
      minGapDays: 2,
      sortOrder: 1,
    });
    await tx
      .insert(planPrices)
      .values({ planId: bike.id, vehicleType: 'BIKE', monthlyPrice: '0.00' });
  });
  logger.info('Seeded Car Care and Bike Care plans (prices are 0 until an admin sets them)');
}

/** Inactive with price 0, so nothing shows publicly until an admin prices and activates them. */
async function seedOneTimeServices() {
  const db = getDb();
  const [{ n }] = await db.select({ n: count() }).from(oneTimeServices);
  if (n > 0) return;
  const CARS = ['HATCHBACK', 'SEDAN', 'SUV'] as const;
  const services = [
    {
      name: 'Exterior foam wash',
      description: 'Foam wash at your parking spot.',
      includes: ['Foam wash', 'Rinse', 'Microfibre dry', 'Tyre wipe'],
      appliesTo: [...CARS, 'BIKE' as const],
      durationMinutes: 20,
    },
    {
      name: 'Interior clean',
      description: 'Inside cleaned and polished.',
      includes: ['Vacuum', 'Dashboard polish', 'Mats cleaned'],
      appliesTo: [...CARS],
      durationMinutes: 35,
    },
    {
      name: 'Full wash',
      description: 'Exterior foam wash and interior clean together.',
      includes: ['Exterior foam wash', 'Interior clean'],
      appliesTo: [...CARS],
      durationMinutes: 50,
    },
  ];
  await db.transaction(async (tx) => {
    for (const [i, s] of services.entries()) {
      const [row] = await tx
        .insert(oneTimeServices)
        .values({ ...s, isActive: false, sortOrder: i + 1 })
        .$returningId();
      await tx
        .insert(oneTimeServicePrices)
        .values(s.appliesTo.map((vehicleType) => ({ serviceId: row.id, vehicleType, price: 0 })));
    }
  });
  logger.info('Seeded one-time wash services (inactive, price 0 until an admin sets them)');
}

async function seedSettings() {
  const db = getDb();
  const { appName } = getConfig();
  const defaults: Record<SettingKey, string> = {
    whatsapp_number: '',
    call_number: '',
    business_name: appName,
    business_address: '',
    support_hours: '',
    whatsapp_default_message: `Hi ${appName}, I'd like to know more about your wash plans.`,
    show_washer_contact: 'true',
    support_email: '',
    booking_slots: JSON.stringify(DEFAULT_BOOKING_SLOTS),
    booking_allow_same_day: String(getConfig().booking.allowSameDay),
  };
  const existing = new Set(
    (await db.select({ key: settings.key }).from(settings)).map((r) => r.key),
  );
  const missing = SETTING_KEYS.filter((k) => !existing.has(k));
  if (missing.length) {
    await db.insert(settings).values(missing.map((key) => ({ key, value: defaults[key] })));
  }
}
