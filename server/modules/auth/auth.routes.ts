import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { changePasswordSchema, loginSchema, signupSchema } from '../../../shared/schemas';
import { getConfig } from '../../config';
import { currentUser, parse } from '../../lib/http';
import { clearAuthCookie, requireAuth, setAuthCookie, signToken } from '../../middleware/auth';
import { changePassword, login, signup } from './auth.service';

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
  const user = await signup(parse(signupSchema, req.body));
  setAuthCookie(res, signToken(user));
  res.status(201).json({ user });
});

authRouter.post('/login', limiter, async (req, res) => {
  const user = await login(parse(loginSchema, req.body));
  setAuthCookie(res, signToken(user));
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
