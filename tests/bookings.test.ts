// One-time wash bookings: services, booking rules, washer jobs, payments and "My washes".
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type supertest from 'supertest';
import { agent, dbAvailable, freshApp, morningIst, setNow, verifiedSignup } from './helpers';

const up = await dbAvailable();
type Agent = ReturnType<typeof supertest.agent>;

const DAY1 = '2026-10-10';
const DAY2 = '2026-10-11';

describe.runIf(up)('one-time wash bookings', () => {
  let app: Awaited<ReturnType<typeof freshApp>>['app'];
  let close: () => Promise<void>;
  let admin: Agent;
  let washer: Agent;
  let user: Agent;
  let other: Agent;
  let userId: number;
  let washerId: number;
  let exteriorId: number;
  let interiorId: number;
  let fullId: number;
  let firstBooking: number;

  const address = {
    societyOrBuilding: 'Kumar Pebble Park',
    flatOrHouseNo: 'B-402',
    area: 'Hadapsar',
    city: 'Pune',
    pincode: '411028',
  };
  const carBooking = (extra: Record<string, unknown> = {}) => ({
    serviceId: exteriorId,
    category: 'CAR',
    carType: 'SEDAN',
    registrationNumber: 'mh 12 ab 1234',
    vehicleColor: 'White',
    ...address,
    parkingNotes: 'Basement slot 42',
    preferredDate: DAY2,
    preferredSlot: 'MORNING',
    ...extra,
  });

  async function mails() {
    const { testMails } = await import('../server/modules/notifications/notifications.service');
    return testMails;
  }

  beforeAll(async () => {
    setNow(morningIst(DAY1));
    ({ app, close } = await freshApp());
    admin = agent(app);
    washer = agent(app);
    user = agent(app);
    other = agent(app);
    await admin.post('/api/auth/login').send({ identifier: '9000000001', password: 'admin12345' });
    const w = await admin
      .post('/api/admin/washers')
      .send({ name: 'Ravi Kumar', mobile: '9000000002', password: 'washer123' });
    washerId = w.body.id;
    await washer.post('/api/auth/login').send({ identifier: '9000000002', password: 'washer123' });
    const signup = await verifiedSignup(user, {
      name: 'Neha Shah',
      mobile: '9820011111',
      email: 'neha@example.com',
      password: 'neha12345',
      ...address,
    });
    expect(signup.status).toBe(201);
    userId = signup.body.user.id;
    await verifiedSignup(other, {
      name: 'Amit Rao',
      mobile: '9820022222',
      email: 'amit@example.com',
      password: 'amit12345',
      ...address,
    });
  });

  afterAll(async () => {
    vi.useRealTimers();
    await close?.();
  });

  it('seeds inactive services; the public list shows only active ones with prices', async () => {
    expect((await agent(app).get('/api/one-time-services')).body).toEqual([]);
    const all = (await admin.get('/api/admin/one-time-services')).body;
    expect(all.map((s: { name: string }) => s.name)).toEqual([
      'Exterior foam wash',
      'Interior clean',
      'Full wash',
    ]);
    [exteriorId, interiorId, fullId] = all.map((s: { id: number }) => s.id);
    const ext = all[0];
    expect(ext).toMatchObject({
      isActive: false,
      appliesTo: ['HATCHBACK', 'SEDAN', 'SUV', 'BIKE'],
    });

    const save = await admin.put(`/api/admin/one-time-services/${exteriorId}`).send({
      ...ext,
      isActive: true,
      prices: [
        { vehicleType: 'HATCHBACK', price: 299 },
        { vehicleType: 'SEDAN', price: 349 },
        { vehicleType: 'SUV', price: 399 },
        { vehicleType: 'BIKE', price: 149 },
      ],
    });
    expect(save.status).toBe(200);
    const interior = all[1];
    await admin.put(`/api/admin/one-time-services/${interiorId}`).send({
      ...interior,
      isActive: true,
      prices: [
        { vehicleType: 'HATCHBACK', price: 499 },
        { vehicleType: 'SEDAN', price: 549 },
        { vehicleType: 'SUV', price: 599 },
      ],
    });

    // Every type it applies to needs a price.
    const missing = await admin
      .put(`/api/admin/one-time-services/${fullId}`)
      .send({ ...all[2], prices: [{ vehicleType: 'SEDAN', price: 1 }] });
    expect(missing.status).toBe(400);

    const pub = (await agent(app).get('/api/one-time-services')).body;
    expect(pub.map((s: { id: number }) => s.id)).toEqual([exteriorId, interiorId]);
    expect(pub[0].prices).toEqual([
      { vehicleType: 'HATCHBACK', price: 299 },
      { vehicleType: 'SEDAN', price: 349 },
      { vehicleType: 'SUV', price: 399 },
      { vehicleType: 'BIKE', price: 149 },
    ]);
    expect(pub[0].fromPrice).toBe(149);
  });

  it('needs a login, and only vehicle types the service applies to', async () => {
    expect((await agent(app).post('/api/bookings').send(carBooking())).status).toBe(401);
    const bike = await user
      .post('/api/bookings')
      .send(carBooking({ serviceId: interiorId, category: 'BIKE', carType: null }));
    expect(bike.status).toBe(400);
    expect(bike.body.error.code).toBe('VEHICLE_TYPE_NOT_ALLOWED');

    const today = await user.post('/api/bookings').send(carBooking({ preferredDate: DAY1 }));
    expect(today.status).toBe(422);
    expect(today.body.error.code).toBe('DATE_OUT_OF_RANGE');
  });

  it('stores a price snapshot and creates no vehicle', async () => {
    const res = await user.post('/api/bookings').send(carBooking());
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      status: 'REQUESTED',
      price: 349,
      vehicleType: 'SEDAN',
      vehicleId: null,
      registrationNumber: 'MH 12 AB 1234',
      paymentStatus: 'UNPAID',
      canCancel: true,
    });
    expect(res.body.ref).toMatch(/^SG-B-\d{6}$/);
    expect(res.body.events).toHaveLength(1);
    firstBooking = res.body.id;
    expect((await mails()).at(-1)).toMatchObject({ to: 'neha@example.com', kind: 'RECEIVED' });
    expect((await user.get('/api/me/vehicles')).body).toEqual([]);

    const ext = (await admin.get('/api/admin/one-time-services')).body[0];
    await admin.put(`/api/admin/one-time-services/${exteriorId}`).send({
      ...ext,
      prices: ext.prices.map((p: { vehicleType: string; price: number }) => ({
        ...p,
        price: p.price + 100,
      })),
    });
    expect((await user.get(`/api/bookings/${firstBooking}`)).body.price).toBe(349);
  });

  it('"Save this vehicle" adds it to the account', async () => {
    const res = await user.post('/api/bookings').send(
      carBooking({
        registrationNumber: 'MH12CD5678',
        saveVehicle: true,
        vehicleMake: 'Hyundai',
        vehicleModel: 'Creta',
        carType: 'SUV',
      }),
    );
    expect(res.status).toBe(201);
    expect(res.body.vehicleId).toBeTruthy();
    const vs = (await user.get('/api/me/vehicles')).body;
    expect(vs.map((v: { registrationNumber: string }) => v.registrationNumber)).toEqual([
      'MH 12 CD 5678',
    ]);
  });

  it('limits open bookings per customer', async () => {
    expect((await user.post('/api/bookings').send(carBooking())).status).toBe(201);
    const fourth = await user.post('/api/bookings').send(carBooking());
    expect(fourth.status).toBe(422);
    expect(fourth.body.error.code).toBe('TOO_MANY_OPEN_BOOKINGS');
    expect((await user.get('/api/bookings/options')).body).toMatchObject({
      openCount: 3,
      maxOpen: 3,
      minDate: DAY2,
    });
  });

  it('customer can cancel before the cutoff, not after', async () => {
    const list = (await user.get('/api/bookings')).body;
    const last = list[0].id;
    const ok = await user.post(`/api/bookings/${last}/cancel`);
    expect(ok.status).toBe(200);
    expect(ok.body.status).toBe('CANCELLED');
    expect(ok.body.events.map((e: { toStatus: string }) => e.toStatus)).toEqual([
      'REQUESTED',
      'CANCELLED',
    ]);
    expect((await mails()).at(-1)).toMatchObject({ kind: 'CANCELLED' });
    // Someone else's booking is invisible.
    expect((await other.post(`/api/bookings/${firstBooking}/cancel`)).status).toBe(404);

    // 12 h before the 08:00 slot on DAY2 is 20:00 on DAY1.
    setNow('2026-10-10T14:31:00Z');
    const late = await user.post(`/api/bookings/${firstBooking}/cancel`);
    expect(late.status).toBe(422);
    expect(late.body.error.code).toBe('CANCEL_TOO_LATE');
    expect((await user.get(`/api/bookings/${firstBooking}`)).body.canCancel).toBe(false);
  });

  it('admin confirms; the washer sees it on the day and marks it done', async () => {
    const confirm = await admin
      .post(`/api/admin/bookings/${firstBooking}/confirm`)
      .send({ washerId, date: DAY2, slot: 'EARLY_MORNING' });
    expect(confirm.status).toBe(200);
    expect(confirm.body).toMatchObject({
      status: 'CONFIRMED',
      scheduledDate: DAY2,
      assignedWasherName: 'Ravi Kumar',
    });
    expect((await mails()).at(-1)).toMatchObject({ kind: 'CONFIRMED' });
    // Customers see only the washer's first name.
    expect((await user.get(`/api/bookings/${firstBooking}`)).body.assignedWasherName).toBe('Ravi');

    // Not on the list (and can't be done) before the day.
    expect((await washer.get('/api/washer/today')).body.groups).toEqual([]);
    expect((await washer.post(`/api/washer/bookings/${firstBooking}/complete`)).status).toBe(422);

    setNow(morningIst(DAY2));
    const today = (await washer.get('/api/washer/today')).body;
    expect(today.counts).toMatchObject({ toDo: 1, done: 0 });
    expect(today.groups[0]).toMatchObject({ society: 'Kumar Pebble Park, Hadapsar' });
    expect(today.groups[0].bookings[0]).toMatchObject({
      bookingId: firstBooking,
      serviceName: 'Exterior foam wash',
      parkingNotes: 'Basement slot 42',
      slot: 'EARLY_MORNING',
    });

    const done = await washer.post(`/api/washer/bookings/${firstBooking}/complete`);
    expect(done.status).toBe(200);
    expect(done.body.status).toBe('COMPLETED');
    expect(new Date(done.body.completedAt).toISOString()).toBe(
      new Date(morningIst(DAY2)).toISOString(),
    );
    expect(done.body.events.map((e: { toStatus: string }) => e.toStatus)).toEqual([
      'REQUESTED',
      'CONFIRMED',
      'COMPLETED',
    ]);
    expect((await mails()).at(-1)).toMatchObject({ kind: 'COMPLETED', to: 'neha@example.com' });
    expect((await washer.get('/api/washer/today')).body.counts).toMatchObject({ toDo: 0, done: 1 });
    expect((await admin.get('/api/admin/dashboard')).body.bookings).toMatchObject({
      requested: 1,
      today: 1,
    });
  });

  it('not done can be rescheduled; admin cancel needs a reason', async () => {
    const list = (await user.get('/api/bookings?status=REQUESTED')).body;
    const id = list[0].id;
    await admin
      .post(`/api/admin/bookings/${id}/confirm`)
      .send({ washerId, date: DAY2, slot: 'EVENING' });
    const nd = await washer.post(`/api/washer/bookings/${id}/not-done`).send({ reason: '' });
    expect(nd.status).toBe(400);
    expect(
      (
        await washer
          .post(`/api/washer/bookings/${id}/not-done`)
          .send({ reason: 'Vehicle not found' })
      ).body,
    ).toMatchObject({ status: 'NOT_DONE', notDoneReason: 'Vehicle not found' });
    const again = await admin
      .post(`/api/admin/bookings/${id}/reschedule`)
      .send({ date: '2026-10-12', slot: 'MORNING' });
    expect(again.body).toMatchObject({ status: 'CONFIRMED', scheduledDate: '2026-10-12' });
    expect((await admin.post(`/api/admin/bookings/${id}/cancel`).send({})).status).toBe(400);
    const cancel = await admin
      .post(`/api/admin/bookings/${id}/cancel`)
      .send({ reason: 'Customer moved' });
    expect(cancel.body).toMatchObject({ status: 'CANCELLED', cancelReason: 'Customer moved' });
  });

  it('payments link to a booking and mark it paid', async () => {
    const both = await admin.post('/api/admin/payments').send({
      userId,
      bookingId: firstBooking,
      subscriptionId: 1,
      amount: 349,
      mode: 'UPI',
      paidOn: DAY2,
    });
    expect(both.status).toBe(400);
    const part = await admin
      .post('/api/admin/payments')
      .send({ userId, bookingId: firstBooking, amount: 200, mode: 'CASH', paidOn: DAY2 });
    expect(part.status).toBe(201);
    expect(part.body).toMatchObject({ bookingId: firstBooking, serviceName: 'Exterior foam wash' });
    expect((await user.get(`/api/bookings/${firstBooking}`)).body.paymentStatus).toBe('UNPAID');
    await admin
      .post('/api/admin/payments')
      .send({ userId, bookingId: firstBooking, amount: 149, mode: 'UPI', paidOn: DAY2 });
    expect((await user.get(`/api/bookings/${firstBooking}`)).body).toMatchObject({
      paymentStatus: 'PAID',
      paidAmount: 349,
    });
    const paid = await admin.get('/api/admin/bookings?paymentStatus=PAID');
    expect(paid.body.items.map((b: { id: number }) => b.id)).toEqual([firstBooking]);
  });

  it('"My washes" combines monthly and one-time washes, with filters', async () => {
    // A monthly plan for the saved Creta, washed today.
    const vehicleId = (await user.get('/api/me/vehicles')).body[0].id;
    const plans = (await agent(app).get('/api/public/plans')).body;
    const car = plans[0];
    const sub = await admin.post('/api/admin/subscriptions/activate').send({
      userId,
      vehicleId,
      planId: car.id,
      months: 1,
      startDate: DAY2,
      washerId,
      withoutPayment: true,
      withoutPaymentReason: 'test',
    });
    expect(sub.status).toBe(201);
    const exterior = car.activities.find((a: { quotaPerMonth: number }) => a.quotaPerMonth === 15);
    const log = await washer
      .post('/api/washer/logs')
      .send({ subscriptionId: sub.body.id, planActivityId: exterior.id, status: 'DONE' });
    expect(log.status).toBe(201);
    const upcomingBooking = await user
      .post('/api/bookings')
      .send(carBooking({ preferredDate: '2026-10-12' }));
    expect(upcomingBooking.status).toBe(201);

    const all = (await user.get('/api/me/washes')).body;
    expect(all.items.map((i: { kind: string }) => i.kind).sort()).toEqual([
      'MONTHLY',
      'ONE_TIME',
      'ONE_TIME',
      'ONE_TIME',
      'ONE_TIME',
    ]);
    expect(all.registrations).toEqual(['MH 12 AB 1234', 'MH 12 CD 5678']);

    const monthly = (await user.get('/api/me/washes?type=monthly')).body;
    expect(monthly.items).toHaveLength(1);
    expect(monthly.items[0].log.activityName).toBe(exterior.name);

    const oneTime = (await user.get('/api/me/washes?type=one_time')).body;
    expect(oneTime.items.every((i: { kind: string }) => i.kind === 'ONE_TIME')).toBe(true);

    const byReg = (await user.get('/api/me/washes?reg=MH12CD5678')).body;
    expect(byReg.items.map((i: { registrationNumber: string }) => i.registrationNumber)).toEqual(
      expect.arrayContaining(['MH 12 CD 5678']),
    );
    expect(
      byReg.items.every(
        (i: { registrationNumber: string }) => i.registrationNumber === 'MH 12 CD 5678',
      ),
    ).toBe(true);

    const upcoming = (await user.get('/api/me/washes?status=upcoming')).body;
    expect(upcoming.items.map((i: { booking: { status: string } }) => i.booking.status)).toEqual([
      'REQUESTED',
    ]);
    const completed = (await user.get('/api/me/washes?status=completed')).body;
    expect(completed.items).toHaveLength(2);
    const cancelled = (await user.get('/api/me/washes?status=cancelled')).body;
    expect(cancelled.items.map((i: { booking: { status: string } }) => i.booking.status)).toEqual([
      'CANCELLED',
      'CANCELLED',
    ]);

    const range = (await user.get(`/api/me/washes?from=${DAY1}&to=${DAY1}`)).body;
    expect(range.items).toEqual([]);
    const other2 = (await other.get('/api/me/washes')).body;
    expect(other2.items).toEqual([]);
  });
});
