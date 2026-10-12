// Business dates are plain 'YYYY-MM-DD' strings in APP_TIMEZONE.
import { formatInTimeZone } from 'date-fns-tz';

export {
  addDays,
  addMonths,
  calendarMonth,
  daysBetween,
  isIsoDate,
  maxDate,
  minDate,
} from '../../shared/calendar';

/** Today's business date for the given instant (default: now) in `timezone`. */
export function businessDate(timezone: string, at: Date = new Date()): string {
  return formatInTimeZone(at, timezone, 'yyyy-MM-dd');
}
