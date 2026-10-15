import type { NextFunction, Request, Response } from 'express';
import jwt, { type SignOptions } from 'jsonwebtoken';
import { eq } from 'drizzle-orm';
import type { Role } from '../../shared/enums';
import { getConfig } from '../config';
import { getDb } from '../db';
import { users } from '../db/schema';
import { AppError, forbidden, unauthorized } from '../lib/errors';

export const AUTH_COOKIE = 'saafgadi_session';

export interface AuthUser {
  id: number;
  name: string;
  mobile: string;
  email: string | null;
  emailVerified: boolean;
  /** A self-signed-up customer who must verify an email before using the app. */
  mustVerifyEmail: boolean;
  role: Role;
}

declare module 'express-serve-static-core' {
  interface Request {
    user?: AuthUser;
  }
}

interface TokenPayload {
  sub: string;
  role: Role;
  /** users.token_version when signed; missing on tokens from before it existed. */
  tv?: number;
}

export function signToken(user: { id: number; role: Role; tokenVersion: number }): string {
  const { jwtSecret, jwtExpiresIn } = getConfig().auth;
  return jwt.sign({ role: user.role, tv: user.tokenVersion }, jwtSecret, {
    subject: String(user.id),
    expiresIn: (/^\d+$/.test(jwtExpiresIn)
      ? Number(jwtExpiresIn)
      : jwtExpiresIn) as SignOptions['expiresIn'],
  });
}

function cookieMaxAgeMs(): number {
  const v = getConfig().auth.jwtExpiresIn;
  const m = /^(\d+)([smhd]?)$/.exec(v);
  if (!m) return 7 * 86_400_000;
  const n = Number(m[1]);
  const unit = { '': 1000, s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 }[
    m[2] as '' | 's' | 'm' | 'h' | 'd'
  ];
  return n * unit;
}

export function setAuthCookie(res: Response, token: string): void {
  res.cookie(AUTH_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: getConfig().auth.cookieSecure,
    maxAge: cookieMaxAgeMs(),
    path: '/',
  });
}

export function clearAuthCookie(res: Response): void {
  res.clearCookie(AUTH_COOKIE, {
    httpOnly: true,
    sameSite: 'lax',
    secure: getConfig().auth.cookieSecure,
    path: '/',
  });
}

/**
 * Reads the session cookie, if any, and attaches the user. The account is
 * re-checked on every request so deactivation and role changes apply at once.
 */
export async function loadUser(req: Request, res: Response, next: NextFunction) {
  const token = req.cookies?.[AUTH_COOKIE];
  if (!token) return next();
  let payload: TokenPayload;
  try {
    payload = jwt.verify(token, getConfig().auth.jwtSecret) as unknown as TokenPayload;
  } catch {
    clearAuthCookie(res);
    return next();
  }
  const id = Number(payload.sub);
  if (!Number.isInteger(id)) return next();
  const [row] = await getDb()
    .select({
      id: users.id,
      name: users.name,
      mobile: users.mobile,
      email: users.email,
      emailVerifiedAt: users.emailVerifiedAt,
      role: users.role,
      isActive: users.isActive,
      tokenVersion: users.tokenVersion,
      createdByAdmin: users.createdByAdmin,
    })
    .from(users)
    .where(eq(users.id, id))
    .limit(1);
  // Deactivated, or signed out everywhere by a password reset.
  if (!row || !row.isActive || (payload.tv ?? 0) !== row.tokenVersion) {
    clearAuthCookie(res);
    return next();
  }
  req.user = {
    id: row.id,
    name: row.name,
    mobile: row.mobile,
    email: row.email,
    emailVerified: !!row.email && !!row.emailVerifiedAt,
    mustVerifyEmail: mustVerifyEmail(row),
    role: row.role,
  };
  next();
}

/** Customers who signed up themselves need a verified email; staff and admin-added customers don't. */
export function mustVerifyEmail(u: {
  role: Role;
  createdByAdmin: boolean;
  email: string | null;
  emailVerifiedAt: Date | null;
}): boolean {
  return u.role === 'USER' && !u.createdByAdmin && !(u.email && u.emailVerifiedAt);
}

/** Blocks customer routes until the email is verified (the client shows a verify screen). */
export function requireVerifiedEmail(req: Request, _res: Response, next: NextFunction) {
  if (req.user?.mustVerifyEmail) {
    return next(new AppError(403, 'EMAIL_NOT_VERIFIED', 'Verify your email to continue'));
  }
  next();
}

// ------------------------------------------------------------ sign-up token

/** Proof that an email was verified, held while the sign-up form is filled in. */
export const SIGNUP_COOKIE = 'saafgadi_signup';

export function setSignupCookie(res: Response, email: string): void {
  const { jwtSecret, cookieSecure } = getConfig().auth;
  const ttl = getConfig().signup.tokenTtlMinutes;
  const token = jwt.sign({ purpose: 'signup', email }, jwtSecret, { expiresIn: ttl * 60 });
  // A browser-session cookie: the token's own expiry is enforced on the server,
  // so an expired one can be told apart from a missing one.
  res.cookie(SIGNUP_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: cookieSecure,
    path: '/api/auth',
  });
}

export function clearSignupCookie(res: Response): void {
  res.clearCookie(SIGNUP_COOKIE, {
    httpOnly: true,
    sameSite: 'lax',
    secure: getConfig().auth.cookieSecure,
    path: '/api/auth',
  });
}

/** The verified sign-up email, or why there isn't one. */
export function readSignupToken(
  req: Request,
): { email: string } | { error: 'missing' | 'expired' } {
  const token = req.cookies?.[SIGNUP_COOKIE];
  if (!token) return { error: 'missing' };
  try {
    const p = jwt.verify(token, getConfig().auth.jwtSecret) as { purpose?: string; email?: string };
    if (p.purpose !== 'signup' || !p.email) return { error: 'missing' };
    return { email: p.email };
  } catch (err) {
    return { error: err instanceof jwt.TokenExpiredError ? 'expired' : 'missing' };
  }
}

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  if (!req.user) return next(unauthorized());
  next();
}

export function requireRole(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(unauthorized());
    if (!roles.includes(req.user.role)) return next(forbidden());
    next();
  };
}
