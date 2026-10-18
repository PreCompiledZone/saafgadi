export const ROLES = ['ADMIN', 'WASHER', 'USER'] as const;
export type Role = (typeof ROLES)[number];

/** Where a one-time code is sent; 'SMS' can be added later. */
export const OTP_CHANNELS = ['EMAIL'] as const;
export type OtpChannel = (typeof OTP_CHANNELS)[number];

export const OTP_PURPOSES = ['SIGNUP', 'VERIFY_EMAIL', 'RESET_PASSWORD'] as const;
export type OtpPurpose = (typeof OTP_PURPOSES)[number];

export const VEHICLE_CATEGORIES = ['CAR', 'BIKE'] as const;
export type VehicleCategory = (typeof VEHICLE_CATEGORIES)[number];

export const CAR_TYPES = ['HATCHBACK', 'SEDAN', 'SUV'] as const;
export type CarType = (typeof CAR_TYPES)[number];

/** Price key: a car type, or BIKE. */
export const VEHICLE_TYPES = ['HATCHBACK', 'SEDAN', 'SUV', 'BIKE'] as const;
export type VehicleType = (typeof VEHICLE_TYPES)[number];

export const SUBSCRIPTION_STATUSES = ['PENDING', 'ACTIVE', 'CANCELLED'] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

/** Status shown to people; "expired", "expiring" and "upcoming" are computed, never stored. */
export const DISPLAY_STATUSES = [
  'NO_PLAN',
  'PENDING',
  'UPCOMING',
  'ACTIVE',
  'EXPIRING',
  'EXPIRED',
  'CANCELLED',
] as const;
export type DisplayStatus = (typeof DISPLAY_STATUSES)[number];

export const PAYMENT_MODES = ['CASH', 'UPI', 'BANK_TRANSFER', 'OTHER'] as const;
export type PaymentMode = (typeof PAYMENT_MODES)[number];

export const WASH_STATUSES = ['DONE', 'NOT_DONE'] as const;
export type WashStatus = (typeof WASH_STATUSES)[number];

export const NOT_DONE_REASONS = ['VEHICLE_NOT_AVAILABLE', 'NO_ACCESS', 'WEATHER', 'OTHER'] as const;
export type NotDoneReason = (typeof NOT_DONE_REASONS)[number];

export const ENQUIRY_TYPES = ['NEW_PLAN', 'CHANGE_PLAN', 'GENERAL'] as const;
export type EnquiryType = (typeof ENQUIRY_TYPES)[number];

export const ENQUIRY_STATUSES = ['OPEN', 'CONTACTED', 'CLOSED'] as const;
export type EnquiryStatus = (typeof ENQUIRY_STATUSES)[number];

/** One-time wash bookings. NOT_DONE can be rescheduled back to CONFIRMED. */
export const BOOKING_STATUSES = [
  'REQUESTED',
  'CONFIRMED',
  'COMPLETED',
  'CANCELLED',
  'NOT_DONE',
] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];
/** Still needs action: counts towards the per-customer limit and slot capacity. */
export const OPEN_BOOKING_STATUSES = ['REQUESTED', 'CONFIRMED', 'NOT_DONE'] as const;

/** Slot keys are fixed; labels and times come from the `booking_slots` setting. */
export const BOOKING_SLOTS = ['EARLY_MORNING', 'MORNING', 'LATE_MORNING', 'EVENING'] as const;
export type BookingSlot = (typeof BOOKING_SLOTS)[number];

export const BOOKING_PAYMENT_STATUSES = ['UNPAID', 'PAID'] as const;
export type BookingPaymentStatus = (typeof BOOKING_PAYMENT_STATUSES)[number];

export const SUBSCRIPTION_MONTH_OPTIONS = [1, 3, 6, 12] as const;

export const SETTING_KEYS = [
  'whatsapp_number',
  'call_number',
  'business_name',
  'business_address',
  'support_hours',
  'whatsapp_default_message',
  'show_washer_contact',
  'support_email',
  /** JSON: [{ key, label, start: 'HH:MM', end: 'HH:MM', enabled }] for BOOKING_SLOTS. */
  'booking_slots',
  /** 'true' / 'false': one-time washes can be booked for today. */
  'booking_allow_same_day',
] as const;
export type SettingKey = (typeof SETTING_KEYS)[number];

export const AUDIT_ACTIONS = [
  'SUBSCRIPTION_ACTIVATED',
  'SUBSCRIPTION_RENEWED',
  'SUBSCRIPTION_CANCELLED',
  'WASHER_ASSIGNED',
  'PAYMENT_RECORDED',
  'PRICE_CHANGED',
  'PLAN_UPDATED',
  'ACTIVITIES_UPDATED',
  'WASH_LOG_EDITED',
  'USER_UPDATED',
  'PASSWORD_RESET',
  'SETTINGS_UPDATED',
  'ADMIN_CREATED',
  'SOCIETY_CREATED',
  'SOCIETY_UPDATED',
  'SOCIETY_WASHER_ASSIGNED',
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export const LABELS = {
  carType: { HATCHBACK: 'Hatchback', SEDAN: 'Sedan', SUV: 'SUV' } satisfies Record<CarType, string>,
  vehicleType: {
    HATCHBACK: 'Hatchback',
    SEDAN: 'Sedan',
    SUV: 'SUV',
    BIKE: 'Bike',
  } satisfies Record<VehicleType, string>,
  category: { CAR: 'Car', BIKE: 'Bike' } satisfies Record<VehicleCategory, string>,
  paymentMode: {
    CASH: 'Cash',
    UPI: 'UPI',
    BANK_TRANSFER: 'Bank transfer',
    OTHER: 'Other',
  } satisfies Record<PaymentMode, string>,
  reason: {
    VEHICLE_NOT_AVAILABLE: 'Vehicle not available',
    NO_ACCESS: 'No access',
    WEATHER: 'Weather',
    OTHER: 'Other',
  } satisfies Record<NotDoneReason, string>,
  enquiryType: {
    NEW_PLAN: 'New plan',
    CHANGE_PLAN: 'Change plan',
    GENERAL: 'General',
  } satisfies Record<EnquiryType, string>,
  enquiryStatus: {
    OPEN: 'Open',
    CONTACTED: 'Contacted',
    CLOSED: 'Closed',
  } satisfies Record<EnquiryStatus, string>,
  displayStatus: {
    NO_PLAN: 'No plan',
    PENDING: 'Pending',
    UPCOMING: 'Upcoming',
    ACTIVE: 'Active',
    EXPIRING: 'Expiring',
    EXPIRED: 'Expired',
    CANCELLED: 'Cancelled',
  } satisfies Record<DisplayStatus, string>,
  bookingStatus: {
    REQUESTED: 'Requested',
    CONFIRMED: 'Confirmed',
    COMPLETED: 'Washed',
    CANCELLED: 'Cancelled',
    NOT_DONE: 'Not done',
  } satisfies Record<BookingStatus, string>,
  paymentStatus: { UNPAID: 'Unpaid', PAID: 'Paid' } satisfies Record<BookingPaymentStatus, string>,
  role: { ADMIN: 'Admin', WASHER: 'Washer', USER: 'Customer' } satisfies Record<Role, string>,
};

/** Price row key for a vehicle: its car type, or BIKE. */
export function vehicleTypeOf(category: VehicleCategory, carType: CarType | null): VehicleType {
  return category === 'BIKE' ? 'BIKE' : (carType ?? 'SEDAN');
}

/** `SG-S-000123`, how plan requests / subscriptions are shown to people. */
export function subscriptionRef(id: number): string {
  return `SG-S-${String(id).padStart(6, '0')}`;
}

/** `SG-B-000123`, how bookings are shown to people. */
export function bookingRef(id: number): string {
  return `SG-B-${String(id).padStart(6, '0')}`;
}

export interface SlotSetting {
  key: BookingSlot;
  label: string;
  /** 'HH:MM', 24-hour, in APP_TIMEZONE. */
  start: string;
  end: string;
  enabled: boolean;
}

export const DEFAULT_BOOKING_SLOTS: SlotSetting[] = [
  { key: 'EARLY_MORNING', label: 'Early morning', start: '06:00', end: '08:00', enabled: true },
  { key: 'MORNING', label: 'Morning', start: '08:00', end: '10:00', enabled: true },
  { key: 'LATE_MORNING', label: 'Late morning', start: '10:00', end: '12:00', enabled: true },
  { key: 'EVENING', label: 'Evening', start: '16:00', end: '19:00', enabled: true },
];

/** The stored setting, falling back to the defaults for anything missing or malformed. */
export function parseSlots(raw: string | null | undefined): SlotSetting[] {
  let stored: unknown = [];
  try {
    stored = raw ? JSON.parse(raw) : [];
  } catch {
    stored = [];
  }
  const list = Array.isArray(stored) ? (stored as Partial<SlotSetting>[]) : [];
  const hhmm = /^([01]\d|2[0-3]):[0-5]\d$/;
  return DEFAULT_BOOKING_SLOTS.map((d) => {
    const s = list.find((x) => x && x.key === d.key);
    if (!s) return d;
    return {
      key: d.key,
      label: typeof s.label === 'string' && s.label.trim() ? s.label.trim().slice(0, 40) : d.label,
      start: typeof s.start === 'string' && hhmm.test(s.start) ? s.start : d.start,
      end: typeof s.end === 'string' && hhmm.test(s.end) ? s.end : d.end,
      enabled: typeof s.enabled === 'boolean' ? s.enabled : d.enabled,
    };
  });
}
