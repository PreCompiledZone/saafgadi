// Email OTP: verify email, forgot password, limits and never leaking codes.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type supertest from 'supertest';
import { failNextSend, testOutbox } from '../server/modules/notifications/notifications.service';
import { agent, dbAvailable, freshApp, setNow } from './helpers';

const up = await dbAvailable();

type Agent = ReturnType<typeof supertest.agent>;

/** Each test runs in its own hour so per-hour limits don't carry over. */
const hour = (n: number, plusSeconds = 0) =>
  new Date(Date.UTC(2026, 9, 20, n, 0, plusSeconds)).toISOString();

const lastCode = (email: string) =>
  [...testOutbox].reverse().find((m) => m.destination === email)?.code;

describe.runIf(up)('Email OTP', () => {
  let app: Awaited<ReturnType<typeof freshApp>>['app'];
  let close: () => Promise<void>;
  let user: Agent;
  const email = 'meera@example.com';
  const logs: string[] = [];

  async function signup(a: Agent, mobile: string, mail: string) {
    const res = await a.post('/api/auth/signup').send({
      name: 'Meera Joshi',
      mobile,
      email: mail,
      password: 'oldpass123',
      societyOrBuilding: 'Green Acres',
      flatOrHouseNo: 'C-12',
      area: 'Kharadi',
      city: 'Pune',
      pincode: '411014',
    });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    return res.body.user;
  }

  beforeAll(async () => {
    setNow(hour(0));
    ({ app, close } = await freshApp());
    user = agent(app);
    await signup(user, '9811100001', email);
    // Capture everything the app logs, to prove codes never appear in it.
    for (const fn of ['log', 'error', 'warn', 'info'] as const) {
      vi.spyOn(console, fn).mockImplementation((...args: unknown[]) => {
        logs.push(args.map(String).join(' '));
      });
    }
  });

  afterAll(async () => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    await close?.();
  });

  const send = (a: Agent, to: string, purpose = 'VERIFY_EMAIL') =>
    a.post('/api/auth/otp/send').send({ email: to, purpose });

  it('verify email: send → verify, with the account checks', async () => {
    setNow(hour(1));
    expect((await send(agent(app), email)).status).toBe(401); // must be logged in
    expect((await send(user, 'someone@else.com')).status).toBe(400); // not their email

    const sent = await send(user, 'MEERA@example.com ');
    expect(sent.status).toBe(200);
    const code = lastCode(email)!;
    expect(code).toMatch(/^\d{6}$/);

    const ok = await user.post('/api/auth/otp/verify-email').send({ code });
    expect(ok.status).toBe(200);
    expect(ok.body.user.emailVerified).toBe(true);
    expect((await user.get('/api/auth/me')).body.user.emailVerified).toBe(true);
    expect((await send(user, email)).body.error.code).toBe('ALREADY_VERIFIED');
  });

  it('wrong codes count; after 5 the code is dead even when right', async () => {
    setNow(hour(2));
    const other = agent(app);
    await signup(other, '9811100002', 'ankit@example.com');
    await send(other, 'ankit@example.com');
    const code = lastCode('ankit@example.com')!;
    const wrong = code === '000000' ? '111111' : '000000';
    for (let i = 0; i < 5; i++) {
      const res = await other.post('/api/auth/otp/verify-email').send({ code: wrong });
      expect(res.status).toBe(400);
      expect(res.body.error.message).toBe('Code is invalid or expired');
    }
    const sixth = await other.post('/api/auth/otp/verify-email').send({ code });
    expect(sixth.status).toBe(400);
  });

  it('expired, used and replaced codes all fail the same way', async () => {
    setNow(hour(3));
    const reset = (code: string, newPassword = 'newpass123') =>
      agent(app).post('/api/auth/password/reset').send({ email, code, newPassword });

    // Expired after 10 minutes.
    await send(agent(app), email, 'RESET_PASSWORD');
    const expired = lastCode(email)!;
    setNow(hour(3, 11 * 60));
    expect((await reset(expired)).body.error.code).toBe('INVALID_CODE');

    // A newer code replaces the older one.
    await send(agent(app), email, 'RESET_PASSWORD');
    const older = lastCode(email)!;
    setNow(hour(3, 11 * 60 + 61));
    await send(agent(app), email, 'RESET_PASSWORD');
    const newer = lastCode(email)!;
    expect((await reset(older)).status).toBe(400);
    expect((await reset(newer)).status).toBe(200);

    // Used once, never again.
    expect((await reset(newer, 'another123')).status).toBe(400);
  });

  it('reset changes the password and signs out other sessions', async () => {
    setNow(hour(4));
    const phone = agent(app);
    await phone.post('/api/auth/login').send({ identifier: email, password: 'newpass123' });
    expect((await phone.get('/api/auth/me')).body.user).not.toBeNull();

    expect((await send(agent(app), email, 'RESET_PASSWORD')).status).toBe(200);
    const res = await agent(app)
      .post('/api/auth/password/reset')
      .send({ email, code: lastCode(email), newPassword: 'fresh-pass-9' });
    expect(res.status).toBe(200);

    expect((await phone.get('/api/auth/me')).body.user).toBeNull();
    const old = await agent(app)
      .post('/api/auth/login')
      .send({ identifier: email, password: 'newpass123' });
    expect(old.status).toBe(401);
    const fresh = await agent(app)
      .post('/api/auth/login')
      .send({ identifier: '9811100001', password: 'fresh-pass-9' });
    expect(fresh.status).toBe(200);
  });

  it('reset for an unknown email says ok and sends nothing', async () => {
    setNow(hour(5));
    const before = testOutbox.length;
    const res = await send(agent(app), 'nobody@example.com', 'RESET_PASSWORD');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(testOutbox.length).toBe(before);
    // Limits look the same as for a real account.
    expect((await send(agent(app), 'nobody@example.com', 'RESET_PASSWORD')).status).toBe(429);
  });

  it('cooldown, per-email and per-IP limits return 429 with retryAfterSeconds', async () => {
    setNow(hour(6));
    const a = agent(app);
    const firstSend = await send(a, email, 'RESET_PASSWORD');
    expect(firstSend.status, JSON.stringify(firstSend.body)).toBe(200);
    const tooSoon = await send(a, email, 'RESET_PASSWORD');
    expect(tooSoon.status).toBe(429);
    expect(tooSoon.body.error.details.retryAfterSeconds).toBeGreaterThan(55);

    setNow(hour(6, 61));
    expect((await send(a, email, 'RESET_PASSWORD')).status).toBe(200);
    setNow(hour(6, 122));
    expect((await send(a, email, 'RESET_PASSWORD')).status).toBe(200);
    setNow(hour(6, 183));
    const fourth = await send(a, email, 'RESET_PASSWORD');
    expect(fourth.status).toBe(429); // 3 per email per hour
    expect(fourth.body.error.details.retryAfterSeconds).toBeGreaterThan(3000);

    // Per IP: 10 an hour across any emails, in an hour of its own.
    setNow(hour(8));
    for (let i = 0; i < 10; i++) {
      expect((await send(a, `ip${i}@example.com`, 'RESET_PASSWORD')).status).toBe(200);
    }
    expect((await send(a, 'ip-last@example.com', 'RESET_PASSWORD')).status).toBe(429);
  });

  it('a failed send returns 502 and does not count against the limits', async () => {
    setNow(hour(10));
    failNextSend();
    const res = await send(agent(app), email, 'RESET_PASSWORD');
    expect(res.status).toBe(502);
    expect(res.body.error.code).toBe('SEND_FAILED');
    expect((await send(agent(app), email, 'RESET_PASSWORD')).status).toBe(200);
  });

  it('changing the email clears verification', async () => {
    setNow(hour(11));
    expect((await user.get('/api/auth/me')).body.user).toBeNull(); // signed out by the reset
    await user.post('/api/auth/login').send({ identifier: email, password: 'fresh-pass-9' });
    expect((await user.get('/api/auth/me')).body.user.emailVerified).toBe(true);
    const res = await user.put('/api/auth/email').send({ email: 'meera.j@example.com' });
    expect(res.body.user).toMatchObject({ email: 'meera.j@example.com', emailVerified: false });
  });

  it('no code ever appears in the logs', () => {
    const codes = testOutbox.map((m) => m.code);
    expect(codes.length).toBeGreaterThan(5);
    for (const code of codes) {
      for (const line of logs) expect(line).not.toContain(code);
    }
  });
});
