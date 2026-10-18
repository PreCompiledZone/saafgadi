import { sql } from 'drizzle-orm';
import {
  type AnyMySqlColumn,
  bigint,
  boolean,
  date,
  datetime,
  decimal,
  index,
  int,
  json,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  tinyint,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/mysql-core';
import {
  AUDIT_ACTIONS,
  BOOKING_PAYMENT_STATUSES,
  BOOKING_SLOTS,
  BOOKING_STATUSES,
  CAR_TYPES,
  ENQUIRY_STATUSES,
  ENQUIRY_TYPES,
  NOT_DONE_REASONS,
  OTP_CHANNELS,
  OTP_PURPOSES,
  PAYMENT_MODES,
  ROLES,
  SUBSCRIPTION_STATUSES,
  VEHICLE_CATEGORIES,
  VEHICLE_TYPES,
  WASH_STATUSES,
} from '../../shared/enums';

// Every table: BIGINT id, created_at, updated_at (UTC). DATE columns are
// business dates in APP_TIMEZONE, read and written as 'YYYY-MM-DD' strings.
const id = () => bigint('id', { mode: 'number', unsigned: true }).autoincrement().primaryKey();
const ref = (name: string) => bigint(name, { mode: 'number', unsigned: true });
const timestamps = {
  createdAt: timestamp('created_at', { mode: 'date' })
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  updatedAt: timestamp('updated_at', { mode: 'date' })
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`)
    .onUpdateNow(),
};
const businessDate = (name: string) => date(name, { mode: 'string' });

export const users = mysqlTable(
  'users',
  {
    id: id(),
    name: varchar('name', { length: 120 }).notNull(),
    mobile: varchar('mobile', { length: 10 }).notNull(),
    email: varchar('email', { length: 190 }),
    /** Set once the customer enters a code sent to `email`; cleared when the email changes. */
    emailVerifiedAt: datetime('email_verified_at', { mode: 'date' }),
    passwordHash: varchar('password_hash', { length: 100 }).notNull(),
    role: mysqlEnum('role', ROLES).notNull().default('USER'),
    isActive: boolean('is_active').notNull().default(true),
    addressLine: varchar('address_line', { length: 255 }),
    /** Onboarded society; null while the customer's typed society isn't onboarded. */
    societyId: ref('society_id').references((): AnyMySqlColumn => societies.id),
    /** Society name as shown (synced from the society when linked). */
    societyOrBuilding: varchar('society_or_building', { length: 160 }),
    flatOrHouseNo: varchar('flat_or_house_no', { length: 60 }),
    area: varchar('area', { length: 120 }),
    city: varchar('city', { length: 80 }),
    pincode: varchar('pincode', { length: 6 }),
    lastLoginAt: datetime('last_login_at', { mode: 'date' }),
    /** Customers added by an admin don't have to verify an email. */
    createdByAdmin: boolean('created_by_admin').notNull().default(false),
    /** Bumped on password reset; sessions signed with an older version stop working. */
    tokenVersion: int('token_version').notNull().default(0),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('users_mobile_uq').on(t.mobile),
    uniqueIndex('users_email_uq').on(t.email),
    index('users_role_idx').on(t.role),
    index('users_society_idx').on(t.societyId),
  ],
);

/** Societies onboarded by an admin; each can have a default washer. */
export const societies = mysqlTable(
  'societies',
  {
    id: id(),
    name: varchar('name', { length: 160 }).notNull(),
    area: varchar('area', { length: 120 }).notNull(),
    city: varchar('city', { length: 80 }).notNull(),
    pincode: varchar('pincode', { length: 6 }).notNull(),
    addressLine: varchar('address_line', { length: 255 }),
    notes: text('notes'),
    defaultWasherId: ref('default_washer_id').references((): AnyMySqlColumn => users.id),
    isActive: boolean('is_active').notNull().default(true),
    ...timestamps,
  },
  (t) => [uniqueIndex('societies_name_area_uq').on(t.name, t.area)],
);

export const vehicles = mysqlTable(
  'vehicles',
  {
    id: id(),
    userId: ref('user_id')
      .notNull()
      .references(() => users.id),
    category: mysqlEnum('category', VEHICLE_CATEGORIES).notNull(),
    carType: mysqlEnum('car_type', CAR_TYPES),
    registrationNumber: varchar('registration_number', { length: 12 }).notNull(),
    make: varchar('make', { length: 60 }).notNull(),
    model: varchar('model', { length: 60 }).notNull(),
    color: varchar('color', { length: 40 }).notNull(),
    parkingNotes: varchar('parking_notes', { length: 255 }),
    isActive: boolean('is_active').notNull().default(true),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('vehicles_reg_uq').on(t.registrationNumber),
    index('vehicles_user_idx').on(t.userId),
  ],
);

export const plans = mysqlTable('plans', {
  id: id(),
  name: varchar('name', { length: 80 }).notNull(),
  vehicleCategory: mysqlEnum('vehicle_category', VEHICLE_CATEGORIES).notNull(),
  description: text('description'),
  isActive: boolean('is_active').notNull().default(true),
  sortOrder: int('sort_order').notNull().default(0),
  ...timestamps,
});

export const planPrices = mysqlTable(
  'plan_prices',
  {
    id: id(),
    planId: ref('plan_id')
      .notNull()
      .references(() => plans.id),
    vehicleType: mysqlEnum('vehicle_type', VEHICLE_TYPES).notNull(),
    monthlyPrice: decimal('monthly_price', { precision: 10, scale: 2 }).notNull(),
    isActive: boolean('is_active').notNull().default(true),
    ...timestamps,
  },
  (t) => [uniqueIndex('plan_prices_plan_type_uq').on(t.planId, t.vehicleType)],
);

export const planActivities = mysqlTable(
  'plan_activities',
  {
    id: id(),
    planId: ref('plan_id')
      .notNull()
      .references(() => plans.id),
    name: varchar('name', { length: 120 }).notNull(),
    description: varchar('description', { length: 500 }),
    quotaPerMonth: int('quota_per_month').notNull(),
    minGapDays: int('min_gap_days').notNull().default(1),
    sortOrder: int('sort_order').notNull().default(0),
    isActive: boolean('is_active').notNull().default(true),
    ...timestamps,
  },
  (t) => [index('plan_activities_plan_idx').on(t.planId)],
);

export const subscriptions = mysqlTable(
  'subscriptions',
  {
    id: id(),
    userId: ref('user_id')
      .notNull()
      .references(() => users.id),
    vehicleId: ref('vehicle_id')
      .notNull()
      .references(() => vehicles.id),
    planId: ref('plan_id')
      .notNull()
      .references(() => plans.id),
    vehicleType: mysqlEnum('vehicle_type', VEHICLE_TYPES).notNull(),
    monthlyPrice: decimal('monthly_price', { precision: 10, scale: 2 }).notNull(),
    months: int('months').notNull(),
    totalAmount: decimal('total_amount', { precision: 10, scale: 2 }).notNull(),
    startDate: businessDate('start_date').notNull(),
    endDate: businessDate('end_date').notNull(),
    status: mysqlEnum('status', SUBSCRIPTION_STATUSES).notNull().default('PENDING'),
    assignedWasherId: ref('assigned_washer_id').references(() => users.id),
    activatedBy: ref('activated_by').references(() => users.id),
    activatedAt: datetime('activated_at', { mode: 'date' }),
    notes: text('notes'),
    ...timestamps,
  },
  (t) => [
    index('subscriptions_vehicle_idx').on(t.vehicleId, t.status),
    index('subscriptions_user_idx').on(t.userId),
    index('subscriptions_washer_idx').on(t.assignedWasherId, t.status),
    index('subscriptions_end_idx').on(t.status, t.endDate),
  ],
);

export const payments = mysqlTable(
  'payments',
  {
    id: id(),
    subscriptionId: ref('subscription_id').references(() => subscriptions.id),
    userId: ref('user_id')
      .notNull()
      .references(() => users.id),
    amount: decimal('amount', { precision: 10, scale: 2 }).notNull(),
    mode: mysqlEnum('mode', PAYMENT_MODES).notNull(),
    reference: varchar('reference', { length: 120 }),
    /** Either a subscription or a one-time booking (or neither: an advance). */
    bookingId: ref('booking_id').references((): AnyMySqlColumn => bookings.id),
    paidOn: businessDate('paid_on').notNull(),
    recordedBy: ref('recorded_by')
      .notNull()
      .references(() => users.id),
    notes: text('notes'),
    ...timestamps,
  },
  (t) => [
    index('payments_paid_on_idx').on(t.paidOn),
    index('payments_user_idx').on(t.userId),
    index('payments_subscription_idx').on(t.subscriptionId),
    index('payments_booking_idx').on(t.bookingId),
  ],
);

export const washLogs = mysqlTable(
  'wash_logs',
  {
    id: id(),
    subscriptionId: ref('subscription_id')
      .notNull()
      .references(() => subscriptions.id),
    vehicleId: ref('vehicle_id')
      .notNull()
      .references(() => vehicles.id),
    planActivityId: ref('plan_activity_id')
      .notNull()
      .references(() => planActivities.id),
    washerId: ref('washer_id')
      .notNull()
      .references(() => users.id),
    serviceDate: businessDate('service_date').notNull(),
    performedAt: datetime('performed_at', { mode: 'date' }).notNull(),
    status: mysqlEnum('status', WASH_STATUSES).notNull(),
    reason: mysqlEnum('reason', NOT_DONE_REASONS),
    notes: varchar('notes', { length: 500 }),
    /** Logged while the activity was pending (not due) — shown as "catch-up". */
    isCatchUp: boolean('is_catch_up').notNull().default(false),
    editedBy: ref('edited_by').references(() => users.id),
    editedAt: datetime('edited_at', { mode: 'date' }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('wash_logs_sub_activity_date_uq').on(
      t.subscriptionId,
      t.planActivityId,
      t.serviceDate,
    ),
    index('wash_logs_date_idx').on(t.serviceDate),
    index('wash_logs_washer_date_idx').on(t.washerId, t.serviceDate),
    index('wash_logs_vehicle_date_idx').on(t.vehicleId, t.serviceDate),
  ],
);

/** One-time wash services, a separate product from monthly plans. */
export const oneTimeServices = mysqlTable('one_time_services', {
  id: id(),
  name: varchar('name', { length: 120 }).notNull(),
  description: varchar('description', { length: 500 }),
  /** string[] shown as a checklist. */
  includes: json('includes').$type<string[]>().notNull(),
  /** VehicleType[] it can be booked for. */
  appliesTo: json('applies_to').$type<(typeof VEHICLE_TYPES)[number][]>().notNull(),
  durationMinutes: int('duration_minutes').notNull(),
  isActive: boolean('is_active').notNull().default(false),
  sortOrder: int('sort_order').notNull().default(0),
  ...timestamps,
});

export const oneTimeServicePrices = mysqlTable(
  'one_time_service_prices',
  {
    id: id(),
    serviceId: ref('service_id')
      .notNull()
      .references(() => oneTimeServices.id),
    vehicleType: mysqlEnum('vehicle_type', VEHICLE_TYPES).notNull(),
    /** Whole rupees. */
    price: int('price').notNull(),
    ...timestamps,
  },
  (t) => [uniqueIndex('one_time_service_prices_uq').on(t.serviceId, t.vehicleType)],
);

/** A one-time wash. Service, price, vehicle and address are snapshots taken at booking time. */
export const bookings = mysqlTable(
  'bookings',
  {
    id: id(),
    userId: ref('user_id')
      .notNull()
      .references(() => users.id),
    serviceId: ref('service_id')
      .notNull()
      .references(() => oneTimeServices.id),
    serviceName: varchar('service_name', { length: 120 }).notNull(),
    vehicleType: mysqlEnum('vehicle_type', VEHICLE_TYPES).notNull(),
    price: int('price').notNull(),
    /** Set only when the customer picked (or saved) a vehicle on their account. */
    vehicleId: ref('vehicle_id').references(() => vehicles.id),
    registrationNumber: varchar('registration_number', { length: 12 }).notNull(),
    vehicleMake: varchar('vehicle_make', { length: 60 }),
    vehicleModel: varchar('vehicle_model', { length: 60 }),
    vehicleColor: varchar('vehicle_color', { length: 40 }).notNull(),
    addressLine: varchar('address_line', { length: 255 }),
    societyOrBuilding: varchar('society_or_building', { length: 160 }).notNull(),
    flatOrHouseNo: varchar('flat_or_house_no', { length: 60 }).notNull(),
    area: varchar('area', { length: 120 }).notNull(),
    city: varchar('city', { length: 80 }).notNull(),
    pincode: varchar('pincode', { length: 6 }).notNull(),
    parkingNotes: varchar('parking_notes', { length: 255 }),
    preferredDate: businessDate('preferred_date').notNull(),
    preferredSlot: mysqlEnum('preferred_slot', BOOKING_SLOTS).notNull(),
    status: mysqlEnum('status', BOOKING_STATUSES).notNull().default('REQUESTED'),
    assignedWasherId: ref('assigned_washer_id').references(() => users.id),
    scheduledDate: businessDate('scheduled_date'),
    scheduledSlot: mysqlEnum('scheduled_slot', BOOKING_SLOTS),
    completedAt: datetime('completed_at', { mode: 'date' }),
    notDoneReason: varchar('not_done_reason', { length: 255 }),
    cancelReason: varchar('cancel_reason', { length: 255 }),
    customerNotes: varchar('customer_notes', { length: 500 }),
    adminNotes: text('admin_notes'),
    paymentStatus: mysqlEnum('payment_status', BOOKING_PAYMENT_STATUSES)
      .notNull()
      .default('UNPAID'),
    ...timestamps,
  },
  (t) => [
    index('bookings_user_idx').on(t.userId, t.status),
    index('bookings_status_idx').on(t.status, t.preferredDate),
    index('bookings_washer_date_idx').on(t.assignedWasherId, t.scheduledDate),
    index('bookings_scheduled_idx').on(t.scheduledDate, t.scheduledSlot),
  ],
);

/** Status history of a booking, for the customer's timeline and the admin's audit. */
export const bookingEvents = mysqlTable(
  'booking_events',
  {
    id: id(),
    bookingId: ref('booking_id')
      .notNull()
      .references(() => bookings.id),
    fromStatus: mysqlEnum('from_status', BOOKING_STATUSES),
    toStatus: mysqlEnum('to_status', BOOKING_STATUSES).notNull(),
    actorUserId: ref('actor_user_id').references(() => users.id),
    note: varchar('note', { length: 500 }),
    /** App clock, so tests can control it. */
    createdAt: datetime('created_at', { mode: 'date' }).notNull(),
  },
  (t) => [index('booking_events_booking_idx').on(t.bookingId)],
);

export const enquiries = mysqlTable(
  'enquiries',
  {
    id: id(),
    userId: ref('user_id').references(() => users.id),
    vehicleId: ref('vehicle_id').references(() => vehicles.id),
    planId: ref('plan_id').references(() => plans.id),
    type: mysqlEnum('type', ENQUIRY_TYPES).notNull(),
    message: text('message'),
    status: mysqlEnum('status', ENQUIRY_STATUSES).notNull().default('OPEN'),
    adminNotes: text('admin_notes'),
    handledBy: ref('handled_by').references(() => users.id),
    ...timestamps,
  },
  (t) => [index('enquiries_status_idx').on(t.status), index('enquiries_user_idx').on(t.userId)],
);

/**
 * One-time codes. Only an HMAC of the code is stored. Rows are written with
 * the app clock (not CURRENT_TIMESTAMP) so expiry and rate limits are testable.
 */
export const otpCodes = mysqlTable(
  'otp_codes',
  {
    id: id(),
    channel: mysqlEnum('channel', OTP_CHANNELS).notNull(),
    /** Email, lower-case and trimmed. user_id is null for SIGNUP (no account yet). */
    destination: varchar('destination', { length: 255 }).notNull(),
    purpose: mysqlEnum('purpose', OTP_PURPOSES).notNull(),
    userId: ref('user_id').references(() => users.id),
    codeHash: varchar('code_hash', { length: 255 }).notNull(),
    attempts: tinyint('attempts').notNull().default(0),
    expiresAt: datetime('expires_at', { mode: 'date' }).notNull(),
    consumedAt: datetime('consumed_at', { mode: 'date' }),
    requestIp: varchar('request_ip', { length: 45 }).notNull(),
    createdAt: datetime('created_at', { mode: 'date' }).notNull(),
  },
  (t) => [
    index('otp_codes_dest_idx').on(t.destination, t.purpose, t.createdAt),
    index('otp_codes_ip_idx').on(t.requestIp, t.createdAt),
  ],
);

export const settings = mysqlTable(
  'settings',
  {
    id: id(),
    key: varchar('key', { length: 64 }).notNull(),
    value: text('value').notNull(),
    ...timestamps,
  },
  (t) => [uniqueIndex('settings_key_uq').on(t.key)],
);

export const auditLog = mysqlTable(
  'audit_log',
  {
    id: id(),
    actorId: ref('actor_id').references(() => users.id),
    action: mysqlEnum('action', AUDIT_ACTIONS).notNull(),
    entity: varchar('entity', { length: 40 }).notNull(),
    entityId: ref('entity_id'),
    details: json('details'),
    ...timestamps,
  },
  (t) => [index('audit_log_entity_idx').on(t.entity, t.entityId)],
);
