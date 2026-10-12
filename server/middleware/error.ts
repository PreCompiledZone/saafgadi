import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import type { ApiErrorBody } from '../../shared/types';
import { AppError, isDuplicateKey } from '../lib/errors';
import { logger } from '../lib/logger';

export function notFoundApi(req: Request, res: Response) {
  const body: ApiErrorBody = {
    error: { code: 'NOT_FOUND', message: `No API route for ${req.method} ${req.path}` },
  };
  res.status(404).json(body);
}

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  let status = 500;
  let body: ApiErrorBody = {
    error: { code: 'INTERNAL_ERROR', message: 'Something went wrong. Please try again.' },
  };

  if (err instanceof AppError) {
    status = err.status;
    body = { error: { code: err.code, message: err.message, details: err.details } };
  } else if (err instanceof ZodError) {
    status = 400;
    const flat = err.flatten();
    const first = err.issues[0];
    body = {
      error: {
        code: 'VALIDATION_ERROR',
        message: first ? `${first.path.join('.') || 'input'}: ${first.message}` : 'Invalid input',
        details: { fieldErrors: flat.fieldErrors, formErrors: flat.formErrors, issues: err.issues },
      },
    };
  } else if (isDuplicateKey(err)) {
    status = 409;
    body = { error: { code: 'DUPLICATE', message: 'That record already exists' } };
  } else if ((err as { type?: string }).type === 'entity.parse.failed') {
    status = 400;
    body = { error: { code: 'BAD_JSON', message: 'Request body is not valid JSON' } };
  } else if ((err as { type?: string }).type === 'entity.too.large') {
    status = 413;
    body = { error: { code: 'TOO_LARGE', message: 'Request body is too large' } };
  }

  if (status >= 500) logger.error(`${req.method} ${req.originalUrl} failed`, err);
  else logger.debug(`${req.method} ${req.originalUrl} → ${status} ${body.error.code}`);
  res.status(status).json(body);
}
