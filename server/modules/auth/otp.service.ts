// One-time codes: issue, rate-limit and check. Only an HMAC of each code is
// stored; codes come from crypto.randomInt and are compared in constant time.
import crypto from 'node:crypto';
import { and, desc, eq, gt, isNull, lt } from 'drizzle-orm';
import type { OtpPurpose } from '../../../shared/enums';
import { getConfig } from '../../config';
import { getDb, type DbOrTx } from '../../db';
import { otpCodes } from '../../db/schema';
import { now } from '../../lib/clock';
import { AppError } from '../../lib/errors';
import { sendAccountExistsNotice, sendOtp } from '../notifications/notifications.service';

const HOUR_MS = 3_600_000;
const KEEP_DAYS = 7;

export const normaliseEmail = (email: string) => email.trim().toLowerCase();

export const invalidCode = () =>
  new AppError(400, 'INVALID_CODE', 'Code is invalid or expired', {
    fieldErrors: { code: ['Code is invalid or expired'] },
  });

function tooMany(retryAfterSeconds: number) {
  const s = Math.max(1, Math.ceil(retryAfterSeconds));
  return new AppError(
    429,
    'RATE_LIMITED',
    s < 120
      ? `Please wait ${s} seconds before asking for another code.`
      : `Too many codes requested. Try again in ${Math.ceil(s / 60)} minutes.`,
    { retryAfterSeconds: s },
  );
}

function generateCode(length: number): string {
  let code = '';
  for (let i = 0; i < length; i++) code += String(crypto.randomInt(0, 10));
  return code;
}

/** Bound to destination and purpose, so a code can't be replayed elsewhere. */
function hashCode(code: string, destination: string, purpose: OtpPurpose): string {
  return crypto
    .createHmac('sha256', getConfig().auth.jwtSecret)
    .update(`${purpose}:${destination}:${code}`)
    .digest('hex');
}

function sameHash(a: string, b: string): boolean {
  const x = Buffer.from(a, 'hex');
  const y = Buffer.from(b, 'hex');
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

/** Cooldown and hourly limits per email (all purposes) and per IP. */
async function assertSendAllowed(db: DbOrTx, destination: string, purpose: OtpPurpose, ip: string) {
  const { otp } = getConfig();
  const t = now().getTime();
  const hourAgo = new Date(t - HOUR_MS);

  const [last] = await db
    .select({ createdAt: otpCodes.createdAt })
    .from(otpCodes)
    .where(and(eq(otpCodes.destination, destination), eq(otpCodes.purpose, purpose)))
    .orderBy(desc(otpCodes.createdAt), desc(otpCodes.id))
    .limit(1);
  if (last) {
    const wait = otp.resendCooldownSeconds - (t - last.createdAt.getTime()) / 1000;
    if (wait > 0) throw tooMany(wait);
  }

  const windowLimit = async (where: ReturnType<typeof and>, max: number) => {
    const rows = await db
      .select({ createdAt: otpCodes.createdAt })
      .from(otpCodes)
      .where(and(where, gt(otpCodes.createdAt, hourAgo)))
      .orderBy(desc(otpCodes.createdAt))
      .limit(max);
    if (rows.length >= max) {
      const oldest = rows[rows.length - 1].createdAt.getTime();
      throw tooMany((oldest + HOUR_MS - t) / 1000);
    }
  };
  await windowLimit(and(eq(otpCodes.destination, destination)), otp.maxSendsPerHour);
  await windowLimit(and(eq(otpCodes.requestIp, ip)), otp.maxSendsPerIpPerHour);
}

/**
 * Issues a code and sends it. With `deliver: 'none'` (a reset for an email we
 * don't know) or `'account-exists'` (sign-up with a registered email, which
 * gets a "log in instead" email) no code is sent, but a dead row is still
 * written so limits and responses look the same either way.
 */
export async function issueCode(args: {
  destination: string;
  purpose: OtpPurpose;
  userId: number | null;
  ip: string;
  deliver: 'code' | 'none' | 'account-exists';
}): Promise<void> {
  const db = getDb();
  const { otp } = getConfig();
  const destination = normaliseEmail(args.destination);
  const code = generateCode(otp.length);
  const t = now();

  const id = await db.transaction(async (tx) => {
    await assertSendAllowed(tx, destination, args.purpose, args.ip);
    // No cron on the host: tidy up old rows whenever a new code is made.
    await tx
      .delete(otpCodes)
      .where(lt(otpCodes.createdAt, new Date(t.getTime() - KEEP_DAYS * 24 * HOUR_MS)));
    // A new code replaces any unused older one.
    await tx
      .update(otpCodes)
      .set({ consumedAt: t })
      .where(
        and(
          eq(otpCodes.destination, destination),
          eq(otpCodes.purpose, args.purpose),
          isNull(otpCodes.consumedAt),
        ),
      );
    const [row] = await tx
      .insert(otpCodes)
      .values({
        channel: 'EMAIL',
        destination,
        purpose: args.purpose,
        userId: args.userId,
        codeHash: hashCode(code, destination, args.purpose),
        expiresAt: new Date(t.getTime() + otp.ttlMinutes * 60_000),
        consumedAt: args.deliver === 'code' ? null : t,
        requestIp: args.ip,
        createdAt: t,
      })
      .$returningId();
    return row.id;
  });

  if (args.deliver === 'none') return;
  try {
    if (args.deliver === 'account-exists') await sendAccountExistsNotice(destination);
    else await sendOtp({ channel: 'EMAIL', destination, code, purpose: args.purpose });
  } catch (err) {
    // Not delivered: don't let it count against the customer's limits.
    await db.delete(otpCodes).where(eq(otpCodes.id, id));
    throw err;
  }
}

/**
 * Checks `code` against the newest code for this destination and purpose, and
 * marks it used on success. Wrong, expired, used and exhausted codes all give
 * the same error. A wrong try is counted and committed before the error is thrown.
 */
export async function consumeCode(args: {
  destination: string;
  purpose: OtpPurpose;
  code: string;
}): Promise<typeof otpCodes.$inferSelect> {
  const destination = normaliseEmail(args.destination);
  const given = hashCode(args.code.trim(), destination, args.purpose);
  const result = await getDb().transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(otpCodes)
      .where(and(eq(otpCodes.destination, destination), eq(otpCodes.purpose, args.purpose)))
      .orderBy(desc(otpCodes.createdAt), desc(otpCodes.id))
      .limit(1)
      .for('update');
    if (!row) return null;
    const matches = sameHash(given, row.codeHash);
    const usable =
      !row.consumedAt &&
      row.expiresAt.getTime() > now().getTime() &&
      row.attempts < getConfig().otp.maxAttempts;
    if (!usable) return null;
    if (!matches) {
      await tx
        .update(otpCodes)
        .set({ attempts: row.attempts + 1 })
        .where(eq(otpCodes.id, row.id));
      return null;
    }
    await tx.update(otpCodes).set({ consumedAt: now() }).where(eq(otpCodes.id, row.id));
    return row;
  });
  if (!result) throw invalidCode();
  return result;
}
