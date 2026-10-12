import { Router } from 'express';
import { eq } from 'drizzle-orm';
import {
  adminCreateSchema,
  adminUserUpdateSchema,
  profileUpdateSchema,
  resetPasswordSchema,
  staffCreateSchema,
  staffUpdateSchema,
  userListQuery,
  vehicleInputSchema,
} from '../../../shared/schemas';
import { getDb } from '../../db';
import { subscriptions } from '../../db/schema';
import { today } from '../../lib/clock';
import { currentUser, json, paramId, parse } from '../../lib/http';
import { listWashers } from '../dashboard/dashboard.service';
import { findSubscriptions } from '../subscriptions/subscription.repo';
import { addUserVehicle } from '../vehicles/vehicles.service';
import { coveringDate } from '../wash-logs/wash-logs.service';
import { and } from 'drizzle-orm';
import {
  createAdmin,
  createUser,
  getUser,
  getUserDetail,
  listByRole,
  listUsers,
  resetPassword,
  updateProfile,
  updateUser,
} from './users.service';

export const meProfileRouter = Router();
meProfileRouter.get(
  '/',
  json((req) => getUser(currentUser(req).id)),
);
meProfileRouter.put(
  '/',
  json((req) => updateProfile(currentUser(req).id, parse(profileUpdateSchema, req.body))),
);

/** Customers. */
export const adminUsersRouter = Router();
adminUsersRouter.get(
  '/',
  json((req) => listUsers({ ...parse(userListQuery, req.query), role: 'USER' })),
);
adminUsersRouter.post(
  '/',
  json((req) => createUser(currentUser(req).id, 'USER', parse(staffCreateSchema, req.body)), 201),
);
adminUsersRouter.get(
  '/:id',
  json((req) => getUserDetail(paramId(req))),
);
adminUsersRouter.put(
  '/:id',
  json((req) =>
    updateUser(currentUser(req).id, paramId(req), parse(adminUserUpdateSchema, req.body), 'USER'),
  ),
);
adminUsersRouter.post(
  '/:id/reset-password',
  json(async (req) => {
    await resetPassword(
      currentUser(req).id,
      paramId(req),
      parse(resetPasswordSchema, req.body).password,
    );
    return { ok: true };
  }),
);
adminUsersRouter.post(
  '/:id/vehicles',
  json(async (req) => {
    const user = await getUser(paramId(req), 'USER');
    return addUserVehicle(user.id, parse(vehicleInputSchema, req.body));
  }, 201),
);

export const adminWashersRouter = Router();
adminWashersRouter.get(
  '/',
  json(() => listWashers()),
);
adminWashersRouter.post(
  '/',
  json((req) => createUser(currentUser(req).id, 'WASHER', parse(staffCreateSchema, req.body)), 201),
);
adminWashersRouter.get(
  '/:id',
  json(async (req) => {
    const washer = await getUser(paramId(req), 'WASHER');
    const t = today();
    const assigned = await findSubscriptions(
      getDb(),
      t,
      and(coveringDate(t), eq(subscriptions.assignedWasherId, washer.id)),
    );
    return { washer, assigned };
  }),
);
adminWashersRouter.put(
  '/:id',
  json((req) =>
    updateUser(currentUser(req).id, paramId(req), parse(staffUpdateSchema, req.body), 'WASHER'),
  ),
);
adminWashersRouter.post(
  '/:id/reset-password',
  json(async (req) => {
    await getUser(paramId(req), 'WASHER');
    await resetPassword(
      currentUser(req).id,
      paramId(req),
      parse(resetPasswordSchema, req.body).password,
    );
    return { ok: true };
  }),
);

export const adminAdminsRouter = Router();
adminAdminsRouter.get(
  '/',
  json(() => listByRole('ADMIN')),
);
adminAdminsRouter.post(
  '/',
  json((req) => createAdmin(currentUser(req).id, parse(adminCreateSchema, req.body)), 201),
);
adminAdminsRouter.put(
  '/:id',
  json((req) =>
    updateUser(currentUser(req).id, paramId(req), parse(staffUpdateSchema, req.body), 'ADMIN'),
  ),
);
adminAdminsRouter.post(
  '/:id/reset-password',
  json(async (req) => {
    await getUser(paramId(req), 'ADMIN');
    await resetPassword(
      currentUser(req).id,
      paramId(req),
      parse(resetPasswordSchema, req.body).password,
    );
    return { ok: true };
  }),
);
