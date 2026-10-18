// Monthly plan requests (PENDING → ACTIVE) and the two-state customer dashboard.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type supertest from 'supertest';
import { agent, dbAvailable, freshApp, morningIst, setNow, verifiedSignup } from './helpers';

const up = await dbAvailable();
type Agent = ReturnType<typeof supertest.agent>;

describe.runIf(up)('monthly plan requests and dashboard', () => {
  let app: Awaited<ReturnType<typeof freshApp>>['app'];
  let close: () => Promise<void>;
  let admin: Agent;
  let washer: Agent;
  let user: Agent;
  let other: Agent;
  let washerId: number;
  let carPlanId: number;
  let bikePlanId: number;
  let carId: number;
  let bikeId: number;
  let bikeSubId: number;

  const address = {
    societyOrBuilding: 'Green Acres',
    flatOrHouseNo: 'A-12',
    area: 'Baner',
    city: 'Pune',
    pincode: '411045',
  };

  async function relogin() {
    await admin.post('/api/auth/login').send({ identifier: '9000000001', password: 'admin12345' });
    await washer.post('/api/auth/login').send({ identifier: '9000000002', password: 'washer123' });
    await user.post('/api/auth/login').send({ identifier: '9820033333', password: 'meera1234' });
    await other.post('/api/auth/login').send({ identifier: '9820044444', password: 'karan1234' });
  }
  const at = async (date: string) => {
    setNow(morningIst(date));
    await relogin();
  };
  async function planMails() {
    const { testPlanMails } = await import('../server/modules/notifications/notifications.service');
    return testPlanMails;
  }
  const dashboard = async () => (await user.get('/api/me/dashboard')).body;

  beforeAll(async () => {
    setNow(morningIst('2026-10-10'));
    ({ app, close } = await freshApp());
    admin = agent(app);
    washer = agent(app);
    user = agent(app);
    other = agent(app);
    await admin.post('/api/auth/login').send({ identifier: '9000000001', password: 'admin12345' });
    washerId = (
      await admin
        .post('/api/admin/washers')
        .send({ name: 'Ravi Kumar', mobile: '9000000002', password: 'washer123' })
    ).body.id;
    const plans = (await agent(app).get('/api/public/plans')).body;
    carPlanId = plans[0].id;
    bikePlanId = plans[1].id;
    await admin.put(`/api/admin/plans/${carPlanId}/prices`).send({
      prices: [
        { vehicleType: 'HATCHBACK', monthlyPrice: 799 },
        { vehicleType: 'SEDAN', monthlyPrice: 999 },
        { vehicleType: 'SUV', monthlyPrice: 1199 },
      ],
    });
    await admin
      .put(`/api/admin/plans/${bikePlanId}/prices`)
      .send({ prices: [{ vehicleType: 'BIKE', monthlyPrice: 399 }] });
  });

  afterAll(async () => {
    vi.useRealTimers();
    await close?.();
  });

  it('sign-up works without a vehicle; a plan request needs one', async () => {
    const res = await verifiedSignup(user, {
      name: 'Meera Joshi',
      mobile: '9820033333',
      email: 'meera@example.com',
      password: 'meera1234',
      ...address,
    });
    expect(res.status).toBe(201);
    await verifiedSignup(other, {
      name: 'Karan Mehta',
      mobile: '9820044444',
      email: 'karan@example.com',
      password: 'karan1234',
      ...address,
    });
    const none = await user
      .post('/api/subscriptions')
      .send({ planId: carPlanId, months: 1, preferredStartDate: '2026-10-11' });
    expect(none.status).toBe(400);
  });

  it('dashboard is in the "none" state, with no one-time tiles while none are active', async () => {
    const d = await dashboard();
    expect(d).toMatchObject({
      state: 'none',
      vehicles: [],
      upcomingBookings: [],
      oneTimeServices: [],
      lowestOneTimePrice: null,
      lowestMonthlyPrice: 399,
      greeting: 'morning',
      defaultTab: 'one-time',
      badges: { monthly: false, oneTime: false },
    });
  });

  it('requests a plan as PENDING; duplicates are rejected', async () => {
    carId = (
      await user.post('/api/me/vehicles').send({
        category: 'CAR',
        carType: 'SEDAN',
        registrationNumber: 'MH12XY4321',
        make: 'Honda',
        model: 'City',
        color: 'Grey',
      })
    ).body.id;
    // Someone else's vehicle is refused.
    expect(
      (
        await other.post('/api/subscriptions').send({
          vehicleId: carId,
          planId: carPlanId,
          months: 1,
          preferredStartDate: '2026-10-11',
        })
      ).status,
    ).toBe(400);
    // Bike plan for a car.
    expect(
      (
        await user.post('/api/subscriptions').send({
          vehicleId: carId,
          planId: bikePlanId,
          months: 1,
          preferredStartDate: '2026-10-11',
        })
      ).status,
    ).toBe(400);

    const req = await user
      .post('/api/subscriptions')
      .send({ vehicleId: carId, planId: carPlanId, months: 3, preferredStartDate: '2026-10-12' });
    expect(req.status).toBe(201);
    expect(req.body).toMatchObject({
      status: 'PENDING',
      monthlyPrice: 999,
      totalAmount: 2997,
      startDate: '2026-10-12',
    });
    expect((await planMails()).at(-1)).toMatchObject({
      to: 'meera@example.com',
      kind: 'PLAN_REQUESTED',
    });

    const dup = await user
      .post('/api/subscriptions')
      .send({ vehicleId: carId, planId: carPlanId, months: 1, preferredStartDate: '2026-10-13' });
    expect(dup.status).toBe(409);
    expect(dup.body.error.message).toBe('This vehicle already has a plan or a pending request.');

    const d = await dashboard();
    expect(d.state).toBe('none');
    // Only a pending request: still opens on Monthly, with its dot.
    expect(d.defaultTab).toBe('monthly');
    expect(d.badges).toEqual({ monthly: true, oneTime: false });
    expect(d.vehicles[0].pending).toMatchObject({ id: req.body.id, status: 'PENDING' });
    expect((await admin.get('/api/admin/dashboard')).body.pendingActivations).toBe(1);
    const list = await admin.get('/api/admin/subscriptions?status=PENDING&area=Baner');
    expect(list.body.items.map((s: { id: number }) => s.id)).toEqual([req.body.id]);
  });

  it('only the owner can cancel a PENDING request', async () => {
    const pending = (await dashboard()).vehicles[0].pending;
    expect((await other.post(`/api/subscriptions/${pending.id}/cancel`)).status).toBe(403);
    const ok = await user.post(`/api/subscriptions/${pending.id}/cancel`);
    expect(ok.status).toBe(200);
    expect(ok.body.status).toBe('CANCELLED');
    expect((await dashboard()).vehicles[0].pending).toBeNull();
  });

  it('a PENDING request older than 7 days reads as CANCELLED', async () => {
    const req = await user
      .post('/api/subscriptions')
      .send({ vehicleId: carId, planId: carPlanId, months: 1, preferredStartDate: '2026-10-15' });
    expect(req.status).toBe(201);
    await at('2026-10-17');
    expect((await dashboard()).vehicles[0].pending?.id).toBe(req.body.id);
    await at('2026-10-18');
    const mine = (await user.get('/api/me/subscriptions')).body;
    expect(mine.find((s: { id: number }) => s.id === req.body.id).status).toBe('CANCELLED');
  });

  it('admin activates; the dashboard switches to the plan view', async () => {
    bikeId = (
      await user.post('/api/me/vehicles').send({
        category: 'BIKE',
        registrationNumber: 'MH12AB0007',
        make: 'Honda',
        model: 'Activa',
        color: 'Red',
      })
    ).body.id;
    const req = await user
      .post('/api/subscriptions')
      .send({ vehicleId: bikeId, planId: bikePlanId, months: 1, preferredStartDate: '2026-10-19' });
    bikeSubId = req.body.id;

    const act = await admin
      .post(`/api/admin/subscriptions/${bikeSubId}/activate`)
      .send({ startDate: '2026-10-18', washerId });
    expect(act.status).toBe(200);
    expect(act.body).toMatchObject({
      status: 'ACTIVE',
      startDate: '2026-10-18',
      assignedWasherName: 'Ravi Kumar',
    });
    expect(act.body.activatedAt).toBeTruthy();
    expect((await planMails()).at(-1)).toMatchObject({ kind: 'PLAN_ACTIVE' });
    // Already active: can't be activated again, and the customer can't cancel it.
    expect(
      (
        await admin
          .post(`/api/admin/subscriptions/${bikeSubId}/activate`)
          .send({ startDate: '2026-10-18' })
      ).status,
    ).toBe(409);
    expect((await user.post(`/api/subscriptions/${bikeSubId}/cancel`)).status).toBe(403);

    const d = await dashboard();
    expect(d.state).toBe('active');
    expect(d.defaultTab).toBe('monthly');
    const bike = d.vehicles.find((v: { vehicle: { id: number } }) => v.vehicle.id === bikeId);
    expect(bike.subscription.status).toBe('ACTIVE');
    expect(
      bike.progress.map((p: { used: number; quota: number }) => `${p.used}/${p.quota}`),
    ).toEqual(['0/15']);
  });

  it('today strip: due, washed, not due, missed (alternate-day plan)', async () => {
    const bikeOf = (d: { vehicles: { vehicle: { id: number } }[] }) =>
      d.vehicles.find((v) => v.vehicle.id === bikeId) as unknown as {
        todayStatus: Record<string, unknown>;
        nextWashDate: string | null;
        progress: { used: number }[];
        recent: unknown[];
      };
    expect(bikeOf(await dashboard()).todayStatus).toEqual({ kind: 'DUE' });

    const activity = (await agent(app).get('/api/public/plans')).body[1].activities[0];
    await washer
      .post('/api/washer/logs')
      .send({ subscriptionId: bikeSubId, planActivityId: activity.id, status: 'DONE' });
    const washed = bikeOf(await dashboard());
    expect(washed.todayStatus).toMatchObject({
      kind: 'WASHED',
      washerFirstName: 'Ravi',
      activityName: activity.name,
    });
    expect(washed.progress[0].used).toBe(1);
    expect(washed.recent).toHaveLength(1);

    await at('2026-10-19');
    expect(bikeOf(await dashboard()).todayStatus).toEqual({ kind: 'NOT_DUE', next: '2026-10-20' });

    await at('2026-10-20');
    await washer.post('/api/washer/logs').send({
      subscriptionId: bikeSubId,
      planActivityId: activity.id,
      status: 'NOT_DONE',
      reason: 'NO_ACCESS',
    });
    expect(bikeOf(await dashboard()).todayStatus).toEqual({ kind: 'MISSED', reason: 'No access' });
  });

  it('renewal opens in the last 5 days and starts the day after the plan ends', async () => {
    const sub = (await user.get('/api/me/subscriptions')).body.find(
      (s: { id: number }) => s.id === bikeSubId,
    );
    const early = await user.post(`/api/subscriptions/${bikeSubId}/renew`).send({ months: 1 });
    expect(early.status).toBe(400);
    expect(early.body.error.code).toBe('RENEW_NOT_OPEN');

    // Five days left, including the last day.
    const [y, m, d] = sub.endDate.split('-').map(Number);
    const fiveLeft = new Date(Date.UTC(y, m - 1, d - 4)).toISOString().slice(0, 10);
    await at(fiveLeft);
    const bike = (await dashboard()).vehicles.find(
      (v: { vehicle: { id: number } }) => v.vehicle.id === bikeId,
    );
    expect(bike.canRenew).toBe(true);

    const renew = await user.post(`/api/subscriptions/${bikeSubId}/renew`).send({ months: 1 });
    expect(renew.status).toBe(201);
    const dayAfter = new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
    expect(renew.body).toMatchObject({ status: 'PENDING', startDate: dayAfter });
    expect(
      (await user.post(`/api/subscriptions/${bikeSubId}/renew`).send({ months: 1 })).status,
    ).toBe(409);
    const after = (await dashboard()).vehicles.find(
      (v: { vehicle: { id: number } }) => v.vehicle.id === bikeId,
    );
    expect(after).toMatchObject({ canRenew: false, pending: { id: renew.body.id } });
    expect(after.subscription.id).toBe(bikeSubId);
  });

  it('plan users get a One-time badge for a confirmed booking', async () => {
    const before = await dashboard();
    expect(before.badges.oneTime).toBe(false);
    const svc = (await admin.get('/api/admin/one-time-services')).body[0];
    await admin.put(`/api/admin/one-time-services/${svc.id}`).send({
      ...svc,
      isActive: true,
      prices: svc.appliesTo.map((t: string) => ({ vehicleType: t, price: 299 })),
    });
    const [y, m, d] = before.today.split('-').map(Number);
    const tomorrow = new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
    const booking = await user.post('/api/bookings').send({
      serviceId: svc.id,
      vehicleId: carId,
      ...address,
      preferredDate: tomorrow,
      preferredSlot: 'MORNING',
    });
    expect(booking.status).toBe(201);
    await admin
      .post(`/api/admin/bookings/${booking.body.id}/confirm`)
      .send({ washerId, date: tomorrow, slot: 'MORNING' });
    const after = await dashboard();
    expect(after.defaultTab).toBe('monthly');
    expect(after.badges.oneTime).toBe(true);
    expect(after.upcomingBookings[0]).toMatchObject({ id: booking.body.id, status: 'CONFIRMED' });
    expect(after.lowestOneTimePrice).toBe(299);
  });

  it('a customer with only one-time bookings opens on One-time', async () => {
    const svc = (await agent(app).get('/api/one-time-services')).body[0];
    const today = (await other.get('/api/me/dashboard')).body.today;
    const [y, m, d] = today.split('-').map(Number);
    const tomorrow = new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
    await other.post('/api/bookings').send({
      serviceId: svc.id,
      category: 'CAR',
      carType: 'SEDAN',
      registrationNumber: 'MH12ZZ9999',
      vehicleColor: 'Blue',
      ...address,
      preferredDate: tomorrow,
      preferredSlot: 'MORNING',
    });
    const dash = (await other.get('/api/me/dashboard')).body;
    expect(dash).toMatchObject({ state: 'none', defaultTab: 'one-time' });
    expect(dash.badges).toEqual({ monthly: false, oneTime: true });
  });
});
