import { Router } from 'express';
import { z } from 'zod';
import {
  adminWashLogQuery,
  idParam,
  washerLogCreateSchema,
  washLogUpdateSchema,
} from '../../../shared/schemas';
import { getDb } from '../../db';
import { vehicles } from '../../db/schema';
import { eq } from 'drizzle-orm';
import { today } from '../../lib/clock';
import { notFound } from '../../lib/errors';
import { currentUser, json, paramId, parse } from '../../lib/http';
import {
  adminListLogs,
  adminUpdateLog,
  vehicleHistory,
  washerCreateLog,
  washerHistory,
  washerToday,
  washerUpdateLog,
} from './wash-logs.service';
import { washerBookingsToday } from '../one-time/bookings.service';

export const washerRouter = Router();
washerRouter.get(
  '/today',
  json(async (req) => {
    const u = currentUser(req);
    return washerToday(u.id, u.name, await washerBookingsToday(u.id));
  }),
);
washerRouter.post(
  '/logs',
  json((req) => washerCreateLog(currentUser(req).id, parse(washerLogCreateSchema, req.body)), 201),
);
washerRouter.put(
  '/logs/:id',
  json((req) =>
    washerUpdateLog(currentUser(req).id, paramId(req), parse(washLogUpdateSchema, req.body)),
  ),
);
washerRouter.get(
  '/history',
  json((req) => washerHistory(currentUser(req).id)),
);

export const adminWashLogsRouter = Router();
adminWashLogsRouter.get(
  '/',
  json((req) => adminListLogs(parse(adminWashLogQuery, req.query))),
);
adminWashLogsRouter.put(
  '/:id',
  json((req) =>
    adminUpdateLog(currentUser(req).id, paramId(req), parse(washLogUpdateSchema, req.body)),
  ),
);

const meQuery = z.object({
  vehicleId: idParam,
  month: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Use YYYY-MM')
    .optional(),
});

export const meWashLogsRouter = Router();
meWashLogsRouter.get(
  '/',
  json(async (req) => {
    const q = parse(meQuery, req.query);
    const [v] = await getDb().select().from(vehicles).where(eq(vehicles.id, q.vehicleId));
    if (!v || v.userId !== currentUser(req).id) throw notFound('Vehicle');
    return vehicleHistory(v.id, q.month ?? today().slice(0, 7));
  }),
);
