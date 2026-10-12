import type { DisplayStatus, SubscriptionStatus } from '../../shared/enums';
import { daysBetween } from './dates';

export const EXPIRING_WITHIN_DAYS = 7;

/** "Expired", "expiring" and "upcoming" are derived from dates, never stored. */
export function displayStatus(
  sub: { status: SubscriptionStatus; startDate: string; endDate: string },
  today: string,
): { displayStatus: DisplayStatus; daysLeft: number } {
  const daysLeft = daysBetween(today, sub.endDate) + 1;
  if (sub.status === 'CANCELLED') return { displayStatus: 'CANCELLED', daysLeft };
  if (sub.status === 'PENDING') return { displayStatus: 'PENDING', daysLeft };
  if (sub.endDate < today) return { displayStatus: 'EXPIRED', daysLeft };
  if (sub.startDate > today) return { displayStatus: 'UPCOMING', daysLeft };
  if (daysLeft <= EXPIRING_WITHIN_DAYS) return { displayStatus: 'EXPIRING', daysLeft };
  return { displayStatus: 'ACTIVE', daysLeft };
}
