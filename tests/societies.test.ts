// Societies: onboarding, customer choice, default washer, bulk assignment, filters.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type supertest from 'supertest';
import { agent, dbAvailable, freshApp, morningIst, setNow, verifiedSignup } from './helpers';

const up = await dbAvailable();

type Agent = ReturnType<typeof supertest.agent>;
const DAY = '2026-10-12';

const address = (extra: Record<string, unknown>) => ({
  flatOrHouseNo: 'A-101',
  area: 'Hadapsar',
  city: 'Pune',
  pincode: '411028',
  ...extra,
});
const car = (reg: string) => ({
  category: 'CAR',
  carType: 'HATCHBACK',
  registrationNumber: reg,
  make: 'Maruti',
  model: 'Swift',
  color: 'Red',
});

describe.runIf(up)('Societies', () => {
  let app: Awaited<ReturnType<typeof freshApp>>['app'];
  let close: () => Promise<void>;
  let admin: Agent;
  let carPlanId: number;
  let ravi: number;
  let suresh: number;
  let pebble: number;

  async function signup(name: string, mobile: string, reg: string, addr: Record<string, unknown>) {
    const a = agent(app);
    const res = await verifiedSignup(a, {
      name,
      mobile,
      email: `${mobile}@example.com`,
      password: 'secret123',
      ...address(addr),
      vehicles: [car(reg)],
    });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    const vehicles = await a.get('/api/me/vehicles');
    return { a, userId: res.body.user.id as number, vehicleId: vehicles.body[0].id as number };
  }

  async function activate(userId: number, vehicleId: number, extra: Record<string, unknown> = {}) {
    const res = await admin.post('/api/admin/subscriptions/activate').send({
      userId,
      vehicleId,
      planId: carPlanId,
      months: 1,
      startDate: DAY,
      payment: { amount: 799, mode: 'CASH', reference: null, paidOn: DAY },
      ...extra,
    });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    return res.body;
  }

  beforeAll(async () => {
    setNow(morningIst(DAY));
    ({ app, close } = await freshApp());
    admin = agent(app);
    await admin.post('/api/auth/login').send({ identifier: '9000000001', password: 'admin12345' });
    carPlanId = (await admin.get('/api/admin/plans')).body[0].id;
    ravi = (
      await admin
        .post('/api/admin/washers')
        .send({ name: 'Ravi', mobile: '9000000002', password: 'washer123' })
    ).body.id;
    suresh = (
      await admin
        .post('/api/admin/washers')
        .send({ name: 'Suresh', mobile: '9000000003', password: 'washer123' })
    ).body.id;
  });

  afterAll(async () => {
    vi.useRealTimers();
    await close?.();
  });

  it('admin onboards a society with a default washer; customers see active ones', async () => {
    const res = await admin.post('/api/admin/societies').send({
      name: 'Kumar Pebble Park',
      area: 'Hadapsar',
      city: 'Pune',
      pincode: '411028',
      defaultWasherId: ravi,
    });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      name: 'Kumar Pebble Park',
      defaultWasherName: 'Ravi',
      customers: 0,
    });
    pebble = res.body.id;

    const dup = await admin
      .post('/api/admin/societies')
      .send({ name: 'Kumar Pebble Park', area: 'Hadapsar', city: 'Pune', pincode: '411028' });
    expect(dup.status).toBe(409);

    const hidden = await admin
      .post('/api/admin/societies')
      .send({ name: 'Old Tower', area: 'Baner', city: 'Pune', pincode: '411045', isActive: false });
    expect(hidden.status).toBe(201);

    const pub = await agent(app).get('/api/public/societies');
    expect(pub.body.map((s: { name: string }) => s.name)).toEqual(['Kumar Pebble Park']);

    // Non-admins can't manage societies.
    expect((await agent(app).get('/api/admin/societies')).status).toBe(401);
  });

  it('a customer who picks the society is linked and gets its name', async () => {
    const { userId } = await signup('Priya Shah', '9811111111', 'MH12KT4410', {
      societyId: pebble,
    });
    const detail = await admin.get(`/api/admin/users/${userId}`);
    expect(detail.body.user).toMatchObject({
      societyId: pebble,
      societyOrBuilding: 'Kumar Pebble Park',
    });
    expect(detail.body.society.defaultWasherName).toBe('Ravi');
  });

  it('signup needs a society: picked or typed', async () => {
    const res = await agent(app)
      .post('/api/auth/signup')
      .send({
        name: 'X',
        mobile: '9822222229',
        email: 'x9822222229@example.com',
        password: 'secret123',
        ...address({}),
      });
    expect(res.status).toBe(400);
    expect(res.body.error.details.fieldErrors.societyOrBuilding).toBeTruthy();
  });

  it('activation without a washer uses the society’s default washer', async () => {
    const { userId, vehicleId } = await signup('Meera Joshi', '9812222222', 'MH14GA7788', {
      societyId: pebble,
    });
    const sub = await activate(userId, vehicleId);
    expect(sub.assignedWasherName).toBe('Ravi');
    // An explicit "no washer" is respected.
    const other = await signup('Anil Patil', '9813333333', 'MH14FZ0921', { societyId: pebble });
    const none = await activate(other.userId, other.vehicleId, { washerId: null });
    expect(none.assignedWasherName).toBeNull();
  });

  it('typed (not onboarded) society names show up for onboarding and get linked', async () => {
    const a = await signup('Rohan K', '9814444444', 'MH14EH1234', {
      societyOrBuilding: 'Rohan Mithila',
    });
    await signup('Sneha P', '9815555555', 'MH14EH5678', {
      societyOrBuilding: '  rohan   mithila ',
    });
    await activate(a.userId, a.vehicleId);

    const unlisted = await admin.get('/api/admin/societies/unlisted');
    expect(unlisted.body).toHaveLength(1);
    expect(unlisted.body[0]).toMatchObject({
      key: 'rohan mithila',
      customers: 2,
      activeSubscriptions: 1,
    });

    const created = await admin.post('/api/admin/societies').send({
      name: 'Rohan Mithila',
      area: 'Viman Nagar',
      city: 'Pune',
      pincode: '411014',
      defaultWasherId: suresh,
      linkUnlistedName: unlisted.body[0].name,
    });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ customers: 2, activeSubscriptions: 1, unassigned: 1 });
    expect((await admin.get('/api/admin/societies/unlisted')).body).toEqual([]);
    // A default washer applies to new plans; existing ones are filled in explicitly.
    const fill = await admin
      .post(`/api/admin/societies/${created.body.id}/assign-washer`)
      .send({ washerId: suresh, onlyUnassigned: true });
    expect(fill.body.updated).toBe(1);
  });

  it('assigns a washer to every running subscription in a society', async () => {
    const list = await admin.get('/api/admin/societies');
    const pebbleRow = list.body.find((s: { id: number }) => s.id === pebble);
    expect(pebbleRow).toMatchObject({ activeSubscriptions: 2, unassigned: 1 });

    // Only fill the gaps first…
    const gaps = await admin
      .post(`/api/admin/societies/${pebble}/assign-washer`)
      .send({ washerId: ravi, onlyUnassigned: true, makeDefault: false });
    expect(gaps.body.updated).toBe(1);
    expect(gaps.body.society).toMatchObject({
      unassigned: 0,
      washers: [{ name: 'Ravi', count: 2 }],
    });

    // …then hand the whole society to Suresh and make him the default.
    const all = await admin
      .post(`/api/admin/societies/${pebble}/assign-washer`)
      .send({ washerId: suresh });
    expect(all.body.updated).toBe(2);
    expect(all.body.society).toMatchObject({
      defaultWasherName: 'Suresh',
      washers: [{ name: 'Suresh', count: 2 }],
    });

    const washer = agent(app);
    await washer.post('/api/auth/login').send({ identifier: '9000000003', password: 'washer123' });
    const today = await washer.get('/api/washer/today');
    expect(today.body.groups.map((g: { society: string }) => g.society)).toEqual([
      'Kumar Pebble Park, Hadapsar',
      'Rohan Mithila, Hadapsar',
    ]);
  });

  it('filters subscriptions, vehicles and wash logs by society; dashboard shows societies', async () => {
    const subs = await admin.get(`/api/admin/subscriptions?filter=active&societyId=${pebble}`);
    expect(subs.body.items.map((s: { userName: string }) => s.userName).sort()).toEqual([
      'Anil Patil',
      'Meera Joshi',
    ]);
    const vehicles = await admin.get(`/api/admin/vehicles?societyId=${pebble}`);
    expect(vehicles.body.total).toBe(3);
    const logs = await admin.get(`/api/admin/wash-logs?date=${DAY}&societyId=${pebble}`);
    // 2 cars' exterior washes; the monthly interior clean only counts as missed at month end.
    expect(logs.body.missed.length).toBe(2);

    const detail = await admin.get(`/api/admin/societies/${pebble}`);
    expect(detail.body.customers).toHaveLength(3);
    expect(detail.body.today).toMatchObject({ due: 4, done: 0 });

    const dash = await admin.get('/api/admin/dashboard');
    expect(dash.body.expired.count).toBe(0); // nothing has lapsed yet
    expect(
      dash.body.societies.map((s: { name: string; due: number }) => `${s.name}:${s.due}`),
    ).toEqual(['Kumar Pebble Park:4', 'Rohan Mithila:2']);
  });

  it('renaming a society updates its customers; customers can switch society in their profile', async () => {
    await admin.put(`/api/admin/societies/${pebble}`).send({
      name: 'Kumar Pebble Park Phase 1',
      area: 'Hadapsar',
      city: 'Pune',
      pincode: '411028',
      defaultWasherId: suresh,
    });
    const users = await admin.get('/api/admin/users?search=Pebble');
    expect(
      users.body.items.every(
        (u: { societyOrBuilding: string }) => u.societyOrBuilding === 'Kumar Pebble Park Phase 1',
      ),
    ).toBe(true);

    const sneha = agent(app);
    await sneha.post('/api/auth/login').send({ identifier: '9815555555', password: 'secret123' });
    const res = await sneha
      .put('/api/me/profile')
      .send({ name: 'Sneha P', ...address({ societyId: pebble }) });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      societyId: pebble,
      societyOrBuilding: 'Kumar Pebble Park Phase 1',
    });
  });
});
