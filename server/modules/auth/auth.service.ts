import { eq } from 'drizzle-orm';
import type { z } from 'zod';
import { normaliseMobile } from '../../../shared/schemas/common';
import type { changePasswordSchema, loginSchema, signupSchema } from '../../../shared/schemas';
import type { SessionUser } from '../../../shared/types';
import { getDb, type DbOrTx } from '../../db';
import { users } from '../../db/schema';
import { AppError, badRequest, conflict, notFound } from '../../lib/errors';
import { hashPassword, verifyAgainstDummy, verifyPassword } from '../../lib/passwords';
import { societyFields } from '../societies/societies.service';
import { insertVehicle } from '../vehicles/vehicles.service';
import { toSessionUser } from '../users/users.repo';

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

export async function signup(input: z.output<typeof signupSchema>): Promise<SessionUser> {
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
  return toSessionUser(u);
}

const invalidLogin = () =>
  new AppError(401, 'INVALID_CREDENTIALS', 'Mobile number / email or password is incorrect');

export async function login(input: z.output<typeof loginSchema>): Promise<SessionUser> {
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
  return toSessionUser(u);
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
