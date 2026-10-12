import { z } from 'zod';
import { ROLES } from '../enums';
import {
  mobileSchema,
  optionalEmail,
  paginationQuery,
  passwordSchema,
  requiredText,
} from './common';
import { addressFields, requireSociety } from './auth';

export const profileUpdateSchema = z
  .object({
    name: requiredText(120, 'Enter your name'),
    email: optionalEmail,
  })
  .merge(addressFields)
  .superRefine(requireSociety);

export const staffCreateSchema = z.object({
  name: requiredText(120),
  mobile: mobileSchema,
  email: optionalEmail,
  password: passwordSchema,
});

export const adminCreateSchema = staffCreateSchema.extend({
  confirmOverLimit: z.boolean().default(false),
});

export const staffUpdateSchema = z.object({
  name: requiredText(120),
  mobile: mobileSchema,
  email: optionalEmail,
  isActive: z.boolean(),
});

export const adminUserUpdateSchema = staffUpdateSchema.merge(addressFields.partial());

export const resetPasswordSchema = z.object({ password: passwordSchema });

export const userListQuery = paginationQuery.extend({
  role: z.enum(ROLES).optional(),
});
