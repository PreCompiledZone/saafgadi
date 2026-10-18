import { z } from 'zod';
import {
  BOOKING_PAYMENT_STATUSES,
  BOOKING_SLOTS,
  BOOKING_STATUSES,
  CAR_TYPES,
  VEHICLE_CATEGORIES,
  VEHICLE_TYPES,
} from '../enums';
import {
  idParam,
  isoDate,
  optionalText,
  paginationQuery,
  pincodeSchema,
  requiredText,
} from './common';
import { registrationSchema } from './vehicle';

// ------------------------------------------------------------ services

export const oneTimeServiceSchema = z
  .object({
    name: requiredText(120, 'Enter a name'),
    description: optionalText(500),
    includes: z.array(requiredText(80)).max(12).default([]),
    appliesTo: z
      .array(z.enum(VEHICLE_TYPES))
      .min(1, 'Pick at least one vehicle type')
      .transform((l) => VEHICLE_TYPES.filter((t) => l.includes(t))),
    durationMinutes: z.coerce
      .number({ invalid_type_error: 'Enter minutes' })
      .int()
      .min(5, 'At least 5 minutes')
      .max(480),
    isActive: z.boolean().default(false),
    sortOrder: z.coerce.number().int().min(0).max(1000).default(0),
    /** Whole rupees, one per vehicle type in `appliesTo`. */
    prices: z.array(
      z.object({
        vehicleType: z.enum(VEHICLE_TYPES),
        price: z.coerce.number().int('Whole rupees only').min(0).max(1_000_000),
      }),
    ),
  })
  .superRefine((s, ctx) => {
    for (const t of s.appliesTo) {
      if (!s.prices.some((p) => p.vehicleType === t)) {
        ctx.addIssue({ code: 'custom', path: ['prices'], message: `Enter a price for ${t}` });
      }
    }
  })
  .transform((s) => ({
    ...s,
    prices: s.prices.filter((p) => s.appliesTo.includes(p.vehicleType)),
  }));
export type OneTimeServiceInput = z.input<typeof oneTimeServiceSchema>;

// ------------------------------------------------------------ bookings

export const bookingCreateSchema = z
  .object({
    serviceId: z.number().int().positive(),
    /** A vehicle saved on the account; the vehicle fields below are then ignored. */
    vehicleId: z.number().int().positive().nullish(),
    category: z.enum(VEHICLE_CATEGORIES).nullish(),
    carType: z.enum(CAR_TYPES).nullish(),
    registrationNumber: z.string().nullish(),
    vehicleColor: optionalText(40),
    vehicleMake: optionalText(60),
    vehicleModel: optionalText(60),
    /** Also add the entered vehicle to the account. */
    saveVehicle: z.boolean().default(false),
    addressLine: optionalText(255),
    societyOrBuilding: requiredText(160, 'Enter your society or building'),
    flatOrHouseNo: requiredText(60, 'Enter your flat or house number'),
    area: requiredText(120, 'Enter your area'),
    city: requiredText(80, 'Enter your city'),
    pincode: pincodeSchema,
    parkingNotes: optionalText(255),
    preferredDate: isoDate,
    preferredSlot: z.enum(BOOKING_SLOTS),
    customerNotes: optionalText(500),
  })
  .superRefine((b, ctx) => {
    if (b.vehicleId) return;
    const need = (path: string, message: string) =>
      ctx.addIssue({ code: 'custom', path: [path], message });
    if (!b.category) need('category', 'Choose car or bike');
    if (b.category === 'CAR' && !b.carType) need('carType', 'Choose the car type');
    const reg = registrationSchema.safeParse(b.registrationNumber ?? '');
    if (!reg.success) need('registrationNumber', reg.error.issues[0].message);
    if (!b.vehicleColor) need('vehicleColor', 'Enter the colour so the washer can find it');
    if (b.saveVehicle) {
      if (!b.vehicleMake) need('vehicleMake', 'Enter the make to save this vehicle');
      if (!b.vehicleModel) need('vehicleModel', 'Enter the model to save this vehicle');
    }
  })
  .transform((b) => ({
    ...b,
    vehicleId: b.vehicleId ?? null,
    carType: b.category === 'CAR' ? (b.carType ?? null) : null,
    registrationNumber: b.vehicleId ? null : registrationSchema.parse(b.registrationNumber ?? ''),
  }));
export type BookingCreateInput = z.input<typeof bookingCreateSchema>;

export const bookingListQuery = z.object({
  status: z.enum(BOOKING_STATUSES).optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
  reg: z.string().trim().max(20).optional(),
});

export const WASH_TYPES = ['all', 'monthly', 'one_time'] as const;
export const WASH_STATUS_GROUPS = ['upcoming', 'completed', 'cancelled'] as const;
export type WashType = (typeof WASH_TYPES)[number];
export type WashStatusGroup = (typeof WASH_STATUS_GROUPS)[number];

export const myWashesQuery = paginationQuery.extend({
  type: z.enum(WASH_TYPES).default('all'),
  reg: z.string().trim().max(20).optional(),
  status: z.enum(WASH_STATUS_GROUPS).optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
});

export const adminBookingQuery = paginationQuery.extend({
  status: z.enum(BOOKING_STATUSES).optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
  slot: z.enum(BOOKING_SLOTS).optional(),
  area: z.string().trim().max(120).optional(),
  washerId: idParam.optional(),
  paymentStatus: z.enum(BOOKING_PAYMENT_STATUSES).optional(),
  serviceId: idParam.optional(),
  userId: idParam.optional(),
});

export const bookingConfirmSchema = z.object({
  washerId: z.number().int().positive(),
  date: isoDate,
  slot: z.enum(BOOKING_SLOTS),
  adminNotes: optionalText(1000),
});

export const bookingRescheduleSchema = z.object({
  date: isoDate,
  slot: z.enum(BOOKING_SLOTS),
  washerId: z.number().int().positive().nullish(),
  adminNotes: optionalText(1000),
});

export const reasonSchema = z.object({
  reason: requiredText(255, 'Give a reason'),
});
