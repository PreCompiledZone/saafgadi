import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import {
  changeEmailSchema,
  changePasswordSchema,
  loginSchema,
  otpSendSchema,
  passwordResetSchema,
  signupSchema,
  verifyEmailSchema,
  verifySignupSchema,
} from '../../../shared/schemas';
import { getConfig } from '../../config';
import { currentUser, parse } from '../../lib/http';
import {
  clearAuthCookie,
  clearSignupCookie,
  readSignupToken,
  requireAuth,
  requireRole,
  setAuthCookie,
  setSignupCookie,
  signToken,
} from '../../middleware/auth';
import { AppError } from '../../lib/errors';
import {
  changeEmail,
  changePassword,
  login,
  requestCode,
  resetPassword,
  signup,
  verifyEmail,
  verifySignup,
} from './auth.service';

export const authRouter = Router();

const limiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: () => getConfig().isTest,
  message: {
    error: {
      code: 'RATE_LIMITED',
      message: 'Too many attempts. Please wait a few minutes and try again.',
    },
  },
});

authRouter.post('/signup', limiter, async (req, res) => {
  // Honeypot: people never see the `website` field, so only bots fill it.
  const website = (req.body as { website?: unknown } | undefined)?.website;
  if (typeof website === 'string' && website.trim()) {
    res.json({ ok: true });
    return;
  }
  const input = parse(signupSchema, req.body);
  const token = readSignupToken(req);
  if ('error' in token) {
    throw token.error === 'expired'
      ? new AppError(
          401,
          'SIGNUP_TOKEN_EXPIRED',
          'Your verification expired, please verify your email again',
        )
      : new AppError(401, 'SIGNUP_TOKEN_REQUIRED', 'Verify your email first');
  }
  if (token.email !== input.email) {
    throw new AppError(
      403,
      'SIGNUP_EMAIL_MISMATCH',
      'This isn’t the email you verified. Please verify it again.',
    );
  }
  const { user, tokenVersion } = await signup(input);
  clearSignupCookie(res);
  setAuthCookie(res, signToken({ ...user, tokenVersion }));
  res.status(201).json({ user });
});

// Sign-up starts here: the email is verified before any account exists.
authRouter.post('/otp/verify-signup', limiter, async (req, res) => {
  const { email, code } = parse(verifySignupSchema, req.body);
  const verified = await verifySignup(email, code);
  setSignupCookie(res, verified);
  res.json({ ok: true, email: verified });
});

authRouter.post('/login', limiter, async (req, res) => {
  const { user, tokenVersion } = await login(parse(loginSchema, req.body));
  setAuthCookie(res, signToken({ ...user, tokenVersion }));
  res.json({ user });
});

authRouter.post('/logout', (_req, res) => {
  clearAuthCookie(res);
  res.json({ ok: true });
});

authRouter.get('/me', (req, res) => {
  res.json({ user: req.user ?? null });
});

authRouter.post('/change-password', limiter, requireAuth, async (req, res) => {
  await changePassword(currentUser(req).id, parse(changePasswordSchema, req.body));
  res.json({ ok: true });
});

// One-time codes by email: verify the address, or reset a forgotten password.
authRouter.post('/otp/send', limiter, async (req, res) => {
  await requestCode(parse(otpSendSchema, req.body), req.ip ?? 'unknown', req.user?.id);
  res.json({ ok: true });
});

authRouter.post('/otp/verify-email', limiter, requireAuth, async (req, res) => {
  const user = await verifyEmail(currentUser(req).id, parse(verifyEmailSchema, req.body).code);
  res.json({ user });
});

authRouter.post('/password/reset', limiter, async (req, res) => {
  await resetPassword(parse(passwordResetSchema, req.body));
  clearAuthCookie(res);
  res.json({ ok: true });
});

authRouter.put('/email', limiter, requireRole('USER'), async (req, res) => {
  const user = await changeEmail(currentUser(req).id, parse(changeEmailSchema, req.body));
  res.json({ user });
});
