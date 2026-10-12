import type { Request, RequestHandler } from 'express';
import type { z } from 'zod';
import { idParam } from '../../shared/schemas/common';
import { unauthorized } from './errors';
import type { AuthUser } from '../middleware/auth';

/** Parse with zod; ZodErrors become 400 VALIDATION_ERROR in the error handler. */
export function parse<S extends z.ZodTypeAny>(schema: S, data: unknown): z.output<S> {
  return schema.parse(data);
}

export function paramId(req: Request, name = 'id'): number {
  return idParam.parse(req.params[name]);
}

export function currentUser(req: Request): AuthUser {
  if (!req.user) throw unauthorized();
  return req.user;
}

/** Wraps a handler that returns data and sends it as JSON. */
export function json<T>(fn: (req: Request) => Promise<T> | T, status = 200): RequestHandler {
  return async (req, res) => {
    const data = await fn(req);
    res.status(status).json(data);
  };
}
