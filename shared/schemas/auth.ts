import { z } from 'zod';
import { OTP_PURPOSES } from '../enums';
import {
  mobileSchema,
  optionalEmail,
  requiredEmail,
  passwordSchema,
  pincodeSchema,
  requiredText,
  optionalText,
} from './common';
import { vehicleInputSchema } from './vehicle';

export const personalSchema = z.object({
  name: requiredText(120, 'Enter your name'),
  mobile: mobileSchema,
  email: optionalEmail,
  password: passwordSchema,
});

/**
 * Address fields. A customer either picks an onboarded society (`societyId`)
 * or types the name of one that isn't listed yet (`societyOrBuilding`).
 */
export const addressFields = z.object({
  societyId: z.coerce.number().int().positive().nullish(),
  societyOrBuilding: optionalText(160),
  flatOrHouseNo: requiredText(60, 'Enter your flat or house number'),
  addressLine: optionalText(255),
  area: requiredText(120, 'Enter your area'),
  city: requiredText(80, 'Enter your city'),
  pincode: pincodeSchema,
});

export function requireSociety(
  v: { societyId?: number | null; societyOrBuilding?: string | null },
  ctx: z.RefinementCtx,
) {
  if (!v.societyId && !v.societyOrBuilding) {
    ctx.addIssue({
      code: 'custom',
      path: ['societyOrBuilding'],
      message: 'Choose your society or type its name',
    });
  }
}

export const addressSchema = addressFields.superRefine(requireSociety);

/** Self sign-up step 1: the email was already verified, so it isn't asked again. */
export const signupDetailsSchema = personalSchema.omit({ email: true });

/** Self sign-up: email is required and must match the verified sign-up token. */
export const signupPersonalSchema = personalSchema.extend({ email: requiredEmail });

export const signupSchema = signupPersonalSchema
  .merge(addressFields)
  .extend({
    vehicles: z.array(vehicleInputSchema).max(10).default([]),
  })
  .superRefine(requireSociety);
export type SignupInput = z.input<typeof signupSchema>;

export const loginSchema = z.object({
  identifier: requiredText(190, 'Enter your mobile number or email'),
  password: z.string().min(1, 'Enter your password'),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Enter your current password'),
    newPassword: passwordSchema,
  })
  .refine((v) => v.currentPassword !== v.newPassword, {
    message: 'New password must be different',
    path: ['newPassword'],
  });

const otpCode = z
  .string()
  .trim()
  .regex(/^\d{4,8}$/, 'Enter the code from the email');

export const otpSendSchema = z.object({
  email: requiredEmail,
  purpose: z.enum(OTP_PURPOSES),
});

export const verifyEmailSchema = z.object({ code: otpCode });

export const verifySignupSchema = z.object({ email: requiredEmail, code: otpCode });

export const changeEmailSchema = z.object({ email: requiredEmail });

export const passwordResetSchema = z.object({
  email: requiredEmail,
  code: otpCode,
  newPassword: passwordSchema,
});
