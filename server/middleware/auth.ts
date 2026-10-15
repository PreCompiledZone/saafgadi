import type { NextFunction, Request, Response } from 'express';
import jwt, { type SignOptions } from 'jsonwebtoken';
import { eq } from 'drizzle-orm';
import type { Role } from '../../shared/enums';
import { getConfig } from '../config';
import { getDb } from '../db';
import { users } from '../db/schema';
import { forbidden, unauthorized } from '../lib/errors';

export const AUTH_COOKIE = 'saafgadi_session';

export interface AuthUser {
  id: number;
  name: string;
  mobile: string;
  email: string | null;
  emailVerified: boolean;
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
    role: row.role,
  };
  next();
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
