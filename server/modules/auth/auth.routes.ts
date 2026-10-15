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
} from '../../../shared/schemas';
import { getConfig } from '../../config';
import { currentUser, parse } from '../../lib/http';
import {
  clearAuthCookie,
  requireAuth,
  requireRole,
  setAuthCookie,
  signToken,
} from '../../middleware/auth';
import {
  changeEmail,
  changePassword,
  login,
  requestCode,
  resetPassword,
  signup,
  verifyEmail,
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
  const { user, tokenVersion } = await signup(parse(signupSchema, req.body));
  setAuthCookie(res, signToken({ ...user, tokenVersion }));
  res.status(201).json({ user });
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
