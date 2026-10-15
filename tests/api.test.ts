// End-to-end acceptance walkthrough (plan §13) against a real MySQL database.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type supertest from 'supertest';
import { addDays } from '../server/lib/dates';
import { agent, dbAvailable, freshApp, morningIst, setNow } from './helpers';

const up = await dbAvailable();
if (!up) console.warn('⚠ Test database not reachable — skipping API tests (see .env.test)');

type Agent = ReturnType<typeof supertest.agent>;

describe.runIf(up)('SaafGadi API — acceptance walkthrough', () => {
  let app: Awaited<ReturnType<typeof freshApp>>['app'];
  let close: () => Promise<void>;
  let admin: Agent;
  let washer: Agent;
  let user: Agent;
  let otherWasher: Agent;
  const DAY1 = '2026-10-10';
  let carPlanId: number;
  let interiorId: number;
  let exteriorId: number;
  let ravi: { id: number };
  let vehicleId: number;
  let userId: number;
  let subscriptionId: number;

  beforeAll(async () => {
    setNow(morningIst(DAY1));
    ({ app, close } = await freshApp());
    admin = agent(app);
    washer = agent(app);
    user = agent(app);
    otherWasher = agent(app);
  });

  /** Sessions last 7 days; log everyone in again after jumping the clock. */
  async function relogin() {
    await admin.post('/api/auth/login').send({ identifier: '9000000001', password: 'admin12345' });
    await washer.post('/api/auth/login').send({ identifier: '9000000002', password: 'washer123' });
    await user.post('/api/auth/login').send({ identifier: '9820012345', password: 'rohan1234' });
  }

  afterAll(async () => {
    vi.useRealTimers();
    await close?.();
  });

  it('1. empty DB → tables, seeded admin, plans and settings', async () => {
    const health = await agent(app).get('/api/health');
    expect(health.status).toBe(200);
    expect(health.body.db).toBe('ok');

    const plans = await agent(app).get('/api/public/plans');
    expect(plans.body.map((p: { name: string }) => p.name)).toEqual([
      'Car Care Plan',
      'Bike Care Plan',
    ]);
    const car = plans.body[0];
    carPlanId = car.id;
    exteriorId = car.activities.find((a: { quotaPerMonth: number }) => a.quotaPerMonth === 15).id;
    interiorId = car.activities.find((a: { quotaPerMonth: number }) => a.quotaPerMonth === 1).id;
    expect(car.prices.map((p: { vehicleType: string }) => p.vehicleType)).toEqual([
      'HATCHBACK',
      'SEDAN',
      'SUV',
    ]);
    expect(plans.body[1].activities[0]).toMatchObject({ quotaPerMonth: 15, minGapDays: 2 });

    const bad = await admin
      .post('/api/auth/login')
      .send({ identifier: '9000000001', password: 'nope-nope' });
    expect(bad.status).toBe(401);
    const res = await admin
      .post('/api/auth/login')
      .send({ identifier: '9000000001', password: 'admin12345' });
    expect(res.status).toBe(200);
    expect(res.body.user.role).toBe('ADMIN');
    expect(res.body.user).not.toHaveProperty('passwordHash');
    expect(res.headers['set-cookie'][0]).toMatch(/HttpOnly/i);
  });

  it('2. admin sets prices and WhatsApp / call numbers', async () => {
    const prices = await admin.put(`/api/admin/plans/${carPlanId}/prices`).send({
      prices: [
        { vehicleType: 'HATCHBACK', monthlyPrice: 799 },
        { vehicleType: 'SEDAN', monthlyPrice: 999 },
        { vehicleType: 'SUV', monthlyPrice: 1199 },
      ],
    });
    expect(prices.status).toBe(200);
    expect(
      prices.body.prices.find((p: { vehicleType: string }) => p.vehicleType === 'SEDAN')
        .monthlyPrice,
    ).toBe(999);

    const wrongType = await admin
      .put(`/api/admin/plans/${carPlanId}/prices`)
      .send({ prices: [{ vehicleType: 'BIKE', monthlyPrice: 1 }] });
    expect(wrongType.status).toBe(400);

    const settings = await admin.put('/api/admin/settings').send({
      whatsapp_number: '98765 43210',
      call_number: '+91 98765 43211',
      business_name: 'SaafGadi',
      business_address: 'Baner, Pune',
      support_hours: '8 am – 8 pm',
      whatsapp_default_message: 'Hi SaafGadi!',
    });
    expect(settings.status).toBe(200);
    const contact = await agent(app).get('/api/public/contact');
    expect(contact.body).toMatchObject({
      whatsappNumber: '919876543210',
      callNumber: '919876543211',
    });
  });

  it('3. admin creates washer "Ravi"', async () => {
    const res = await admin
      .post('/api/admin/washers')
      .send({ name: 'Ravi', mobile: '9000000002', password: 'washer123' });
    expect(res.status).toBe(201);
    expect(res.body.role).toBe('WASHER');
    ravi = res.body;
    await admin
      .post('/api/admin/washers')
      .send({ name: 'Suresh', mobile: '9000000003', password: 'washer123' });
    expect(
      (
        await washer
          .post('/api/auth/login')
          .send({ identifier: '9000000002', password: 'washer123' })
      ).status,
    ).toBe(200);
    expect(
      (
        await otherWasher
          .post('/api/auth/login')
          .send({ identifier: '9000000003', password: 'washer123' })
      ).status,
    ).toBe(200);
  });

  it('4. visitor signs up with a sedan MH14EH1234 and becomes a USER', async () => {
    // Email is required for self sign-up.
    const noEmail = await agent(app).post('/api/auth/signup').send({
      name: 'No Email',
      mobile: '9820077777',
      email: '',
      password: 'secret123',
      societyOrBuilding: 'A',
      flatOrHouseNo: '1',
      area: 'A',
      city: 'Pune',
      pincode: '411001',
    });
    expect(noEmail.status).toBe(400);
    expect(noEmail.body.error.details.fieldErrors.email).toBeTruthy();

    const res = await user.post('/api/auth/signup').send({
      name: 'Rohan Kulkarni',
      mobile: '98200 12345',
      email: 'Rohan@Example.com',
      password: 'rohan1234',
      societyOrBuilding: 'Kumar Pebble Park',
      flatOrHouseNo: 'B-402',
      area: 'Hadapsar',
      city: 'Pune',
      pincode: '411028',
      vehicles: [
        {
          category: 'CAR',
          carType: 'SEDAN',
          registrationNumber: 'mh 14 eh-1234',
          make: 'Honda',
          model: 'City',
          color: 'White',
          parkingNotes: 'B-wing basement, slot 42',
        },
      ],
    });
    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({
      role: 'USER',
      email: 'rohan@example.com',
      emailVerified: false,
    });
    userId = res.body.user.id;

    const vehicles = await user.get('/api/me/vehicles');
    expect(vehicles.body).toHaveLength(1);
    expect(vehicles.body[0].registrationNumber).toBe('MH 14 EH 1234');
    vehicleId = vehicles.body[0].id;

    // Same number in another format is still a duplicate.
    const dup = await agent(app)
      .post('/api/auth/signup')
      .send({
        name: 'X',
        mobile: '9820099999',
        email: 'x@example.com',
        password: 'xxxxxxxx',
        societyOrBuilding: 'A',
        flatOrHouseNo: '1',
        area: 'A',
        city: 'Pune',
        pincode: '411001',
        vehicles: [
          {
            category: 'CAR',
            carType: 'SUV',
            registrationNumber: 'MH14EH1234',
            make: 'a',
            model: 'b',
            color: 'c',
          },
        ],
      });
    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe('REGISTRATION_TAKEN');
  });

  it('roles are enforced on the server', async () => {
    expect((await user.get('/api/admin/dashboard')).status).toBe(403);
    expect((await user.get('/api/washer/today')).status).toBe(403);
    expect((await washer.get('/api/me/dashboard')).status).toBe(403);
    expect((await washer.get('/api/admin/users')).status).toBe(403);
    expect((await admin.get('/api/me/dashboard')).status).toBe(403);
    expect((await agent(app).get('/api/me/dashboard')).status).toBe(401);
    const bad = await user.post('/api/me/vehicles').send({ category: 'CAR' });
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('5. user books Car Care → enquiry visible to admin (and not duplicated)', async () => {
    const e1 = await user
      .post('/api/me/enquiries')
      .send({ type: 'NEW_PLAN', vehicleId, planId: carPlanId });
    expect(e1.status).toBe(201);
    const e2 = await user
      .post('/api/me/enquiries')
      .send({ type: 'NEW_PLAN', vehicleId, planId: carPlanId });
    expect(e2.body.id).toBe(e1.body.id);

    const list = await admin.get('/api/admin/enquiries?status=OPEN');
    expect(list.body.items).toHaveLength(1);
    expect(list.body.items[0]).toMatchObject({
      planName: 'Car Care Plan',
      registrationNumber: 'MH 14 EH 1234',
    });
  });

  it('6. admin activates Car Care for 1 month with a UPI payment and assigns Ravi', async () => {
    const res = await admin.post('/api/admin/subscriptions/activate').send({
      userId,
      vehicleId,
      planId: carPlanId,
      months: 1,
      startDate: DAY1,
      washerId: ravi.id,
      payment: { amount: 999, mode: 'UPI', reference: 'UPI-REF-1', paidOn: DAY1 },
    });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      startDate: DAY1,
      endDate: '2026-11-09',
      status: 'ACTIVE',
      displayStatus: 'ACTIVE',
      monthlyPrice: 999,
      totalAmount: 999,
      paidAmount: 999,
      isUnpaid: false,
      assignedWasherName: 'Ravi',
    });
    subscriptionId = res.body.id;

    // A second plan overlapping the same dates is rejected.
    const overlap = await admin.post('/api/admin/subscriptions/activate').send({
      userId,
      vehicleId,
      planId: carPlanId,
      months: 1,
      startDate: '2026-10-20',
      withoutPayment: true,
      withoutPaymentReason: 'test',
    });
    expect(overlap.status).toBe(409);

    // Payment required unless explicitly activated without one.
    const noPay = await admin.post('/api/admin/subscriptions/activate').send({
      userId,
      vehicleId,
      planId: carPlanId,
      months: 1,
      startDate: '2026-12-01',
    });
    expect(noPay.status).toBe(400);

    // Once a plan exists, the owner sees the vehicle as locked and can't change its number.
    const mine = await user.get('/api/me/vehicles');
    expect(mine.body[0].hasSubscription).toBe(true);
    const relabel = await user.put(`/api/me/vehicles/${vehicleId}`).send({
      category: 'CAR',
      carType: 'SEDAN',
      registrationNumber: 'MH14EH9999',
      make: 'Honda',
      model: 'City',
      color: 'White',
    });
    expect(relabel.status).toBe(422);
    expect(relabel.body.error.code).toBe('VEHICLE_LOCKED');

    // Price changes never touch existing subscriptions.
    await admin
      .put(`/api/admin/plans/${carPlanId}/prices`)
      .send({ prices: [{ vehicleType: 'SEDAN', monthlyPrice: 1500 }] });
    const after = await admin.get(`/api/admin/subscriptions/${subscriptionId}`);
    expect(after.body.monthlyPrice).toBe(999);
  });

  it('7. Ravi sees the car under Today and marks exterior and interior DONE', async () => {
    const today = await washer.get('/api/washer/today');
    expect(today.status).toBe(200);
    expect(today.body.today).toBe(DAY1);
    expect(today.body.counts).toEqual({ toDo: 2, done: 0, notDone: 0 });
    const item = today.body.groups[0].items[0];
    expect(item).toMatchObject({
      registrationNumber: 'MH 14 EH 1234',
      ownerName: 'Rohan Kulkarni',
      parkingNotes: 'B-wing basement, slot 42',
      societyOrBuilding: 'Kumar Pebble Park',
    });
    expect(item.activities.map((a: { state: string }) => a.state)).toEqual(['DUE', 'DUE']);

    // Suresh is not assigned: sees nothing and can't log.
    expect((await otherWasher.get('/api/washer/today')).body.groups).toEqual([]);
    const notMine = await otherWasher
      .post('/api/washer/logs')
      .send({ subscriptionId, planActivityId: exteriorId, status: 'DONE' });
    expect(notMine.status).toBe(403);

    // A client-sent date is ignored: the server always uses today.
    const ext = await washer.post('/api/washer/logs').send({
      subscriptionId,
      planActivityId: exteriorId,
      status: 'DONE',
      serviceDate: '2026-10-01',
      performedAt: '2026-10-01T00:00:00Z',
    });
    expect(ext.status).toBe(201);
    expect(ext.body.serviceDate).toBe(DAY1);
    expect(ext.body.performedAt).toBe(new Date(morningIst(DAY1)).toISOString());

    const dup = await washer
      .post('/api/washer/logs')
      .send({ subscriptionId, planActivityId: exteriorId, status: 'DONE' });
    expect(dup.status).toBe(409);

    const noReason = await washer
      .post('/api/washer/logs')
      .send({ subscriptionId, planActivityId: interiorId, status: 'NOT_DONE' });
    expect(noReason.status).toBe(400);

    // Interior: first NOT_DONE, then changed to DONE on the same day.
    const int = await washer.post('/api/washer/logs').send({
      subscriptionId,
      planActivityId: interiorId,
      status: 'NOT_DONE',
      reason: 'VEHICLE_NOT_AVAILABLE',
    });
    expect(int.status).toBe(201);
    const fixed = await washer.put(`/api/washer/logs/${int.body.id}`).send({ status: 'DONE' });
    expect(fixed.status).toBe(200);
    expect(fixed.body).toMatchObject({ status: 'DONE', reason: null });

    const after = await washer.get('/api/washer/today');
    expect(after.body.counts).toEqual({ toDo: 0, done: 2, notDone: 0 });
  });

  it('8. user dashboard shows active plan and "Exterior 1 of 15 · Interior 1 of 1" with time', async () => {
    const res = await user.get('/api/me/dashboard');
    expect(res.status).toBe(200);
    const v = res.body.vehicles[0];
    expect(v.displayStatus).toBe('ACTIVE');
    expect(v.subscription.assignedWasherName).toBe('Ravi');
    expect(v.progress.map((p: { used: number; quota: number }) => `${p.used}/${p.quota}`)).toEqual([
      '1/15',
      '1/1',
    ]);
    expect(v.progress[0].resetDate).toBeNull(); // 1-month plan: no next month
    expect(v.recent).toHaveLength(2);
    expect(v.recent[0].performedAt).toMatch(/^2026-10-10T/);
    // The assigned washer's contact is shown to this customer.
    expect(v.washer).toEqual({ name: 'Ravi', mobile: '9000000002' });
  });

  it('9. next day: exterior is pending (not due), interior complete and cannot be logged', async () => {
    setNow(morningIst(addDays(DAY1, 1)));
    const today = await washer.get('/api/washer/today');
    const item = today.body.groups[0].items[0];
    expect(item.activities).toHaveLength(1);
    expect(item.activities[0]).toMatchObject({
      activityId: exteriorId,
      state: 'PENDING',
      canLog: true,
    });
    expect(today.body.counts.toDo).toBe(0);

    const interior = await washer
      .post('/api/washer/logs')
      .send({ subscriptionId, planActivityId: interiorId, status: 'DONE' });
    expect(interior.status).toBe(422);
    expect(interior.body.error.code).toBe('ACTIVITY_COMPLETE');

    // Yesterday's entry can no longer be changed by the washer.
    const logs = await washer.get('/api/washer/history');
    const yesterday = logs.body.find(
      (l: { planActivityId: number }) => l.planActivityId === exteriorId,
    );
    const edit = await washer
      .put(`/api/washer/logs/${yesterday.id}`)
      .send({ status: 'NOT_DONE', reason: 'OTHER' });
    expect(edit.status).toBe(403);
  });

  it('timezone boundary: 23:50 IST is still today, 00:10 IST is tomorrow', async () => {
    setNow('2026-10-11T18:20:00Z'); // 23:50 IST, 11 Oct
    expect((await washer.get('/api/washer/today')).body.today).toBe('2026-10-11');
    setNow('2026-10-11T18:40:00Z'); // 00:10 IST, 12 Oct
    expect((await washer.get('/api/washer/today')).body.today).toBe('2026-10-12');
  });

  it('10. after 15 exterior washes a 16th is rejected; quota resets next month', async () => {
    // Day 2 (11 Oct) catch-up, then every other day from 12 Oct: 1 + 1 + 13 = 15.
    setNow(morningIst('2026-10-11'));
    const catchUp = await washer
      .post('/api/washer/logs')
      .send({ subscriptionId, planActivityId: exteriorId, status: 'DONE' });
    expect(catchUp.status).toBe(201);
    expect(catchUp.body.isCatchUp).toBe(true);

    let day = '2026-10-13';
    for (let i = 0; i < 13; i++) {
      setNow(morningIst(day));
      if (i % 3 === 0) await relogin();
      const r = await washer
        .post('/api/washer/logs')
        .send({ subscriptionId, planActivityId: exteriorId, status: 'DONE' });
      expect(r.status, `wash on ${day}`).toBe(201);
      day = addDays(day, 2);
    }
    // 13th logged on 6 Nov → 15 done. Next due date would be 8 Nov.
    setNow(morningIst('2026-11-08'));
    await relogin();
    const sixteenth = await washer
      .post('/api/washer/logs')
      .send({ subscriptionId, planActivityId: exteriorId, status: 'DONE' });
    expect(sixteenth.status).toBe(422);
    expect(sixteenth.body.error.code).toBe('ACTIVITY_COMPLETE');
    expect((await washer.get('/api/washer/today')).body.groups).toEqual([]);

    const dash = await user.get('/api/me/dashboard');
    expect(dash.body.vehicles[0].progress[0]).toMatchObject({ used: 15, state: 'COMPLETE' });

    // Renew for the next month: quotas start again from zero.
    const renewed = await admin.post(`/api/admin/subscriptions/${subscriptionId}/renew`).send({
      months: 1,
      payment: { amount: 999, mode: 'CASH', reference: null, paidOn: '2026-11-08' },
    });
    expect(renewed.status).toBe(201);
    expect(renewed.body).toMatchObject({
      startDate: '2026-11-10',
      endDate: '2026-12-09',
      assignedWasherName: 'Ravi',
      displayStatus: 'UPCOMING',
    });
    setNow(morningIst('2026-11-10'));
    const nextMonth = await washer.get('/api/washer/today');
    const acts = nextMonth.body.groups[0].items[0].activities;
    expect(acts.map((a: { state: string; used: number }) => `${a.state}:${a.used}`)).toEqual([
      'DUE:0',
      'DUE:0',
    ]);
  });

  it('11. admin sees today’s numbers, the payment in the list and the CSV', async () => {
    const dash = await admin.get('/api/admin/dashboard');
    expect(dash.status).toBe(200);
    expect(dash.body.washes).toMatchObject({ due: 2, toDo: 2, done: 0 });
    expect(dash.body.active).toMatchObject({ total: 1, cars: 1, bikes: 0 });
    expect(dash.body.washers.find((w: { name: string }) => w.name === 'Ravi')).toMatchObject({
      due: 2,
    });

    const payments = await admin.get('/api/admin/payments?from=2026-10-01&to=2026-10-31');
    expect(payments.body.items).toHaveLength(1);
    expect(payments.body.items[0]).toMatchObject({
      amount: 999,
      mode: 'UPI',
      reference: 'UPI-REF-1',
      userName: 'Rohan Kulkarni',
      // Receipt details: paid towards this subscription so far.
      subscriptionTotal: 999,
      paidToDate: 999,
      periodStart: expect.any(String),
    });

    const csv = await admin.get('/api/admin/payments/export.csv');
    expect(csv.status).toBe(200);
    expect(csv.headers['content-type']).toMatch(/text\/csv/);
    expect(csv.text).toContain('Rohan Kulkarni');
    expect(csv.text).toContain('999.00');
    expect(csv.text.split('\r\n').filter(Boolean)).toHaveLength(3); // header + 2 payments
  });

  it('admin can correct a past log (audited); quota rules still apply', async () => {
    const logs = await admin.get('/api/admin/wash-logs?date=2026-10-13');
    const log = logs.body.logs.items[0];
    const res = await admin
      .put(`/api/admin/wash-logs/${log.id}`)
      .send({ status: 'NOT_DONE', reason: 'WEATHER' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'NOT_DONE', editedByName: 'Test Admin' });
  });

  it('cancelling ends the subscription and frees the vehicle for a new plan', async () => {
    const list = await admin.get(`/api/admin/subscriptions?vehicleId=${vehicleId}&filter=active`);
    const current = list.body.items[0];
    const cancel = await admin
      .post(`/api/admin/subscriptions/${current.id}/cancel`)
      .send({ reason: 'Plan change' });
    expect(cancel.body).toMatchObject({ status: 'CANCELLED', endDate: '2026-11-10' });
    const fresh = await admin.post('/api/admin/subscriptions/activate').send({
      userId,
      vehicleId,
      planId: carPlanId,
      months: 3,
      startDate: '2026-11-10',
      withoutPayment: true,
      withoutPaymentReason: 'Pays at month end',
    });
    expect(fresh.status).toBe(201);
    expect(fresh.body).toMatchObject({ isUnpaid: true, monthlyPrice: 1500, endDate: '2027-02-09' });
    const dash = await admin.get('/api/admin/dashboard');
    expect(dash.body.unpaid.count).toBe(1);
  });

  it('washer contact respects the setting and the washer’s status', async () => {
    // The re-activated plan has no washer yet: nothing to show.
    expect((await user.get('/api/me/dashboard')).body.vehicles[0].washer).toBeNull();
    const current = (
      await admin.get(`/api/admin/subscriptions?vehicleId=${vehicleId}&filter=active`)
    ).body.items[0];
    await admin.put(`/api/admin/subscriptions/${current.id}/washer`).send({ washerId: ravi.id });
    const settings = (await admin.get('/api/admin/settings')).body;
    expect(settings.show_washer_contact).toBe('true');
    await admin.put('/api/admin/settings').send({ ...settings, show_washer_contact: false });
    expect((await user.get('/api/me/dashboard')).body.vehicles[0].washer).toBeNull();
    await admin.put('/api/admin/settings').send({ ...settings, show_washer_contact: true });
    expect((await user.get('/api/me/dashboard')).body.vehicles[0].washer).toMatchObject({
      name: 'Ravi',
    });
    // Never part of public data.
    expect(JSON.stringify((await agent(app).get('/api/public/contact')).body)).not.toContain(
      '9000000002',
    );
  });

  it('deactivated accounts cannot log in and existing sessions stop working', async () => {
    const res = await admin
      .put(`/api/admin/washers/${ravi.id}`)
      .send({ name: 'Ravi', mobile: '9000000002', isActive: false });
    expect(res.status).toBe(200);
    expect((await washer.get('/api/washer/today')).status).toBe(401);
    const login = await agent(app)
      .post('/api/auth/login')
      .send({ identifier: '9000000002', password: 'washer123' });
    // A deactivated washer's number is no longer shown to customers.
    expect((await user.get('/api/me/dashboard')).body.vehicles[0].washer).toBeNull();
    expect(login.status).toBe(403);
  });
});
