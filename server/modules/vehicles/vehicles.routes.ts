import { Router } from 'express';
import {
  adminVehicleUpdateSchema,
  paginationQuery,
  societyFilter,
  vehicleInputSchema,
} from '../../../shared/schemas';
import { currentUser, json, paramId, parse } from '../../lib/http';
import {
  addUserVehicle,
  adminListVehicles,
  adminUpdateVehicle,
  getVehicle,
  listUserVehicles,
  updateOwnVehicle,
} from './vehicles.service';

export const meVehiclesRouter = Router();
meVehiclesRouter.get(
  '/',
  json((req) => listUserVehicles(currentUser(req).id)),
);
meVehiclesRouter.post(
  '/',
  json((req) => addUserVehicle(currentUser(req).id, parse(vehicleInputSchema, req.body)), 201),
);
meVehiclesRouter.put(
  '/:id',
  json((req) =>
    updateOwnVehicle(currentUser(req).id, paramId(req), parse(vehicleInputSchema, req.body)),
  ),
);

export const adminVehiclesRouter = Router();
adminVehiclesRouter.get(
  '/',
  json((req) => adminListVehicles(parse(paginationQuery.merge(societyFilter), req.query))),
);
adminVehiclesRouter.get(
  '/:id',
  json((req) => getVehicle(paramId(req))),
);
adminVehiclesRouter.put(
  '/:id',
  json((req) => adminUpdateVehicle(paramId(req), parse(adminVehicleUpdateSchema, req.body))),
);
