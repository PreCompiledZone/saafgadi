// Pure calendar maths on 'YYYY-MM-DD' strings, shared by server and client.
// Done on UTC midnights so the host's own timezone never matters.

const DAY_MS = 86_400_000;

function toUtc(d: string): Date {
  const [y, m, day] = d.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, day));
}

function fromUtc(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDays(d: string, n: number): string {
  return fromUtc(new Date(toUtc(d).getTime() + n * DAY_MS));
}

/**
 * Adds calendar months, clamping to the month's last day
 * (31 Jan + 1 month = 28/29 Feb), always measured from `d` itself.
 */
export function addMonths(d: string, n: number): string {
  const [y, m, day] = d.split('-').map(Number);
  const targetMonthIndex = m - 1 + n;
  const ty = y + Math.floor(targetMonthIndex / 12);
  const tm = ((targetMonthIndex % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(ty, tm + 1, 0)).getUTCDate();
  return fromUtc(new Date(Date.UTC(ty, tm, Math.min(day, lastDay))));
}

/** Whole days from `a` to `b` (positive when b is later). */
export function daysBetween(a: string, b: string): number {
  return Math.round((toUtc(b).getTime() - toUtc(a).getTime()) / DAY_MS);
}

export function maxDate(a: string, b: string): string {
  return a > b ? a : b;
}

export function minDate(a: string, b: string): string {
  return a < b ? a : b;
}

/** First and last day of the calendar month containing `d`. */
export function calendarMonth(d: string): { start: string; end: string } {
  const start = `${d.slice(0, 7)}-01`;
  return { start, end: addDays(addMonths(start, 1), -1) };
}

export function isIsoDate(d: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(d) && fromUtc(toUtc(d)) === d;
}

/** `end_date = start_date + months − 1 day`. */
export function subscriptionEndDate(startDate: string, months: number): string {
  return addDays(addMonths(startDate, months), -1);
}
