import { Router } from 'express';
import { societyAssignWasherSchema, societyInputSchema } from '../../../shared/schemas';
import { currentUser, json, paramId, parse } from '../../lib/http';
import {
  assignSocietyWasher,
  createSociety,
  getSocietyDetail,
  listPublicSocieties,
  listSocieties,
  listUnlisted,
  updateSociety,
} from './societies.service';

export const publicSocietiesRouter = Router();
publicSocietiesRouter.get(
  '/societies',
  json(() => listPublicSocieties()),
);

export const adminSocietiesRouter = Router();
adminSocietiesRouter.get(
  '/',
  json(() => listSocieties()),
);
adminSocietiesRouter.get(
  '/unlisted',
  json(() => listUnlisted()),
);
adminSocietiesRouter.post(
  '/',
  json((req) => createSociety(currentUser(req).id, parse(societyInputSchema, req.body)), 201),
);
adminSocietiesRouter.get(
  '/:id',
  json((req) => getSocietyDetail(paramId(req))),
);
adminSocietiesRouter.put(
  '/:id',
  json((req) =>
    updateSociety(currentUser(req).id, paramId(req), parse(societyInputSchema, req.body)),
  ),
);
adminSocietiesRouter.post(
  '/:id/assign-washer',
  json((req) =>
    assignSocietyWasher(
      currentUser(req).id,
      paramId(req),
      parse(societyAssignWasherSchema, req.body),
    ),
  ),
);
