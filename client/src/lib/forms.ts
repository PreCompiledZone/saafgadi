import type { FieldValues, Path, UseFormSetError } from 'react-hook-form';
import { ApiError } from '../api/client';

/** Puts server-side field errors onto the matching form fields. Returns true if any matched. */
export function applyServerErrors<T extends FieldValues>(
  err: unknown,
  setError: UseFormSetError<T>,
  fields: readonly string[],
  prefix = '',
): boolean {
  if (!(err instanceof ApiError)) return false;
  let matched = false;
  for (const [field, messages] of Object.entries(err.fieldErrors)) {
    const name = prefix + field;
    if (fields.includes(name) && messages?.[0]) {
      setError(name as Path<T>, { type: 'server', message: messages[0] });
      matched = true;
    }
  }
  return matched;
}

/** Today's date in India as YYYY-MM-DD (for form defaults only; the server decides real dates). */
export function todayIst(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
}
