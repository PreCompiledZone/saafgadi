// Sign-up verifies the email first; unverified customers are gated; staff aren't.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type supertest from 'supertest';
import { testNotices, testOutbox } from '../server/modules/notifications/notifications.service';
import { agent, dbAvailable, freshApp, setNow, verifiedSignup } from './helpers';

const up = await dbAvailable();

type Agent = ReturnType<typeof supertest.agent>;

const at = (minutes: number) => new Date(Date.UTC(2026, 9, 21, 4, minutes)).toISOString();

const form = (mobile: string, email: string, extra: Record<string, unknown> = {}) => ({
  name: 'Priya Shah',
  mobile,
  email,
  password: 'secret123',
  societyOrBuilding: 'Blue Ridge',
  flatOrHouseNo: 'D-7',
  area: 'Hinjewadi',
  city: 'Pune',
  pincode: '411057',
  ...extra,
});

const codeFor = (email: string) =>
  [...testOutbox].reverse().find((m) => m.destination === email && m.purpose === 'SIGNUP')?.code;

describe.runIf(up)('Sign-up email verification', () => {
  let app: Awaited<ReturnType<typeof freshApp>>['app'];
  let close: () => Promise<void>;
  let admin: Agent;

  beforeAll(async () => {
    setNow(at(0));
    ({ app, close } = await freshApp());
    admin = agent(app);
    await admin.post('/api/auth/login').send({ identifier: '9000000001', password: 'admin12345' });
  });

  afterAll(async () => {
    vi.useRealTimers();
    await close?.();
  });

  /** Customers whose name, mobile or email matches. */
  const findUsers = async (search: string) =>
    (await admin.get(`/api/admin/users?search=${encodeURIComponent(search)}`)).body.total;

  async function verify(a: Agent, email: string) {
    expect((await a.post('/api/auth/otp/send').send({ email, purpose: 'SIGNUP' })).status).toBe(
      200,
    );
    const res = await a.post('/api/auth/otp/verify-signup').send({ email, code: codeFor(email) });
    expect(res.status).toBe(200);
  }

  it('send → verify → sign up creates a verified customer and logs them in', async () => {
    const a = agent(app);
    const res = await verifiedSignup(a, form('9833300001', ' Priya@Example.com '));
    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({
      email: 'priya@example.com',
      emailVerified: true,
      mustVerifyEmail: false,
    });
    expect((await a.get('/api/me/dashboard')).status).toBe(200);
    // The sign-up token is single use.
    const again = await a.post('/api/auth/signup').send(form('9833300009', 'priya@example.com'));
    expect(again.status).toBe(401);
  });

  it('signup needs a valid token for the same email', async () => {
    expect(
      (await agent(app).post('/api/auth/signup').send(form('9833300002', 'a@example.com'))).body
        .error.code,
    ).toBe('SIGNUP_TOKEN_REQUIRED');

    const mismatch = agent(app);
    await verify(mismatch, 'b@example.com');
    const res = await mismatch.post('/api/auth/signup').send(form('9833300002', 'c@example.com'));
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('SIGNUP_EMAIL_MISMATCH');

    setNow(at(5));
    const late = agent(app);
    await verify(late, 'late@example.com');
    setNow(at(5 + 31));
    const expired = await late
      .post('/api/auth/signup')
      .send(form('9833300003', 'late@example.com'));
    expect(expired.status).toBe(401);
    expect(expired.body.error).toMatchObject({
      code: 'SIGNUP_TOKEN_EXPIRED',
      message: 'Your verification expired, please verify your email again',
    });
  });

  it('verifying alone creates no account', async () => {
    setNow(at(60));
    await verify(agent(app), 'only.verified@example.com');
    expect(await findUsers('only.verified@example.com')).toBe(0);
  });

  it('disposable emails are rejected', async () => {
    for (const email of ['x@mailinator.com', 'y@inbox.yopmail.com']) {
      const res = await agent(app).post('/api/auth/otp/send').send({ email, purpose: 'SIGNUP' });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('DISPOSABLE_EMAIL');
    }
  });

  it('a filled honeypot looks like success and creates nothing', async () => {
    const a = agent(app);
    await verify(a, 'bot@example.com');
    const res = await a
      .post('/api/auth/signup')
      .send(form('9833300004', 'bot@example.com', { website: 'http://spam.example' }));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(await findUsers('9833300004')).toBe(0);
  });

  it('a registered email gets an "already have an account" email, not a code', async () => {
    setNow(at(120));
    const codes = testOutbox.length;
    const res = await agent(app)
      .post('/api/auth/otp/send')
      .send({ email: 'priya@example.com', purpose: 'SIGNUP' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(testOutbox.length).toBe(codes);
    expect(testNotices.at(-1)).toEqual({
      destination: 'priya@example.com',
      kind: 'ACCOUNT_EXISTS',
    });
  });

  it('an unverified older customer is gated; admin-added customers, washers and admins are not', async () => {
    setNow(at(180));
    // An older account: switching to a new email leaves it unverified.
    const old = agent(app);
    await verifiedSignup(old, form('9833300005', 'kiran@example.com'));
    await old.put('/api/auth/email').send({ email: 'kiran.new@example.com' });
    expect((await old.get('/api/auth/me')).body.user.mustVerifyEmail).toBe(true);
    const blocked = await old.get('/api/me/dashboard');
    expect(blocked.status).toBe(403);
    expect(blocked.body.error.code).toBe('EMAIL_NOT_VERIFIED');
    expect((await old.get('/api/me/profile')).status).toBe(200);

    // Verifying unlocks the app.
    await old
      .post('/api/auth/otp/send')
      .send({ email: 'kiran.new@example.com', purpose: 'VERIFY_EMAIL' });
    const code = [...testOutbox]
      .reverse()
      .find((m) => m.destination === 'kiran.new@example.com')?.code;
    expect((await old.post('/api/auth/otp/verify-email').send({ code })).status).toBe(200);
    expect((await old.get('/api/me/dashboard')).status).toBe(200);

    // Admin-added customer without an email: exempt.
    await admin
      .post('/api/admin/users')
      .send({ name: 'Walk In', mobile: '9833300006', email: '', password: 'walkin123' });
    const walkIn = agent(app);
    await walkIn.post('/api/auth/login').send({ identifier: '9833300006', password: 'walkin123' });
    expect((await walkIn.get('/api/me/dashboard')).status).toBe(200);

    // Staff without verified emails are unaffected.
    expect((await admin.get('/api/admin/dashboard')).status).toBe(200);
    await admin
      .post('/api/admin/washers')
      .send({ name: 'Sunil', mobile: '9833300007', email: '', password: 'sunil1234' });
    const washer = agent(app);
    await washer.post('/api/auth/login').send({ identifier: '9833300007', password: 'sunil1234' });
    expect((await washer.get('/api/washer/today')).status).toBe(200);
  });
});
