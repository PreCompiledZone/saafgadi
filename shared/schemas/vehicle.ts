import { z } from 'zod';
import { CAR_TYPES, VEHICLE_CATEGORIES } from '../enums';
import { isValidRegistration, normaliseRegistration } from '../registration';
import { optionalText, requiredText } from './common';

export const registrationSchema = z
  .string()
  .transform(normaliseRegistration)
  .refine(isValidRegistration, 'Enter a valid number, e.g. MH 14 AB 1234 or 22 BH 1234 AA');

export const vehicleInputSchema = z
  .object({
    category: z.enum(VEHICLE_CATEGORIES),
    carType: z.enum(CAR_TYPES).nullish(),
    registrationNumber: registrationSchema,
    make: requiredText(60, 'Enter the make'),
    model: requiredText(60, 'Enter the model'),
    color: requiredText(40, 'Enter the colour'),
    parkingNotes: optionalText(255),
  })
  .superRefine((v, ctx) => {
    if (v.category === 'CAR' && !v.carType) {
      ctx.addIssue({ code: 'custom', path: ['carType'], message: 'Choose the car type' });
    }
  })
  .transform((v) => ({ ...v, carType: v.category === 'CAR' ? (v.carType ?? null) : null }));
export type VehicleInput = z.input<typeof vehicleInputSchema>;

export const adminVehicleUpdateSchema = z
  .object({
    category: z.enum(VEHICLE_CATEGORIES),
    carType: z.enum(CAR_TYPES).nullish(),
    registrationNumber: registrationSchema,
    make: requiredText(60),
    model: requiredText(60),
    color: requiredText(40),
    parkingNotes: optionalText(255),
    isActive: z.boolean(),
  })
  .superRefine((v, ctx) => {
    if (v.category === 'CAR' && !v.carType) {
      ctx.addIssue({ code: 'custom', path: ['carType'], message: 'Choose the car type' });
    }
  })
  .transform((v) => ({ ...v, carType: v.category === 'CAR' ? (v.carType ?? null) : null }));
