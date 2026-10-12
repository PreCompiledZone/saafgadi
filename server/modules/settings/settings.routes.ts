import { Router } from 'express';
import { settingsSchema } from '../../../shared/schemas';
import { currentUser, json, parse } from '../../lib/http';
import { getContactInfo, getSettings, updateSettings } from './settings.service';

export const publicSettingsRouter = Router();
publicSettingsRouter.get(
  '/contact',
  json(() => getContactInfo()),
);

export const adminSettingsRouter = Router();
adminSettingsRouter.get(
  '/',
  json(() => getSettings()),
);
adminSettingsRouter.put(
  '/',
  json((req) => updateSettings(currentUser(req).id, parse(settingsSchema, req.body))),
);
