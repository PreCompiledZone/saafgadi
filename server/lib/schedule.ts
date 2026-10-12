// Monthly quota model: what is due, pending or complete on a given day.
// Pure functions only — every rule about quotas lives here, so a future
// carry-forward or adjustment rule can be added without schema changes.
import type { ActivityProgress, ActivityState } from '../../shared/types';
import type { SubscriptionStatus, WashStatus } from '../../shared/enums';
import { addDays, addMonths, daysBetween, minDate } from './dates';

export interface SubscriptionWindow {
  startDate: string;
  endDate: string;
  status: SubscriptionStatus;
}

export interface ActivityRule {
  id: number;
  name: string;
  quotaPerMonth: number;
  minGapDays: number;
  isActive: boolean;
}

export interface LogLite {
  id?: number;
  planActivityId: number;
  serviceDate: string;
  status: WashStatus;
}

export interface Period {
  /** 0-based subscription month number. */
  index: number;
  start: string;
  /** Last day of this month within the subscription (may be cut short by end_date). */
  end: string;
  /** Where the month would end if not cut short. */
  fullEnd: string;
  /** First day of the next subscription month. */
  nextStart: string;
}

export { subscriptionEndDate } from '../../shared/calendar';

/** The subscription month containing `date`, or null outside start…end. */
export function periodFor(
  sub: Pick<SubscriptionWindow, 'startDate' | 'endDate'>,
  date: string,
): Period | null {
  if (date < sub.startDate || date > sub.endDate) return null;
  const [sy, sm] = sub.startDate.split('-').map(Number);
  const [dy, dm] = date.split('-').map(Number);
  let k = Math.max(0, (dy - sy) * 12 + (dm - sm));
  // Month starts are measured from the original start date (with end-of-month
  // clamping), so step back if the estimate overshoots.
  while (k > 0 && addMonths(sub.startDate, k) > date) k--;
  while (addMonths(sub.startDate, k + 1) <= date) k++;
  const start = addMonths(sub.startDate, k);
  const nextStart = addMonths(sub.startDate, k + 1);
  const fullEnd = addDays(nextStart, -1);
  return { index: k, start, end: minDate(fullEnd, sub.endDate), fullEnd, nextStart };
}

/** Quota for a month; a final month cut short by end_date is pro-rated, rounded up. */
export function periodQuota(period: Period, quotaPerMonth: number): number {
  if (period.end >= period.fullEnd) return quotaPerMonth;
  const fullDays = daysBetween(period.start, period.fullEnd) + 1;
  const days = daysBetween(period.start, period.end) + 1;
  return Math.ceil((quotaPerMonth * days) / fullDays);
}

/** How many more services fit from `from` to `end` at `gap`-day spacing. */
function capacity(from: string, end: string, gap: number): number {
  if (from > end) return 0;
  return Math.floor(daysBetween(from, end) / gap) + 1;
}

export interface StatusInput {
  sub: SubscriptionWindow;
  activity: ActivityRule;
  /** Logs for this subscription (any activity); ones for other activities are ignored. */
  logs: LogLite[];
  /** The business date to evaluate. */
  today: string;
}

/**
 * Status of one activity on `today`, given the logs passed in.
 * Pass only logs before today to get the state "at the start of the day"
 * (what the washer sees, and what decides whether a log is a catch-up).
 */
export function activityStatus({ sub, activity, logs, today }: StatusInput): ActivityProgress {
  const base: ActivityProgress = {
    activityId: activity.id,
    name: activity.name,
    quota: activity.quotaPerMonth,
    used: 0,
    remaining: 0,
    minGapDays: activity.minGapDays,
    state: 'INACTIVE',
    behindSchedule: false,
    lastDoneDate: null,
    nextDueDate: null,
    periodStart: null,
    periodEnd: null,
    resetDate: null,
  };
  const period = sub.status === 'ACTIVE' && activity.isActive ? periodFor(sub, today) : null;
  if (!period) return base;

  const gap = Math.max(1, activity.minGapDays);
  const quota = periodQuota(period, activity.quotaPerMonth);
  const done = logs.filter(
    (l) =>
      l.planActivityId === activity.id &&
      l.status === 'DONE' &&
      l.serviceDate >= period.start &&
      l.serviceDate <= period.end,
  );
  const used = done.length;
  const remaining = Math.max(0, quota - used);
  const lastDoneDate =
    done
      .map((l) => l.serviceDate)
      .filter((d) => d <= today)
      .sort()
      .at(-1) ?? null;

  let state: ActivityState;
  let nextPossible: string | null;
  if (remaining === 0) {
    state = 'COMPLETE';
    nextPossible = null;
  } else if (!lastDoneDate || daysBetween(lastDoneDate, today) >= gap) {
    state = 'DUE';
    nextPossible = today;
  } else {
    state = 'PENDING';
    nextPossible = addDays(lastDoneDate, gap);
  }

  const resetDate = period.nextStart <= sub.endDate ? period.nextStart : null;
  let nextDueDate: string | null;
  if (nextPossible === null) nextDueDate = resetDate;
  else if (nextPossible > period.end) nextDueDate = resetDate;
  else nextDueDate = nextPossible;

  const behindSchedule =
    remaining > 0 && remaining > capacity(nextPossible ?? today, period.end, gap);

  return {
    ...base,
    quota,
    used,
    remaining,
    state,
    behindSchedule,
    lastDoneDate,
    nextDueDate,
    periodStart: period.start,
    periodEnd: period.end,
    resetDate,
  };
}

export type LogDecision =
  | { ok: true; isCatchUp: boolean; before: ActivityProgress }
  | { ok: false; code: 'NOT_ACTIVE' | 'ACTIVITY_COMPLETE'; message: string };

/**
 * Whether a log with `status` may be recorded for `date`.
 * `otherLogs` must exclude the log being edited, if any.
 */
export function canRecordLog(
  sub: SubscriptionWindow,
  activity: ActivityRule,
  otherLogs: LogLite[],
  date: string,
  status: WashStatus,
): LogDecision {
  // State at the start of `date`: only earlier days count for spacing, but the
  // whole month counts toward the quota (relevant when an admin edits a past day).
  const before = activityStatus({
    sub,
    activity,
    logs: otherLogs.filter((l) => l.serviceDate !== date),
    today: date,
  });
  if (before.state === 'INACTIVE') {
    return {
      ok: false,
      code: 'NOT_ACTIVE',
      message: 'This plan is not active on that date',
    };
  }
  if (before.state === 'COMPLETE' && status === 'DONE') {
    return {
      ok: false,
      code: 'ACTIVITY_COMPLETE',
      message: `${activity.name} is already complete for this month (${before.used} of ${before.quota})`,
    };
  }
  if (before.state === 'COMPLETE') {
    return {
      ok: false,
      code: 'ACTIVITY_COMPLETE',
      message: `${activity.name} is complete for this month; nothing to record`,
    };
  }
  return { ok: true, isCatchUp: before.state === 'PENDING', before };
}

/**
 * Days on which an activity was expected but nothing was done, from the
 * subscription start up to and including `upTo` (normally yesterday).
 *
 * - Spaced activities (min_gap_days ≥ 2) follow their rhythm: a slot is
 *   expected `gap` days after the last service (or the month start); a slot
 *   with no log at all is missed, and the next slot is `gap` days later.
 * - Flexible activities (min_gap_days = 1, e.g. a monthly interior clean) are
 *   only missed when the month ends short; they are reported on its last day.
 *
 * NOT_DONE days are not "missed" — they already carry a reason.
 */
export function missedDates(
  sub: SubscriptionWindow,
  activity: ActivityRule,
  logs: LogLite[],
  upTo: string,
): string[] {
  if (sub.status !== 'ACTIVE' || !activity.isActive) return [];
  const last = minDate(upTo, sub.endDate);
  if (last < sub.startDate) return [];

  const mine = logs.filter((l) => l.planActivityId === activity.id);
  const byDate = new Map(mine.map((l) => [l.serviceDate, l.status]));
  const gap = Math.max(1, activity.minGapDays);
  const missed: string[] = [];

  let period = periodFor(sub, sub.startDate);
  while (period && period.start <= last) {
    const quota = periodQuota(period, activity.quotaPerMonth);
    const stop = minDate(period.end, last);
    if (gap >= 2) {
      let used = 0;
      let expected = period.start;
      for (let d = period.start; d <= stop && used < quota; d = addDays(d, 1)) {
        const status = byDate.get(d);
        if (status === 'DONE') {
          used++;
          expected = addDays(d, gap);
        } else if (d >= expected) {
          if (!status) missed.push(d);
          expected = addDays(d, gap);
        }
      }
    } else if (period.end <= last) {
      const used = mine.filter(
        (l) =>
          l.status === 'DONE' && l.serviceDate >= period!.start && l.serviceDate <= period!.end,
      ).length;
      if (used < quota) missed.push(period.end);
    }
    period = period.nextStart <= sub.endDate ? periodFor(sub, period.nextStart) : null;
  }
  return missed;
}
