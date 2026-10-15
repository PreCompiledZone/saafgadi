import { eq } from 'drizzle-orm';
import type { z } from 'zod';
import { normaliseMobile } from '../../../shared/schemas/common';
import type {
  changeEmailSchema,
  changePasswordSchema,
  loginSchema,
  otpSendSchema,
  passwordResetSchema,
  signupSchema,
} from '../../../shared/schemas';
import type { SessionUser } from '../../../shared/types';
import { getDb, type DbOrTx } from '../../db';
import { users } from '../../db/schema';
import { now } from '../../lib/clock';
import { AppError, badRequest, conflict, notFound } from '../../lib/errors';
import { hashPassword, verifyAgainstDummy, verifyPassword } from '../../lib/passwords';
import { societyFields } from '../societies/societies.service';
import { insertVehicle } from '../vehicles/vehicles.service';
import { toSessionUser } from '../users/users.repo';
import { consumeCode, issueCode, normaliseEmail } from './otp.service';

/** What a route needs to sign the session cookie. */
export interface SignedIn {
  user: SessionUser;
  tokenVersion: number;
}

export async function assertContactFree(
  db: DbOrTx,
  mobile: string,
  email: string | null,
  exceptId?: number,
) {
  const [m] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.mobile, mobile))
    .limit(1);
  if (m && m.id !== exceptId) {
    throw conflict('An account with this mobile number already exists', 'MOBILE_TAKEN', {
      fieldErrors: { mobile: ['Already registered — log in instead'] },
    });
  }
  if (email) {
    const [e] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);
    if (e && e.id !== exceptId) {
      throw conflict('An account with this email already exists', 'EMAIL_TAKEN', {
        fieldErrors: { email: ['Already registered'] },
      });
    }
  }
}

export async function signup(input: z.output<typeof signupSchema>): Promise<SignedIn> {
  const regs = input.vehicles.map((v) => v.registrationNumber);
  if (new Set(regs).size !== regs.length) {
    throw badRequest('The same registration number was entered twice');
  }
  const db = getDb();
  const passwordHash = await hashPassword(input.password);
  const id = await db.transaction(async (tx) => {
    await assertContactFree(tx, input.mobile, input.email);
    const [row] = await tx
      .insert(users)
      .values({
        name: input.name,
        mobile: input.mobile,
        email: input.email,
        passwordHash,
        role: 'USER',
        addressLine: input.addressLine,
        ...(await societyFields(tx, input)),
        flatOrHouseNo: input.flatOrHouseNo,
        area: input.area,
        city: input.city,
        pincode: input.pincode,
        lastLoginAt: new Date(),
      })
      .$returningId();
    for (const v of input.vehicles) await insertVehicle(tx, row.id, v);
    return row.id;
  });
  const [u] = await db.select().from(users).where(eq(users.id, id));
  return { user: toSessionUser(u), tokenVersion: u.tokenVersion };
}

const invalidLogin = () =>
  new AppError(401, 'INVALID_CREDENTIALS', 'Mobile number / email or password is incorrect');

export async function login(input: z.output<typeof loginSchema>): Promise<SignedIn> {
  const db = getDb();
  const id = input.identifier.trim();
  const where = id.includes('@')
    ? eq(users.email, id.toLowerCase())
    : eq(users.mobile, normaliseMobile(id));
  const [u] = await db.select().from(users).where(where).limit(1);
  if (!u) {
    await verifyAgainstDummy(input.password);
    throw invalidLogin();
  }
  if (!(await verifyPassword(input.password, u.passwordHash))) throw invalidLogin();
  if (!u.isActive) {
    throw new AppError(
      403,
      'ACCOUNT_INACTIVE',
      'This account has been deactivated. Please contact us.',
    );
  }
  await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, u.id));
  return { user: toSessionUser(u), tokenVersion: u.tokenVersion };
}

export async function changePassword(userId: number, input: z.output<typeof changePasswordSchema>) {
  const db = getDb();
  const [u] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!u) throw notFound('User');
  if (!(await verifyPassword(input.currentPassword, u.passwordHash))) {
    throw badRequest(
      'Current password is incorrect',
      {
        fieldErrors: { currentPassword: ['Incorrect password'] },
      },
      'WRONG_PASSWORD',
    );
  }
  await db
    .update(users)
    .set({ passwordHash: await hashPassword(input.newPassword) })
    .where(eq(users.id, userId));
}

// ------------------------------------------------------------ email codes

/**
 * VERIFY_EMAIL: for the logged-in user's own email. RESET_PASSWORD: public, and
 * the response never reveals whether the email belongs to an account.
 */
export async function requestCode(
  input: z.output<typeof otpSendSchema>,
  ip: string,
  sessionUserId: number | undefined,
): Promise<void> {
  const db = getDb();
  const email = normaliseEmail(input.email);
  if (input.purpose === 'VERIFY_EMAIL') {
    if (!sessionUserId) throw new AppError(401, 'UNAUTHORIZED', 'Please log in');
    const [u] = await db.select().from(users).where(eq(users.id, sessionUserId)).limit(1);
    if (!u || !u.email || normaliseEmail(u.email) !== email) {
      throw badRequest('That is not the email on your account');
    }
    if (u.emailVerifiedAt)
      throw badRequest('Your email is already verified', undefined, 'ALREADY_VERIFIED');
    await issueCode({
      destination: email,
      purpose: 'VERIFY_EMAIL',
      userId: u.id,
      ip,
      deliver: true,
    });
    return;
  }
  const [u] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  const known = !!u && u.isActive;
  await issueCode({
    destination: email,
    purpose: 'RESET_PASSWORD',
    userId: known ? u.id : null,
    ip,
    deliver: known,
  });
}

export async function verifyEmail(userId: number, code: string): Promise<SessionUser> {
  const db = getDb();
  const [u] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!u) throw notFound('User');
  if (!u.email) throw badRequest('Add an email to your account first');
  await consumeCode({ destination: u.email, purpose: 'VERIFY_EMAIL', code });
  await db.update(users).set({ emailVerifiedAt: now() }).where(eq(users.id, userId));
  const [fresh] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  return toSessionUser(fresh);
}

/** Sets a new password and signs the account out everywhere. */
export async function resetPassword(input: z.output<typeof passwordResetSchema>): Promise<void> {
  const db = getDb();
  const email = normaliseEmail(input.email);
  const row = await consumeCode({
    destination: email,
    purpose: 'RESET_PASSWORD',
    code: input.code,
  });
  const [u] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (!u || !u.isActive || row.userId !== u.id) throw invalidResetCode();
  await db
    .update(users)
    .set({
      passwordHash: await hashPassword(input.newPassword),
      tokenVersion: u.tokenVersion + 1,
      // The code reached this inbox, so the email is proven too.
      emailVerifiedAt: u.emailVerifiedAt ?? now(),
    })
    .where(eq(users.id, u.id));
}

const invalidResetCode = () =>
  new AppError(400, 'INVALID_CODE', 'Code is invalid or expired', {
    fieldErrors: { code: ['Code is invalid or expired'] },
  });

/** "Wrong email? Change it" during sign-up: replaces an unverified email. */
export async function changeEmail(
  userId: number,
  input: z.output<typeof changeEmailSchema>,
): Promise<SessionUser> {
  const db = getDb();
  const [u] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!u) throw notFound('User');
  await assertContactFree(db, u.mobile, input.email, userId);
  if (u.email !== input.email) {
    await db
      .update(users)
      .set({ email: input.email, emailVerifiedAt: null })
      .where(eq(users.id, userId));
  }
  const [fresh] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  return toSessionUser(fresh);
}
