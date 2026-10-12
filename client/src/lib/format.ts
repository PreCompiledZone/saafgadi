import { LABELS, type VehicleType } from '@shared/enums';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const LONG_DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const LONG_MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

function parts(d: string) {
  const [y, m, day] = d.split('-').map(Number);
  const weekday = new Date(Date.UTC(y, m - 1, day)).getUTCDay();
  return { y, m, day, weekday };
}

/** `9 Nov` */
export function shortDate(d: string | null | undefined): string {
  if (!d) return '—';
  const p = parts(d);
  return `${p.day} ${MONTHS[p.m - 1]}`;
}

/** `9 Nov 2026` */
export function fullDate(d: string | null | undefined): string {
  if (!d) return '—';
  const p = parts(d);
  return `${p.day} ${MONTHS[p.m - 1]} ${p.y}`;
}

/** `Fri 9 Oct` */
export function dayDate(d: string): string {
  const p = parts(d);
  return `${DAYS[p.weekday]} ${p.day} ${MONTHS[p.m - 1]}`;
}

/** `Sunday, 11 October` */
export function longDate(d: string): string {
  const p = parts(d);
  return `${LONG_DAYS[p.weekday]}, ${p.day} ${LONG_MONTHS[p.m - 1]}`;
}

/** `October 2026` from `2026-10` */
export function monthLabel(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  return `${LONG_MONTHS[m - 1]} ${y}`;
}

export function addDaysIso(d: string, n: number): string {
  const p = parts(d);
  return new Date(Date.UTC(p.y, p.m - 1, p.day + n)).toISOString().slice(0, 10);
}

/** Relative day name for a business date: Today / Yesterday / Tomorrow / Fri 9 Oct. */
export function relativeDay(d: string, today: string): string {
  if (d === today) return 'Today';
  if (d === addDaysIso(today, -1)) return 'Yesterday';
  if (d === addDaysIso(today, 1)) return 'Tomorrow';
  return dayDate(d);
}

/** `7:42 am` in India time. */
export function timeOf(iso: string): string {
  return new Intl.DateTimeFormat('en-IN', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: 'Asia/Kolkata',
  })
    .format(new Date(iso))
    .replace(/\s?([AP])M/i, (_m, ap: string) => ` ${ap.toLowerCase()}m`);
}

export function dateTime(iso: string): string {
  return new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: 'Asia/Kolkata',
  }).format(new Date(iso));
}

const inr = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 2,
  minimumFractionDigits: 0,
});

export function money(n: number): string {
  return inr.format(n);
}

export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  return (
    (words[0]?.[0] ?? '') + (words.length > 1 ? words[words.length - 1][0] : '')
  ).toUpperCase();
}

/** `Rohan K.` */
export function shortName(name: string): string {
  const words = name.trim().split(/\s+/);
  return words.length > 1 ? `${words[0]} ${words[words.length - 1][0]}.` : words[0];
}

export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}

export function vehicleTypeLabel(t: VehicleType): string {
  return LABELS.vehicleType[t];
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}
