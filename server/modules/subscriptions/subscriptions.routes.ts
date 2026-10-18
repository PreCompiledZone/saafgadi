import { Router } from 'express';
import { z } from 'zod';
import { VEHICLE_TYPES } from '../../../shared/enums';
import {
  activatePendingSchema,
  activateSubscriptionSchema,
  isoDate,
  planRequestSchema,
  renewRequestSchema,
  assignWasherSchema,
  cancelSubscriptionSchema,
  idParam,
  paginationQuery,
  renewSubscriptionSchema,
} from '../../../shared/schemas';
import { eq } from 'drizzle-orm';
import { getDb } from '../../db';
import { subscriptions } from '../../db/schema';
import { today } from '../../lib/clock';
import { notFound } from '../../lib/errors';
import { currentUser, json, paramId, parse } from '../../lib/http';
import { findSubscription, findSubscriptions } from './subscription.repo';
import {
  activateSubscription,
  assignWasher,
  cancelSubscription,
  listSubscriptions,
  renewSubscription,
  SUBSCRIPTION_FILTERS,
} from './subscriptions.service';
import {
  activatePending,
  cancelRequest,
  expireStalePending,
  renewRequest,
  requestPlan,
} from './requests.service';

const listQuery = paginationQuery.extend({
  filter: z.enum(SUBSCRIPTION_FILTERS).default('all'),
  status: z.enum(['PENDING', 'ACTIVE', 'CANCELLED']).optional(),
  area: z.string().trim().max(120).optional(),
  planId: idParam.optional(),
  vehicleType: z.enum(VEHICLE_TYPES).optional(),
  requestedFrom: isoDate.optional(),
  requestedTo: isoDate.optional(),
  userId: idParam.optional(),
  vehicleId: idParam.optional(),
  washerId: idParam.optional(),
  societyId: idParam.optional(),
});

export const adminSubscriptionsRouter = Router();
adminSubscriptionsRouter.get(
  '/',
  json((req) => listSubscriptions(parse(listQuery, req.query))),
);
adminSubscriptionsRouter.get(
  '/:id',
  json(async (req) => {
    const s = await findSubscription(getDb(), paramId(req), today());
    if (!s) throw notFound('Subscription');
    return s;
  }),
);
adminSubscriptionsRouter.post(
  '/activate',
  json(
    (req) => activateSubscription(currentUser(req).id, parse(activateSubscriptionSchema, req.body)),
    201,
  ),
);
adminSubscriptionsRouter.post(
  '/:id/activate',
  json((req) =>
    activatePending(currentUser(req).id, paramId(req), parse(activatePendingSchema, req.body)),
  ),
);
adminSubscriptionsRouter.post(
  '/:id/renew',
  json(
    (req) =>
      renewSubscription(
        currentUser(req).id,
        paramId(req),
        parse(renewSubscriptionSchema, req.body),
      ),
    201,
  ),
);
adminSubscriptionsRouter.post(
  '/:id/cancel',
  json((req) =>
    cancelSubscription(
      currentUser(req).id,
      paramId(req),
      parse(cancelSubscriptionSchema, req.body ?? {}).reason,
    ),
  ),
);
adminSubscriptionsRouter.put(
  '/:id/washer',
  json((req) =>
    assignWasher(currentUser(req).id, paramId(req), parse(assignWasherSchema, req.body).washerId),
  ),
);

export const meSubscriptionsRouter = Router();
meSubscriptionsRouter.get(
  '/',
  json(async (req) => {
    await expireStalePending();
    return findSubscriptions(getDb(), today(), eq(subscriptions.userId, currentUser(req).id));
  }),
);

/** /api/subscriptions (customer): plan requests. */
export const userSubscriptionsRouter = Router();
userSubscriptionsRouter.post(
  '/',
  json((req) => requestPlan(currentUser(req).id, parse(planRequestSchema, req.body)), 201),
);
userSubscriptionsRouter.post(
  '/:id/cancel',
  json((req) => cancelRequest(currentUser(req).id, paramId(req))),
);
userSubscriptionsRouter.post(
  '/:id/renew',
  json(
    (req) => renewRequest(currentUser(req).id, paramId(req), parse(renewRequestSchema, req.body)),
    201,
  ),
);
