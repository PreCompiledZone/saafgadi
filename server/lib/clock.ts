import { getConfig } from '../config';
import { businessDate } from './dates';

/** Server time. The client never supplies dates or times for wash logs. */
export function now(): Date {
  return new Date();
}

/** Today's business date in APP_TIMEZONE. */
export function today(): string {
  return businessDate(getConfig().timezone, now());
}
