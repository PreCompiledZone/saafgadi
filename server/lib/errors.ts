export class AppError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export const badRequest = (message: string, details?: unknown, code = 'BAD_REQUEST') =>
  new AppError(400, code, message, details);
export const unauthorized = (message = 'Please log in') =>
  new AppError(401, 'UNAUTHORIZED', message);
export const forbidden = (message = 'You do not have access to this') =>
  new AppError(403, 'FORBIDDEN', message);
export const notFound = (what = 'Record') => new AppError(404, 'NOT_FOUND', `${what} not found`);
export const conflict = (message: string, code = 'CONFLICT', details?: unknown) =>
  new AppError(409, code, message, details);
export const unprocessable = (message: string, code = 'RULE_VIOLATION', details?: unknown) =>
  new AppError(422, code, message, details);

/** MySQL duplicate-key error, as thrown by mysql2 (possibly wrapped by Drizzle). */
export function isDuplicateKey(err: unknown): boolean {
  let e: unknown = err;
  for (let i = 0; i < 3 && e; i++) {
    if ((e as { code?: string }).code === 'ER_DUP_ENTRY') return true;
    e = (e as { cause?: unknown }).cause;
  }
  return false;
}
