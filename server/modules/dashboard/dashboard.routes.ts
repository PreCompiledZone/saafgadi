import { Router } from 'express';
import { currentUser, json } from '../../lib/http';
import { adminDashboard, userDashboard } from './dashboard.service';

export const adminDashboardRouter = Router();
adminDashboardRouter.get(
  '/',
  json(() => adminDashboard()),
);

export const meDashboardRouter = Router();
meDashboardRouter.get(
  '/',
  json((req) => {
    const u = currentUser(req);
    return userDashboard(u.id, u.name);
  }),
);
