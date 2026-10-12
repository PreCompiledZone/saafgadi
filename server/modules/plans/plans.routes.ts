import { Router } from 'express';
import { planActivitiesSchema, planPricesSchema, planUpdateSchema } from '../../../shared/schemas';
import { currentUser, json, paramId, parse } from '../../lib/http';
import { getPlan, listPlans, replaceActivities, replacePrices, updatePlan } from './plans.service';

export const publicPlansRouter = Router();
publicPlansRouter.get(
  '/plans',
  json(() => listPlans({ publicOnly: true })),
);

export const adminPlansRouter = Router();
adminPlansRouter.get(
  '/',
  json(() => listPlans({ publicOnly: false })),
);
adminPlansRouter.get(
  '/:id',
  json((req) => getPlan(paramId(req))),
);
adminPlansRouter.put(
  '/:id',
  json((req) => updatePlan(currentUser(req).id, paramId(req), parse(planUpdateSchema, req.body))),
);
adminPlansRouter.put(
  '/:id/activities',
  json((req) =>
    replaceActivities(currentUser(req).id, paramId(req), parse(planActivitiesSchema, req.body)),
  ),
);
adminPlansRouter.put(
  '/:id/prices',
  json((req) =>
    replacePrices(currentUser(req).id, paramId(req), parse(planPricesSchema, req.body)),
  ),
);
