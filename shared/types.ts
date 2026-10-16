// Response shapes shared by the API and the client.
import type {
  CarType,
  DisplayStatus,
  EnquiryStatus,
  EnquiryType,
  NotDoneReason,
  PaymentMode,
  Role,
  SubscriptionStatus,
  VehicleCategory,
  VehicleType,
  WashStatus,
} from './enums';

export interface ApiErrorBody {
  error: { code: string; message: string; details?: unknown };
}

export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface SessionUser {
  id: number;
  name: string;
  mobile: string;
  email: string | null;
  /** The email has been confirmed with a code sent to it. */
  emailVerified: boolean;
  /** Customer must verify an email before using the app. */
  mustVerifyEmail: boolean;
  role: Role;
}

export interface UserDto extends SessionUser {
  isActive: boolean;
  /** Onboarded society, when the customer picked one from the list. */
  societyId: number | null;
  addressLine: string | null;
  societyOrBuilding: string | null;
  flatOrHouseNo: string | null;
  area: string | null;
  city: string | null;
  pincode: string | null;
  lastLoginAt: string | null;
  createdAt: string;
}

export interface ContactInfo {
  appName: string;
  businessName: string;
  businessAddress: string;
  supportHours: string;
  whatsappNumber: string;
  callNumber: string;
  whatsappDefaultMessage: string;
  supportEmail: string;
}

export interface PlanActivityDto {
  id: number;
  name: string;
  description: string | null;
  quotaPerMonth: number;
  minGapDays: number;
  sortOrder: number;
  isActive: boolean;
}

export interface PlanPriceDto {
  vehicleType: VehicleType;
  monthlyPrice: number;
  isActive: boolean;
}

export interface PlanDto {
  id: number;
  name: string;
  vehicleCategory: VehicleCategory;
  description: string | null;
  isActive: boolean;
  sortOrder: number;
  activities: PlanActivityDto[];
  prices: PlanPriceDto[];
}

export interface VehicleDto {
  id: number;
  userId: number;
  category: VehicleCategory;
  carType: CarType | null;
  vehicleType: VehicleType;
  registrationNumber: string;
  make: string;
  model: string;
  color: string;
  parkingNotes: string | null;
  isActive: boolean;
  /** Registration number can no longer be changed by the owner. */
  hasSubscription: boolean;
  ownerName?: string;
  ownerMobile?: string;
}

export type ActivityState = 'DUE' | 'PENDING' | 'COMPLETE' | 'INACTIVE';

export interface ActivityProgress {
  activityId: number;
  name: string;
  quota: number;
  used: number;
  remaining: number;
  minGapDays: number;
  state: ActivityState;
  behindSchedule: boolean;
  lastDoneDate: string | null;
  nextDueDate: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  /** First day of the next subscription month (quota resets). */
  resetDate: string | null;
}

export interface SubscriptionDto {
  id: number;
  userId: number;
  userName: string;
  userMobile: string;
  vehicleId: number;
  registrationNumber: string;
  vehicleLabel: string;
  planId: number;
  planName: string;
  vehicleType: VehicleType;
  monthlyPrice: number;
  months: number;
  totalAmount: number;
  startDate: string;
  endDate: string;
  status: SubscriptionStatus;
  displayStatus: DisplayStatus;
  /** Days left including today; negative once expired. */
  daysLeft: number;
  assignedWasherId: number | null;
  assignedWasherName: string | null;
  paidAmount: number;
  isUnpaid: boolean;
  notes: string | null;
  activatedAt: string | null;
  createdAt: string;
}

export interface WashLogDto {
  id: number;
  subscriptionId: number;
  vehicleId: number;
  registrationNumber: string;
  planActivityId: number;
  activityName: string;
  washerId: number;
  washerName: string;
  serviceDate: string;
  performedAt: string;
  status: WashStatus;
  reason: NotDoneReason | null;
  notes: string | null;
  isCatchUp: boolean;
  editedAt: string | null;
  editedByName: string | null;
}

export interface MissedActivity {
  date: string;
  subscriptionId: number;
  vehicleId: number;
  registrationNumber: string;
  activityId: number;
  activityName: string;
  washerId: number | null;
  washerName: string | null;
  ownerName?: string;
}

export interface UserVehicleSummary {
  vehicle: VehicleDto;
  displayStatus: DisplayStatus;
  /** Subscription covering today, else the most recent one. */
  subscription: SubscriptionDto | null;
  /** A renewal that starts after the current one. */
  upcoming: SubscriptionDto | null;
  progress: ActivityProgress[];
  recent: WashLogDto[];
  /** The assigned washer's contact, when the business allows customers to reach them. */
  washer: WasherContact | null;
}

export interface WasherContact {
  name: string;
  mobile: string;
}

export interface UserDashboard {
  today: string;
  name: string;
  vehicles: UserVehicleSummary[];
}

export interface HistoryEntry {
  date: string;
  activityId: number;
  activityName: string;
  kind: 'DONE' | 'NOT_DONE' | 'MISSED';
  log: WashLogDto | null;
}

export interface WasherTodayActivity {
  activityId: number;
  name: string;
  quota: number;
  used: number;
  minGapDays: number;
  /** State before today's log, so a logged item still shows what it was. */
  state: ActivityState;
  log: WashLogDto | null;
  canLog: boolean;
}

export interface WasherTodayItem {
  subscriptionId: number;
  vehicleId: number;
  registrationNumber: string;
  vehicleLabel: string;
  vehicleType: VehicleType;
  color: string;
  ownerName: string;
  societyOrBuilding: string | null;
  flatOrHouseNo: string | null;
  area: string | null;
  parkingNotes: string | null;
  activities: WasherTodayActivity[];
}

export interface WasherToday {
  today: string;
  washerName: string;
  counts: { toDo: number; done: number; notDone: number };
  groups: { society: string; items: WasherTodayItem[] }[];
}

export interface EnquiryDto {
  id: number;
  userId: number | null;
  userName: string | null;
  userMobile: string | null;
  vehicleId: number | null;
  registrationNumber: string | null;
  vehicleLabel: string | null;
  planId: number | null;
  planName: string | null;
  type: EnquiryType;
  message: string | null;
  status: EnquiryStatus;
  adminNotes: string | null;
  handledByName: string | null;
  createdAt: string;
}

export interface PaymentDto {
  id: number;
  subscriptionId: number | null;
  userId: number;
  userName: string;
  userMobile: string;
  registrationNumber: string | null;
  planName: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  /** Plan price, and amount paid towards it up to and including this payment. */
  subscriptionTotal: number | null;
  paidToDate: number | null;
  amount: number;
  mode: PaymentMode;
  reference: string | null;
  paidOn: string;
  recordedByName: string;
  notes: string | null;
  createdAt: string;
}

export interface WasherDto extends UserDto {
  assignedCount: number;
  today: { due: number; done: number; notDone: number; behind: number };
}

export interface AdminDashboard {
  today: string;
  washes: { due: number; done: number; notDone: number; toDo: number };
  active: { total: number; cars: number; bikes: number };
  expiringSoon: { count: number; items: SubscriptionDto[] };
  expired: { count: number };
  unpaid: { count: number };
  openEnquiries: { count: number; items: EnquiryDto[] };
  paymentsThisMonth: { total: number; count: number };
  washers: { id: number; name: string; due: number; done: number; behind: number }[];
  societies: SocietyToday[];
}

export interface SocietyToday {
  societyId: number | null;
  name: string;
  due: number;
  done: number;
  notDone: number;
  behind: number;
}

export interface AdminUserDetail {
  user: UserDto;
  society: SocietyDto | null;
  vehicles: VehicleDto[];
  subscriptions: SubscriptionDto[];
  payments: PaymentDto[];
  enquiries: EnquiryDto[];
}

/** What customers see when choosing their society. */
export interface PublicSociety {
  id: number;
  name: string;
  area: string;
  city: string;
  pincode: string;
}

export interface SocietyDto extends PublicSociety {
  addressLine: string | null;
  notes: string | null;
  isActive: boolean;
  defaultWasherId: number | null;
  defaultWasherName: string | null;
  customers: number;
  vehicles: number;
  activeSubscriptions: number;
  /** Active subscriptions with no washer assigned. */
  unassigned: number;
  /** Washers currently covering this society's active subscriptions. */
  washers: { id: number; name: string; count: number }[];
  createdAt: string;
}

export interface SocietyDetail {
  society: SocietyDto;
  customers: UserDto[];
  subscriptions: SubscriptionDto[];
  today: SocietyToday;
}

/** A society name customers typed that isn't onboarded yet. */
export interface UnlistedSociety {
  /** Normalised name used to match customers. */
  key: string;
  name: string;
  area: string | null;
  city: string | null;
  pincode: string | null;
  customers: number;
  activeSubscriptions: number;
}
