import { Router } from 'express';
import { z } from 'zod';
import {
  activateSubscriptionSchema,
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

const listQuery = paginationQuery.extend({
  filter: z.enum(SUBSCRIPTION_FILTERS).default('all'),
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
  json((req) => findSubscriptions(getDb(), today(), eq(subscriptions.userId, currentUser(req).id))),
);
