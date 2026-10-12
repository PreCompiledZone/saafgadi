import { describe, expect, it } from 'vitest';
import { addDays, addMonths, businessDate } from '../server/lib/dates';
import {
  activityStatus,
  canRecordLog,
  missedDates,
  periodFor,
  periodQuota,
  subscriptionEndDate,
  type ActivityRule,
  type LogLite,
  type SubscriptionWindow,
} from '../server/lib/schedule';
import { displayStatus } from '../server/lib/subscription-status';

const EXTERIOR: ActivityRule = {
  id: 1,
  name: 'Exterior',
  quotaPerMonth: 15,
  minGapDays: 2,
  isActive: true,
};
const INTERIOR: ActivityRule = {
  id: 2,
  name: 'Interior',
  quotaPerMonth: 1,
  minGapDays: 1,
  isActive: true,
};

function sub(startDate: string, months = 1, status: SubscriptionWindow['status'] = 'ACTIVE') {
  return { startDate, endDate: subscriptionEndDate(startDate, months), status };
}

const done = (date: string, activity = EXTERIOR): LogLite => ({
  planActivityId: activity.id,
  serviceDate: date,
  status: 'DONE',
});
const notDone = (date: string, activity = EXTERIOR): LogLite => ({
  planActivityId: activity.id,
  serviceDate: date,
  status: 'NOT_DONE',
});

/** Every other day from `start`, `n` times. */
const alternate = (start: string, n: number) =>
  Array.from({ length: n }, (_, i) => done(addDays(start, i * 2)));

describe('dates', () => {
  it('adds months with end-of-month clamping, measured from the original date', () => {
    expect(addMonths('2026-10-10', 1)).toBe('2026-11-10');
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2028-01-31', 1)).toBe('2028-02-29');
    expect(addMonths('2026-01-31', 2)).toBe('2026-03-31');
    expect(addMonths('2026-12-15', 1)).toBe('2027-01-15');
    expect(addMonths('2026-03-31', -1)).toBe('2026-02-28');
  });

  it('computes the business date in IST across midnight', () => {
    // 23:50 IST on 11 Oct is 18:20 UTC; 00:10 IST on 12 Oct is 18:40 UTC.
    expect(businessDate('Asia/Kolkata', new Date('2026-10-11T18:20:00Z'))).toBe('2026-10-11');
    expect(businessDate('Asia/Kolkata', new Date('2026-10-11T18:40:00Z'))).toBe('2026-10-12');
    // Same instants in UTC stay on the 11th.
    expect(businessDate('UTC', new Date('2026-10-11T18:40:00Z'))).toBe('2026-10-11');
  });
});

describe('subscription months', () => {
  it('end date is start + months − 1 day', () => {
    expect(subscriptionEndDate('2026-10-10', 1)).toBe('2026-11-09');
    expect(subscriptionEndDate('2026-10-10', 3)).toBe('2027-01-09');
    expect(subscriptionEndDate('2026-10-01', 12)).toBe('2027-09-30');
    expect(subscriptionEndDate('2026-01-31', 1)).toBe('2026-02-27');
  });

  it('a subscription month runs to the day before the same date next month', () => {
    const s = sub('2026-10-10', 3);
    expect(periodFor(s, '2026-10-10')).toMatchObject({
      index: 0,
      start: '2026-10-10',
      end: '2026-11-09',
    });
    expect(periodFor(s, '2026-11-09')).toMatchObject({ index: 0 });
    expect(periodFor(s, '2026-11-10')).toMatchObject({
      index: 1,
      start: '2026-11-10',
      end: '2026-12-09',
    });
    expect(periodFor(s, '2027-01-09')).toMatchObject({ index: 2, end: '2027-01-09' });
  });

  it('handles 31-day months and February', () => {
    const s = sub('2026-01-31', 3); // ends 29 Apr
    expect(periodFor(s, '2026-02-27')).toMatchObject({
      index: 0,
      start: '2026-01-31',
      end: '2026-02-27',
    });
    expect(periodFor(s, '2026-02-28')).toMatchObject({
      index: 1,
      start: '2026-02-28',
      end: '2026-03-30',
    });
    expect(periodFor(s, '2026-03-31')).toMatchObject({
      index: 2,
      start: '2026-03-31',
      end: '2026-04-29',
    });
    // A month with 31 days: 1 Oct → 31 Oct.
    expect(periodFor(sub('2026-10-01'), '2026-10-31')).toMatchObject({
      start: '2026-10-01',
      end: '2026-10-31',
    });
  });

  it('returns null outside start…end', () => {
    const s = sub('2026-10-10');
    expect(periodFor(s, '2026-10-09')).toBeNull();
    expect(periodFor(s, '2026-11-10')).toBeNull();
  });

  it('pro-rates a final month cut short, rounding up', () => {
    // Cancelled on 15 Oct: 15 of 31 days → ceil(15 × 15 / 31) = 8.
    const s = { startDate: '2026-10-01', endDate: '2026-10-15', status: 'ACTIVE' as const };
    const p = periodFor(s, '2026-10-05')!;
    expect(p.end).toBe('2026-10-15');
    expect(p.fullEnd).toBe('2026-10-31');
    expect(periodQuota(p, 15)).toBe(8);
    expect(periodQuota(p, 1)).toBe(1);
    expect(
      activityStatus({ sub: s, activity: EXTERIOR, logs: [], today: '2026-10-05' }).quota,
    ).toBe(8);
  });
});

describe('activityStatus', () => {
  const s = sub('2026-10-10'); // 10 Oct – 9 Nov

  it('is due on the first day with nothing done', () => {
    const st = activityStatus({ sub: s, activity: EXTERIOR, logs: [], today: '2026-10-10' });
    expect(st).toMatchObject({ state: 'DUE', used: 0, remaining: 15, quota: 15, resetDate: null });
    expect(st.nextDueDate).toBe('2026-10-10');
  });

  it('follows the alternate-day rhythm with min_gap_days = 2', () => {
    const logs = [done('2026-10-10')];
    expect(activityStatus({ sub: s, activity: EXTERIOR, logs, today: '2026-10-10' }).state).toBe(
      'PENDING',
    );
    const next = activityStatus({ sub: s, activity: EXTERIOR, logs, today: '2026-10-11' });
    expect(next).toMatchObject({
      state: 'PENDING',
      used: 1,
      remaining: 14,
      nextDueDate: '2026-10-12',
    });
    expect(activityStatus({ sub: s, activity: EXTERIOR, logs, today: '2026-10-12' }).state).toBe(
      'DUE',
    );
  });

  it('counts only DONE logs toward the quota', () => {
    const logs = [done('2026-10-10'), notDone('2026-10-12'), notDone('2026-10-13')];
    const st = activityStatus({ sub: s, activity: EXTERIOR, logs, today: '2026-10-14' });
    expect(st).toMatchObject({ used: 1, remaining: 14, state: 'DUE', lastDoneDate: '2026-10-10' });
  });

  it('is complete after 15 exterior washes', () => {
    const logs = alternate('2026-10-10', 15); // last one 7 Nov
    const st = activityStatus({ sub: s, activity: EXTERIOR, logs, today: '2026-11-08' });
    expect(st).toMatchObject({ state: 'COMPLETE', used: 15, remaining: 0, behindSchedule: false });
  });

  it('interior (quota 1) is due any day until done, then complete for the month', () => {
    expect(
      activityStatus({ sub: s, activity: INTERIOR, logs: [], today: '2026-10-20' }).state,
    ).toBe('DUE');
    const logs = [done('2026-10-10', INTERIOR)];
    expect(activityStatus({ sub: s, activity: INTERIOR, logs, today: '2026-10-11' }).state).toBe(
      'COMPLETE',
    );
  });

  it('resets the quota on the next subscription month (no carry-forward)', () => {
    const s3 = sub('2026-10-10', 3);
    const logs = [...alternate('2026-10-10', 15), done('2026-10-10', INTERIOR)];
    expect(activityStatus({ sub: s3, activity: EXTERIOR, logs, today: '2026-11-09' }).state).toBe(
      'COMPLETE',
    );
    const ext = activityStatus({ sub: s3, activity: EXTERIOR, logs, today: '2026-11-10' });
    expect(ext).toMatchObject({ state: 'DUE', used: 0, remaining: 15, periodStart: '2026-11-10' });
    const int = activityStatus({ sub: s3, activity: INTERIOR, logs, today: '2026-11-10' });
    expect(int).toMatchObject({ state: 'DUE', used: 0 });
    // Unused services from month 1 do not carry forward.
    const partial = [...alternate('2026-10-10', 5)];
    expect(
      activityStatus({ sub: s3, activity: EXTERIOR, logs: partial, today: '2026-11-10' }).quota,
    ).toBe(15);
  });

  it('ignores the gap across a month boundary', () => {
    const s3 = sub('2026-10-10', 2);
    const logs = [done('2026-11-09')]; // last day of month 1
    expect(activityStatus({ sub: s3, activity: EXTERIOR, logs, today: '2026-11-10' }).state).toBe(
      'DUE',
    );
  });

  it('reports the reset date when there is a next month', () => {
    const st = activityStatus({
      sub: sub('2026-10-10', 3),
      activity: EXTERIOR,
      logs: [],
      today: '2026-10-15',
    });
    expect(st.resetDate).toBe('2026-11-10');
  });

  it('nothing is due outside start…end or when not active', () => {
    expect(
      activityStatus({ sub: s, activity: EXTERIOR, logs: [], today: '2026-10-09' }).state,
    ).toBe('INACTIVE');
    expect(
      activityStatus({ sub: s, activity: EXTERIOR, logs: [], today: '2026-11-10' }).state,
    ).toBe('INACTIVE');
    const cancelled = { ...s, status: 'CANCELLED' as const };
    expect(
      activityStatus({ sub: cancelled, activity: EXTERIOR, logs: [], today: '2026-10-15' }).state,
    ).toBe('INACTIVE');
    const pending = { ...s, status: 'PENDING' as const };
    expect(
      activityStatus({ sub: pending, activity: EXTERIOR, logs: [], today: '2026-10-15' }).state,
    ).toBe('INACTIVE');
    const off = { ...EXTERIOR, isActive: false };
    expect(activityStatus({ sub: s, activity: off, logs: [], today: '2026-10-15' }).state).toBe(
      'INACTIVE',
    );
  });

  it('flags behind schedule when the quota no longer fits at normal spacing', () => {
    // 31-day month (1–31 Oct). From day 1, 16 alternate slots: fine.
    const oct = sub('2026-10-01');
    expect(
      activityStatus({ sub: oct, activity: EXTERIOR, logs: [], today: '2026-10-01' })
        .behindSchedule,
    ).toBe(false);
    // Day 4 with nothing done: 4,6,…,30 = 14 slots < 15.
    expect(
      activityStatus({ sub: oct, activity: EXTERIOR, logs: [], today: '2026-10-04' })
        .behindSchedule,
    ).toBe(true);
    // On track: 1,3,5 done, today 6th → next slot 7th: 7..31 = 13 slots for 12 remaining.
    const on = activityStatus({
      sub: oct,
      activity: EXTERIOR,
      logs: alternate('2026-10-01', 3),
      today: '2026-10-06',
    });
    expect(on.behindSchedule).toBe(false);
  });

  it('a 28-day February month cannot fit 15 alternate-day washes', () => {
    const feb = sub('2026-02-01'); // 1–28 Feb
    expect(
      activityStatus({ sub: feb, activity: EXTERIOR, logs: [], today: '2026-02-01' })
        .behindSchedule,
    ).toBe(true);
  });
});

describe('canRecordLog', () => {
  const s = sub('2026-10-10');

  it('marks a log on a pending (not due) day as a catch-up', () => {
    const r = canRecordLog(s, EXTERIOR, [done('2026-10-10')], '2026-10-11', 'DONE');
    expect(r).toMatchObject({ ok: true, isCatchUp: true });
    const due = canRecordLog(s, EXTERIOR, [done('2026-10-10')], '2026-10-12', 'DONE');
    expect(due).toMatchObject({ ok: true, isCatchUp: false });
  });

  it('a catch-up counts toward the quota', () => {
    const logs = [done('2026-10-10'), done('2026-10-11')];
    expect(activityStatus({ sub: s, activity: EXTERIOR, logs, today: '2026-10-12' }).used).toBe(2);
  });

  it('rejects the 16th exterior wash in a month', () => {
    const logs = alternate('2026-10-10', 15);
    const r = canRecordLog(s, EXTERIOR, logs, '2026-11-09', 'DONE');
    expect(r).toMatchObject({ ok: false, code: 'ACTIVITY_COMPLETE' });
  });

  it('rejects anything for an activity that is complete', () => {
    const logs = [done('2026-10-10', INTERIOR)];
    expect(canRecordLog(s, INTERIOR, logs, '2026-10-11', 'DONE')).toMatchObject({ ok: false });
    expect(canRecordLog(s, INTERIOR, logs, '2026-10-11', 'NOT_DONE')).toMatchObject({ ok: false });
  });

  it('allows changing today’s own log back and forth (it is excluded)', () => {
    // 14 done before today; today's entry (being edited) is not passed in.
    const logs = alternate('2026-10-10', 14);
    expect(canRecordLog(s, EXTERIOR, logs, '2026-11-07', 'DONE')).toMatchObject({ ok: true });
  });

  it('rejects dates outside the subscription', () => {
    expect(canRecordLog(s, EXTERIOR, [], '2026-11-10', 'DONE')).toMatchObject({
      ok: false,
      code: 'NOT_ACTIVE',
    });
    expect(canRecordLog(s, EXTERIOR, [], '2026-10-09', 'DONE')).toMatchObject({
      ok: false,
      code: 'NOT_ACTIVE',
    });
  });
});

describe('missedDates', () => {
  const s = sub('2026-10-10');

  it('marks expected alternate-day slots with no entry as missed', () => {
    // Done 10th, nothing on 12th (missed), done 13th (catch-up), expected 15th → nothing (missed).
    const logs = [done('2026-10-10'), done('2026-10-13')];
    expect(missedDates(s, EXTERIOR, logs, '2026-10-16')).toEqual(['2026-10-12', '2026-10-15']);
  });

  it('does not treat NOT_DONE (with a reason) as missed', () => {
    const logs = [done('2026-10-10'), notDone('2026-10-12')];
    expect(missedDates(s, EXTERIOR, logs, '2026-10-13')).toEqual([]);
  });

  it('reports a flexible activity only when its month ends short', () => {
    expect(missedDates(sub('2026-10-10', 2), INTERIOR, [], '2026-11-20')).toEqual(['2026-11-09']);
    expect(
      missedDates(sub('2026-10-10', 2), INTERIOR, [done('2026-10-20', INTERIOR)], '2026-11-20'),
    ).toEqual([]);
  });

  it('stops once the quota is met', () => {
    expect(missedDates(s, EXTERIOR, alternate('2026-10-10', 15), '2026-11-09')).toEqual([]);
  });
});

describe('displayStatus', () => {
  const base = { status: 'ACTIVE' as const, startDate: '2026-10-10', endDate: '2026-11-09' };
  it('derives expired / expiring / upcoming from dates', () => {
    expect(displayStatus(base, '2026-10-15').displayStatus).toBe('ACTIVE');
    expect(displayStatus(base, '2026-11-03')).toEqual({ displayStatus: 'EXPIRING', daysLeft: 7 });
    expect(displayStatus(base, '2026-11-10').displayStatus).toBe('EXPIRED');
    expect(displayStatus(base, '2026-10-01').displayStatus).toBe('UPCOMING');
    expect(displayStatus({ ...base, status: 'CANCELLED' }, '2026-10-15').displayStatus).toBe(
      'CANCELLED',
    );
  });
});
