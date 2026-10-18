import { and, asc, count, desc, eq, gte, inArray, like, lte, sql, type SQL } from 'drizzle-orm';
import { alias } from 'drizzle-orm/mysql-core';
import { format, parseISO } from 'date-fns';
import { fromZonedTime } from 'date-fns-tz';
import type { z } from 'zod';
import {
  bookingRef,
  LABELS,
  OPEN_BOOKING_STATUSES,
  parseSlots,
  vehicleTypeOf,
  type BookingSlot,
  type BookingStatus,
  type SlotSetting,
} from '../../../shared/enums';
import { formatRegistration, normaliseRegistration } from '../../../shared/registration';
import type {
  adminBookingQuery,
  bookingConfirmSchema,
  bookingCreateSchema,
  bookingListQuery,
  bookingRescheduleSchema,
  myWashesQuery,
} from '../../../shared/schemas';
import type {
  BookingDto,
  BookingEventDto,
  BookingOptions,
  MyWashes,
  MyWashItem,
  Paged,
  WasherBookingItem,
} from '../../../shared/types';
import { getConfig } from '../../config';
import { getDb, type DbOrTx } from '../../db';
import {
  bookingEvents,
  bookings,
  oneTimeServices,
  payments,
  subscriptions,
  users,
  vehicles,
  washLogs,
} from '../../db/schema';
import { now, today } from '../../lib/clock';
import { addDays } from '../../lib/dates';
import { AppError, badRequest, conflict, forbidden, notFound } from '../../lib/errors';
import { qualified } from '../../lib/sql';
import { sendBookingEmail } from '../notifications/notifications.service';
import { getSettings } from '../settings/settings.service';
import { insertVehicle } from '../vehicles/vehicles.service';
import { findLogs } from '../wash-logs/wash-logs.service';
import { getService } from './services.service';

const washer = alias(users, 'washer');
const owner = alias(users, 'owner');

// ------------------------------------------------------------- settings

interface BookingRules {
  slots: SlotSetting[];
  allowSameDay: boolean;
}

async function rules(): Promise<BookingRules> {
  const s = await getSettings();
  return { slots: parseSlots(s.booking_slots), allowSameDay: s.booking_allow_same_day === 'true' };
}

/** When the slot starts, as an instant (slot times are in APP_TIMEZONE). */
function slotStart(date: string, slot: BookingSlot, slots: SlotSetting[]): Date {
  const s = slots.find((x) => x.key === slot)!;
  return fromZonedTime(`${date}T${s.start}:00`, getConfig().timezone);
}

export function slotLabel(slot: BookingSlot, slots: SlotSetting[]): string {
  const s = slots.find((x) => x.key === slot)!;
  return `${s.label} (${s.start}–${s.end})`;
}

function whenText(date: string, slot: BookingSlot, slots: SlotSetting[]): string {
  return `${format(parseISO(date), 'EEE, d MMM')} · ${slotLabel(slot, slots)}`;
}

// ------------------------------------------------------------- DTOs

const effectiveDate = sql<string>`coalesce(${bookings.scheduledDate}, ${bookings.preferredDate})`;
const effectiveSlot = sql<BookingSlot>`coalesce(${bookings.scheduledSlot}, ${bookings.preferredSlot})`;
const paidSql = sql<string>`(select coalesce(sum(\`bp\`.\`amount\`), 0) from \`payments\` \`bp\` where \`bp\`.\`booking_id\` = ${qualified(bookings.id)})`;

function baseQuery(db: DbOrTx) {
  return db
    .select({
      b: bookings,
      ownerName: owner.name,
      ownerMobile: owner.mobile,
      ownerEmail: owner.email,
      washerName: washer.name,
      paid: paidSql,
    })
    .from(bookings)
    .innerJoin(owner, eq(owner.id, bookings.userId))
    .leftJoin(washer, eq(washer.id, bookings.assignedWasherId))
    .$dynamic();
}

type Row = Awaited<ReturnType<ReturnType<typeof baseQuery>['execute']>>[number];

type Viewer = 'USER' | 'ADMIN';

function canCustomerCancel(b: Row['b'], slots: SlotSetting[]): boolean {
  if (b.status !== 'REQUESTED' && b.status !== 'CONFIRMED') return false;
  const date = b.scheduledDate ?? b.preferredDate;
  const slot = b.scheduledSlot ?? b.preferredSlot;
  const cutoff = getConfig().booking.cancelCutoffHours * 3600_000;
  return now().getTime() < slotStart(date, slot, slots).getTime() - cutoff;
}

function toDto(r: Row, viewer: Viewer, slots: SlotSetting[]): BookingDto {
  const b = r.b;
  return {
    id: b.id,
    ref: bookingRef(b.id),
    userId: b.userId,
    userName: r.ownerName,
    userMobile: r.ownerMobile,
    serviceId: b.serviceId,
    serviceName: b.serviceName,
    vehicleType: b.vehicleType,
    price: b.price,
    vehicleId: b.vehicleId,
    registrationNumber: formatRegistration(b.registrationNumber),
    vehicleMake: b.vehicleMake,
    vehicleModel: b.vehicleModel,
    vehicleColor: b.vehicleColor,
    addressLine: b.addressLine,
    societyOrBuilding: b.societyOrBuilding,
    flatOrHouseNo: b.flatOrHouseNo,
    area: b.area,
    city: b.city,
    pincode: b.pincode,
    parkingNotes: b.parkingNotes,
    preferredDate: b.preferredDate,
    preferredSlot: b.preferredSlot,
    status: b.status,
    assignedWasherId: viewer === 'ADMIN' ? b.assignedWasherId : null,
    assignedWasherName: r.washerName
      ? viewer === 'ADMIN'
        ? r.washerName
        : r.washerName.trim().split(/\s+/)[0]
      : null,
    scheduledDate: b.scheduledDate,
    scheduledSlot: b.scheduledSlot,
    date: b.scheduledDate ?? b.preferredDate,
    slot: b.scheduledSlot ?? b.preferredSlot,
    completedAt: b.completedAt ? b.completedAt.toISOString() : null,
    notDoneReason: b.notDoneReason,
    cancelReason: b.cancelReason,
    customerNotes: b.customerNotes,
    adminNotes: viewer === 'ADMIN' ? b.adminNotes : null,
    paymentStatus: b.paymentStatus,
    paidAmount: Number(r.paid) || 0,
    canCancel: viewer === 'USER' && canCustomerCancel(b, slots),
    createdAt: b.createdAt.toISOString(),
  };
}

async function eventsFor(db: DbOrTx, ids: number[]): Promise<Map<number, BookingEventDto[]>> {
  const out = new Map<number, BookingEventDto[]>();
  if (!ids.length) return out;
  const rows = await db
    .select({ e: bookingEvents, actorName: users.name })
    .from(bookingEvents)
    .leftJoin(users, eq(users.id, bookingEvents.actorUserId))
    .where(inArray(bookingEvents.bookingId, ids))
    .orderBy(asc(bookingEvents.createdAt), asc(bookingEvents.id));
  for (const r of rows) {
    const list = out.get(r.e.bookingId) ?? [];
    list.push({
      fromStatus: r.e.fromStatus,
      toStatus: r.e.toStatus,
      actorName: r.actorName,
      note: r.e.note,
      createdAt: r.e.createdAt.toISOString(),
    });
    out.set(r.e.bookingId, list);
  }
  return out;
}

async function findBookings(
  db: DbOrTx,
  where: SQL | undefined,
  viewer: Viewer,
  opts: { withEvents?: boolean } = {},
): Promise<BookingDto[]> {
  const { slots } = await rules();
  const rows = await baseQuery(db).where(where).orderBy(desc(effectiveDate), desc(bookings.id));
  const list = rows.map((r) => toDto(r, viewer, slots));
  if (opts.withEvents) {
    const events = await eventsFor(
      db,
      list.map((b) => b.id),
    );
    for (const b of list) b.events = events.get(b.id) ?? [];
  }
  return list;
}

async function getBookingDto(db: DbOrTx, id: number, viewer: Viewer): Promise<BookingDto> {
  const [b] = await findBookings(db, eq(bookings.id, id), viewer, { withEvents: true });
  if (!b) throw notFound('Booking');
  return b;
}

// ------------------------------------------------------------- emails

async function email(
  kind: 'RECEIVED' | 'CONFIRMED' | 'CANCELLED' | 'COMPLETED',
  id: number,
  extra: { cancelledBy?: 'customer' | 'admin'; reason?: string | null } = {},
) {
  const db = getDb();
  const [row] = await baseQuery(db).where(eq(bookings.id, id));
  if (!row) return;
  const { slots } = await rules();
  const b = toDto(row, 'USER', slots);
  const data = {
    ref: b.ref,
    customerName: row.ownerName.trim().split(/\s+/)[0],
    serviceName: b.serviceName,
    registrationNumber: b.registrationNumber,
    when: whenText(b.date, b.slot, slots),
    address: [b.flatOrHouseNo, b.societyOrBuilding, b.area].filter(Boolean).join(', '),
    price: b.price,
    washerFirstName: b.assignedWasherName,
    completedAt: b.completedAt
      ? new Intl.DateTimeFormat('en-IN', {
          timeZone: getConfig().timezone,
          hour: 'numeric',
          minute: '2-digit',
          day: 'numeric',
          month: 'short',
        }).format(new Date(b.completedAt))
      : null,
    ...extra,
  };
  await sendBookingEmail(row.ownerEmail, kind, data, '/app/history?type=one_time');
  if (kind === 'RECEIVED') {
    await sendBookingEmail(
      getConfig().booking.adminNotifyEmail,
      'ADMIN_NEW',
      data,
      '/admin/bookings',
    );
  }
}

// ------------------------------------------------------------- customer

/** Date range, slots and full slots for the booking form. */
export async function bookingOptions(userId: number): Promise<BookingOptions> {
  const db = getDb();
  const cfg = getConfig().booking;
  const r = await rules();
  const t = today();
  const minDate = r.allowSameDay ? t : addDays(t, 1);
  const maxDate = addDays(t, cfg.maxDaysAhead);
  const [[open], full] = await Promise.all([
    db
      .select({ n: count() })
      .from(bookings)
      .where(and(eq(bookings.userId, userId), inArray(bookings.status, OPEN_BOOKING_STATUSES))),
    fullSlots(db, minDate, maxDate),
  ]);
  return {
    today: t,
    minDate,
    maxDate,
    slots: r.slots.filter((s) => s.enabled),
    full,
    openCount: open.n,
    maxOpen: cfg.maxOpenPerUser,
    cancelCutoffHours: cfg.cancelCutoffHours,
  };
}

/** Slots at capacity (ONE_TIME_SLOT_CAPACITY; 0 = no limit) between two dates. */
async function fullSlots(db: DbOrTx, from: string, to: string) {
  const capacity = getConfig().booking.slotCapacity;
  if (!capacity) return [];
  const rows = await db
    .select({ date: effectiveDate, slot: effectiveSlot, n: count() })
    .from(bookings)
    .where(
      and(
        inArray(bookings.status, ['REQUESTED', 'CONFIRMED']),
        sql`${effectiveDate} between ${from} and ${to}`,
      ),
    )
    .groupBy(effectiveDate, effectiveSlot);
  return rows
    .filter((r) => r.n >= capacity)
    .map((r) => ({ date: String(r.date).slice(0, 10), slot: r.slot }));
}

const ruleError = (code: string, message: string, field?: string) =>
  new AppError(422, code, message, field ? { fieldErrors: { [field]: [message] } } : undefined);

export async function createBooking(
  userId: number,
  input: z.output<typeof bookingCreateSchema>,
): Promise<BookingDto> {
  const db = getDb();
  const cfg = getConfig().booking;
  const r = await rules();
  const t = today();

  const service = await getService(db, input.serviceId);
  if (!service.isActive) throw notFound('Service');

  // When: within the window, an enabled slot that hasn't started, with room left.
  const minDate = r.allowSameDay ? t : addDays(t, 1);
  const maxDate = addDays(t, cfg.maxDaysAhead);
  if (input.preferredDate < minDate || input.preferredDate > maxDate) {
    throw ruleError(
      'DATE_OUT_OF_RANGE',
      r.allowSameDay
        ? `Pick a date from today up to ${cfg.maxDaysAhead} days ahead`
        : `Pick a date from tomorrow up to ${cfg.maxDaysAhead} days ahead`,
      'preferredDate',
    );
  }
  const slot = r.slots.find((s) => s.key === input.preferredSlot);
  if (!slot?.enabled)
    throw ruleError('SLOT_UNAVAILABLE', 'That slot isn’t available', 'preferredSlot');
  if (slotStart(input.preferredDate, slot.key, r.slots) <= now()) {
    throw ruleError('SLOT_STARTED', 'That slot has already started', 'preferredSlot');
  }

  const id = await db.transaction(async (tx) => {
    // One booking at a time per customer, so the open-bookings limit holds.
    await tx.select({ id: users.id }).from(users).where(eq(users.id, userId)).for('update');
    const [open] = await tx
      .select({ n: count() })
      .from(bookings)
      .where(and(eq(bookings.userId, userId), inArray(bookings.status, OPEN_BOOKING_STATUSES)));
    if (open.n >= cfg.maxOpenPerUser) {
      throw ruleError(
        'TOO_MANY_OPEN_BOOKINGS',
        `You already have ${open.n} open bookings. Wait for one to finish or cancel one first.`,
      );
    }
    if (
      (await fullSlots(tx, input.preferredDate, input.preferredDate)).some(
        (f) => f.slot === input.preferredSlot,
      )
    ) {
      throw ruleError('SLOT_FULL', 'That slot is full. Pick another time.', 'preferredSlot');
    }

    // The vehicle: a saved one, or details typed for this booking only.
    let vehicle: {
      vehicleId: number | null;
      vehicleType: (typeof service.appliesTo)[number];
      registrationNumber: string;
      vehicleMake: string | null;
      vehicleModel: string | null;
      vehicleColor: string;
      parkingNotes: string | null;
    };
    if (input.vehicleId) {
      const [v] = await tx.select().from(vehicles).where(eq(vehicles.id, input.vehicleId));
      if (!v || v.userId !== userId || !v.isActive) throw notFound('Vehicle');
      vehicle = {
        vehicleId: v.id,
        vehicleType: vehicleTypeOf(v.category, v.carType),
        registrationNumber: v.registrationNumber,
        vehicleMake: v.make,
        vehicleModel: v.model,
        vehicleColor: v.color,
        parkingNotes: input.parkingNotes ?? v.parkingNotes,
      };
    } else {
      const reg = input.registrationNumber!;
      vehicle = {
        vehicleId: null,
        vehicleType: vehicleTypeOf(input.category!, input.carType),
        registrationNumber: reg,
        vehicleMake: input.vehicleMake,
        vehicleModel: input.vehicleModel,
        vehicleColor: input.vehicleColor!,
        parkingNotes: input.parkingNotes,
      };
    }
    if (!service.appliesTo.includes(vehicle.vehicleType)) {
      throw badRequest(
        `${service.name} isn’t available for ${LABELS.vehicleType[vehicle.vehicleType].toLowerCase()}s`,
        undefined,
        'VEHICLE_TYPE_NOT_ALLOWED',
      );
    }
    const price = service.prices.find((p) => p.vehicleType === vehicle.vehicleType);
    if (!price) throw badRequest('No price is set for this vehicle type');

    if (!input.vehicleId && input.saveVehicle) {
      const [existing] = await tx
        .select()
        .from(vehicles)
        .where(eq(vehicles.registrationNumber, vehicle.registrationNumber));
      if (existing && existing.userId === userId) {
        vehicle.vehicleId = existing.id;
      } else {
        vehicle.vehicleId = await insertVehicle(tx, userId, {
          category: input.category!,
          carType: input.carType,
          registrationNumber: vehicle.registrationNumber,
          make: vehicle.vehicleMake!,
          model: vehicle.vehicleModel!,
          color: vehicle.vehicleColor,
          parkingNotes: vehicle.parkingNotes,
        });
      }
    }

    const [row] = await tx
      .insert(bookings)
      .values({
        userId,
        serviceId: service.id,
        serviceName: service.name,
        price: price.price,
        ...vehicle,
        addressLine: input.addressLine,
        societyOrBuilding: input.societyOrBuilding,
        flatOrHouseNo: input.flatOrHouseNo,
        area: input.area,
        city: input.city,
        pincode: input.pincode,
        preferredDate: input.preferredDate,
        preferredSlot: input.preferredSlot,
        customerNotes: input.customerNotes,
        status: 'REQUESTED',
      })
      .$returningId();
    await tx.insert(bookingEvents).values({
      bookingId: row.id,
      fromStatus: null,
      toStatus: 'REQUESTED',
      actorUserId: userId,
      createdAt: now(),
    });
    return row.id;
  });
  await email('RECEIVED', id);
  return getBookingDto(db, id, 'USER');
}

export async function listMyBookings(
  userId: number,
  q: z.output<typeof bookingListQuery>,
): Promise<BookingDto[]> {
  return findBookings(
    getDb(),
    and(
      eq(bookings.userId, userId),
      q.status ? eq(bookings.status, q.status) : undefined,
      q.from ? sql`${effectiveDate} >= ${q.from}` : undefined,
      q.to ? sql`${effectiveDate} <= ${q.to}` : undefined,
      q.reg ? eq(bookings.registrationNumber, normaliseRegistration(q.reg)) : undefined,
    ),
    'USER',
    { withEvents: true },
  );
}

export async function getMyBooking(userId: number, id: number): Promise<BookingDto> {
  const b = await getBookingDto(getDb(), id, 'USER');
  if (b.userId !== userId) throw notFound('Booking');
  return b;
}

// ------------------------------------------------------------ transitions

async function lockBooking(tx: DbOrTx, id: number) {
  const [b] = await tx.select().from(bookings).where(eq(bookings.id, id)).for('update');
  if (!b) throw notFound('Booking');
  return b;
}

async function move(
  tx: DbOrTx,
  b: typeof bookings.$inferSelect,
  to: BookingStatus,
  actorId: number,
  note: string | null,
  patch: Partial<typeof bookings.$inferInsert> = {},
) {
  await tx
    .update(bookings)
    .set({ ...patch, status: to })
    .where(eq(bookings.id, b.id));
  await tx.insert(bookingEvents).values({
    bookingId: b.id,
    fromStatus: b.status,
    toStatus: to,
    actorUserId: actorId,
    note,
    createdAt: now(),
  });
}

const wrongState = (b: { status: BookingStatus }, action: string) =>
  conflict(
    `This booking is ${LABELS.bookingStatus[b.status].toLowerCase()} and can’t be ${action}`,
    'INVALID_STATUS',
  );

export async function cancelMyBooking(userId: number, id: number): Promise<BookingDto> {
  const db = getDb();
  const { slots } = await rules();
  await db.transaction(async (tx) => {
    const b = await lockBooking(tx, id);
    if (b.userId !== userId) throw notFound('Booking');
    if (b.status !== 'REQUESTED' && b.status !== 'CONFIRMED') throw wrongState(b, 'cancelled');
    if (!canCustomerCancel(b, slots)) {
      throw ruleError(
        'CANCEL_TOO_LATE',
        `Bookings can be cancelled up to ${getConfig().booking.cancelCutoffHours} hours before the slot. Contact us on WhatsApp to change it.`,
      );
    }
    await move(tx, b, 'CANCELLED', userId, 'Cancelled by customer');
  });
  await email('CANCELLED', id, { cancelledBy: 'customer' });
  return getBookingDto(db, id, 'USER');
}

async function assertWasher(tx: DbOrTx, washerId: number) {
  const [w] = await tx.select().from(users).where(eq(users.id, washerId));
  if (!w || w.role !== 'WASHER' || !w.isActive) throw badRequest('Choose an active washer');
}

function assertSchedule(date: string, slot: BookingSlot, slots: SlotSetting[]) {
  if (date < today()) throw badRequest('That date has passed', undefined, 'DATE_IN_PAST');
  if (!slots.some((s) => s.key === slot)) throw badRequest('Unknown slot');
}

export async function confirmBooking(
  actorId: number,
  id: number,
  input: z.output<typeof bookingConfirmSchema>,
): Promise<BookingDto> {
  const db = getDb();
  const { slots } = await rules();
  assertSchedule(input.date, input.slot, slots);
  await db.transaction(async (tx) => {
    const b = await lockBooking(tx, id);
    if (b.status !== 'REQUESTED') throw wrongState(b, 'confirmed');
    await assertWasher(tx, input.washerId);
    await move(tx, b, 'CONFIRMED', actorId, whenText(input.date, input.slot, slots), {
      assignedWasherId: input.washerId,
      scheduledDate: input.date,
      scheduledSlot: input.slot,
      ...(input.adminNotes !== null ? { adminNotes: input.adminNotes } : {}),
    });
  });
  await email('CONFIRMED', id);
  return getBookingDto(db, id, 'ADMIN');
}

/** New date/slot (and washer); also how a NOT_DONE booking is rebooked. */
export async function rescheduleBooking(
  actorId: number,
  id: number,
  input: z.output<typeof bookingRescheduleSchema>,
): Promise<BookingDto> {
  const db = getDb();
  const { slots } = await rules();
  assertSchedule(input.date, input.slot, slots);
  await db.transaction(async (tx) => {
    const b = await lockBooking(tx, id);
    if (b.status !== 'CONFIRMED' && b.status !== 'NOT_DONE') throw wrongState(b, 'rescheduled');
    const washerId = input.washerId ?? b.assignedWasherId;
    if (!washerId) throw badRequest('Choose a washer');
    await assertWasher(tx, washerId);
    await move(
      tx,
      b,
      'CONFIRMED',
      actorId,
      `Rescheduled to ${whenText(input.date, input.slot, slots)}`,
      {
        assignedWasherId: washerId,
        scheduledDate: input.date,
        scheduledSlot: input.slot,
        notDoneReason: null,
        ...(input.adminNotes !== null ? { adminNotes: input.adminNotes } : {}),
      },
    );
  });
  await email('CONFIRMED', id);
  return getBookingDto(db, id, 'ADMIN');
}

export async function adminCancelBooking(
  actorId: number,
  id: number,
  reason: string,
): Promise<BookingDto> {
  const db = getDb();
  await db.transaction(async (tx) => {
    const b = await lockBooking(tx, id);
    if (!(OPEN_BOOKING_STATUSES as readonly string[]).includes(b.status)) {
      throw wrongState(b, 'cancelled');
    }
    await move(tx, b, 'CANCELLED', actorId, reason, { cancelReason: reason });
  });
  await email('CANCELLED', id, { cancelledBy: 'admin', reason });
  return getBookingDto(db, id, 'ADMIN');
}

async function washerMove(
  washerId: number,
  id: number,
  to: 'COMPLETED' | 'NOT_DONE',
  reason: string | null,
) {
  const db = getDb();
  await db.transaction(async (tx) => {
    const b = await lockBooking(tx, id);
    if (b.assignedWasherId !== washerId) throw forbidden('This booking is not assigned to you');
    if (b.status !== 'CONFIRMED') throw wrongState(b, 'updated');
    if (!b.scheduledDate || b.scheduledDate > today()) {
      throw ruleError('NOT_DUE_YET', 'This wash is scheduled for a later day');
    }
    await move(
      tx,
      b,
      to,
      washerId,
      reason,
      to === 'COMPLETED' ? { completedAt: now() } : { notDoneReason: reason },
    );
  });
  if (to === 'COMPLETED') await email('COMPLETED', id);
  return getBookingDto(db, id, 'USER');
}

/** Done, with the server's time. */
export const washerCompleteBooking = (washerId: number, id: number) =>
  washerMove(washerId, id, 'COMPLETED', null);

export const washerNotDoneBooking = (washerId: number, id: number, reason: string) =>
  washerMove(washerId, id, 'NOT_DONE', reason);

// ------------------------------------------------------------- washer list

/** Today's one-time jobs for a washer: still to do, and done / not done today. */
export async function washerBookingsToday(washerId: number): Promise<WasherBookingItem[]> {
  const db = getDb();
  const { slots } = await rules();
  const rows = await db
    .select({ b: bookings, ownerName: users.name, duration: oneTimeServices.durationMinutes })
    .from(bookings)
    .innerJoin(users, eq(users.id, bookings.userId))
    .innerJoin(oneTimeServices, eq(oneTimeServices.id, bookings.serviceId))
    .where(
      and(
        eq(bookings.assignedWasherId, washerId),
        eq(bookings.scheduledDate, today()),
        inArray(bookings.status, ['CONFIRMED', 'COMPLETED', 'NOT_DONE']),
      ),
    );
  const order = slots.map((s) => s.key);
  return rows
    .sort((a, b) => order.indexOf(a.b.scheduledSlot!) - order.indexOf(b.b.scheduledSlot!))
    .map(({ b, ownerName, duration }) => ({
      bookingId: b.id,
      ref: bookingRef(b.id),
      serviceName: b.serviceName,
      durationMinutes: duration,
      slot: b.scheduledSlot!,
      slotLabel: slotLabel(b.scheduledSlot!, slots),
      registrationNumber: formatRegistration(b.registrationNumber),
      vehicleType: b.vehicleType,
      vehicleLabel: [b.vehicleMake, b.vehicleModel].filter(Boolean).join(' ') || 'Vehicle',
      color: b.vehicleColor,
      ownerName,
      societyOrBuilding: b.societyOrBuilding,
      flatOrHouseNo: b.flatOrHouseNo,
      area: b.area,
      parkingNotes: b.parkingNotes,
      customerNotes: b.customerNotes,
      status: b.status,
      completedAt: b.completedAt ? b.completedAt.toISOString() : null,
      notDoneReason: b.notDoneReason,
    }));
}

// ------------------------------------------------------------- admin

export async function adminListBookings(
  q: z.output<typeof adminBookingQuery>,
): Promise<Paged<BookingDto>> {
  const db = getDb();
  const term = q.search?.trim();
  const where = and(
    q.status ? eq(bookings.status, q.status) : undefined,
    q.from ? sql`${effectiveDate} >= ${q.from}` : undefined,
    q.to ? sql`${effectiveDate} <= ${q.to}` : undefined,
    q.slot ? sql`${effectiveSlot} = ${q.slot}` : undefined,
    q.area ? like(bookings.area, `%${q.area}%`) : undefined,
    q.washerId ? eq(bookings.assignedWasherId, q.washerId) : undefined,
    q.paymentStatus ? eq(bookings.paymentStatus, q.paymentStatus) : undefined,
    q.serviceId ? eq(bookings.serviceId, q.serviceId) : undefined,
    q.userId ? eq(bookings.userId, q.userId) : undefined,
    term
      ? sql`(${owner.name} like ${`%${term}%`} or ${owner.mobile} like ${`%${term}%`} or ${bookings.registrationNumber} like ${`%${normaliseRegistration(term)}%`} or ${bookings.id} = ${Number(term.replace(/\D/g, '')) || 0})`
      : undefined,
  );
  const [agg] = await db
    .select({ n: count() })
    .from(bookings)
    .innerJoin(owner, eq(owner.id, bookings.userId))
    .where(where);
  const { slots } = await rules();
  const rows = await baseQuery(db)
    .where(where)
    // Newest requests first while waiting; otherwise by wash date.
    .orderBy(desc(effectiveDate), desc(bookings.id))
    .limit(q.pageSize)
    .offset((q.page - 1) * q.pageSize);
  const items = rows.map((r) => toDto(r, 'ADMIN', slots));
  const events = await eventsFor(
    db,
    items.map((b) => b.id),
  );
  for (const b of items) b.events = events.get(b.id) ?? [];
  return { items, total: agg.n, page: q.page, pageSize: q.pageSize };
}

export async function adminGetBooking(id: number): Promise<BookingDto> {
  return getBookingDto(getDb(), id, 'ADMIN');
}

export async function bookingCounts(): Promise<{ requested: number; today: number }> {
  const db = getDb();
  const [[requested], [onToday]] = await Promise.all([
    db.select({ n: count() }).from(bookings).where(eq(bookings.status, 'REQUESTED')),
    db
      .select({ n: count() })
      .from(bookings)
      .where(
        and(
          eq(bookings.scheduledDate, today()),
          inArray(bookings.status, ['CONFIRMED', 'COMPLETED', 'NOT_DONE']),
        ),
      ),
  ]);
  return { requested: requested.n, today: onToday.n };
}

/** After a payment: PAID once payments cover the booking price. */
export async function refreshPaymentStatus(db: DbOrTx, bookingId: number) {
  const [b] = await db.select().from(bookings).where(eq(bookings.id, bookingId));
  if (!b) return;
  const [paid] = await db
    .select({ total: sql<string>`coalesce(sum(${payments.amount}), 0)` })
    .from(payments)
    .where(eq(payments.bookingId, bookingId));
  const status = Number(paid.total) >= b.price && Number(paid.total) > 0 ? 'PAID' : 'UNPAID';
  if (status !== b.paymentStatus) {
    await db.update(bookings).set({ paymentStatus: status }).where(eq(bookings.id, bookingId));
  }
}

// ---------------------------------------------------------- "My washes"

/** Monthly wash logs and one-time bookings together, newest first. */
export async function myWashes(
  userId: number,
  q: z.output<typeof myWashesQuery>,
): Promise<MyWashes> {
  const db = getDb();
  const reg = q.reg ? normaliseRegistration(q.reg) : undefined;
  const ownSubs = db
    .select({ id: subscriptions.id })
    .from(subscriptions)
    .where(eq(subscriptions.userId, userId));

  // Monthly washes are never "upcoming": a log is written when the wash happens.
  const wantMonthly = q.type !== 'one_time' && q.status !== 'upcoming';
  const wantOneTime = q.type !== 'monthly';

  const [logs, oneTime, regRows, { slots }] = await Promise.all([
    wantMonthly
      ? findLogs(
          db,
          and(
            inArray(washLogs.subscriptionId, ownSubs),
            reg ? eq(vehicles.registrationNumber, reg) : undefined,
            q.from ? gte(washLogs.serviceDate, q.from) : undefined,
            q.to ? lte(washLogs.serviceDate, q.to) : undefined,
            q.status === 'completed' ? eq(washLogs.status, 'DONE') : undefined,
            q.status === 'cancelled' ? eq(washLogs.status, 'NOT_DONE') : undefined,
          ),
        )
      : Promise.resolve([]),
    wantOneTime
      ? findBookings(
          db,
          and(
            eq(bookings.userId, userId),
            reg ? eq(bookings.registrationNumber, reg) : undefined,
            q.from ? sql`${effectiveDate} >= ${q.from}` : undefined,
            q.to ? sql`${effectiveDate} <= ${q.to}` : undefined,
            q.status === 'upcoming'
              ? inArray(bookings.status, ['REQUESTED', 'CONFIRMED'])
              : q.status === 'completed'
                ? eq(bookings.status, 'COMPLETED')
                : q.status === 'cancelled'
                  ? inArray(bookings.status, ['CANCELLED', 'NOT_DONE'])
                  : undefined,
          ),
          'USER',
          { withEvents: true },
        )
      : Promise.resolve([]),
    Promise.all([
      db
        .selectDistinct({ reg: vehicles.registrationNumber })
        .from(subscriptions)
        .innerJoin(vehicles, eq(vehicles.id, subscriptions.vehicleId))
        .where(eq(subscriptions.userId, userId)),
      db
        .selectDistinct({ reg: bookings.registrationNumber })
        .from(bookings)
        .where(eq(bookings.userId, userId)),
    ]),
    rules(),
  ]);

  const items: MyWashItem[] = [
    ...logs.map((log): MyWashItem => ({
      kind: 'MONTHLY',
      date: log.serviceDate,
      registrationNumber: log.registrationNumber,
      log,
    })),
    ...oneTime.map((booking): MyWashItem => ({
      kind: 'ONE_TIME',
      date: booking.date,
      registrationNumber: booking.registrationNumber,
      booking,
    })),
  ];
  const stamp = (i: MyWashItem) => (i.kind === 'MONTHLY' ? i.log.performedAt : i.booking.createdAt);
  items.sort((a, b) => b.date.localeCompare(a.date) || stamp(b).localeCompare(stamp(a)));

  const registrations = [
    ...new Set([...regRows[0], ...regRows[1]].map((r) => formatRegistration(r.reg))),
  ].sort();
  const start = (q.page - 1) * q.pageSize;
  return {
    items: items.slice(start, start + q.pageSize),
    total: items.length,
    page: q.page,
    pageSize: q.pageSize,
    registrations,
    slots,
  };
}
