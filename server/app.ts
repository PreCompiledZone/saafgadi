import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import cookieParser from 'cookie-parser';
import express, { Router } from 'express';
import helmet from 'helmet';
import { getConfig } from './config';
import { pingDb } from './db';
import { logger } from './lib/logger';
import { loadUser, requireRole } from './middleware/auth';
import { errorHandler, notFoundApi } from './middleware/error';
import { authRouter } from './modules/auth/auth.routes';
import { adminDashboardRouter, meDashboardRouter } from './modules/dashboard/dashboard.routes';
import { adminEnquiriesRouter, meEnquiriesRouter } from './modules/enquiries/enquiries.routes';
import { adminPaymentsRouter } from './modules/payments/payments.routes';
import { adminPlansRouter, publicPlansRouter } from './modules/plans/plans.routes';
import { adminSettingsRouter, publicSettingsRouter } from './modules/settings/settings.routes';
import { adminSocietiesRouter, publicSocietiesRouter } from './modules/societies/societies.routes';
import {
  adminSubscriptionsRouter,
  meSubscriptionsRouter,
} from './modules/subscriptions/subscriptions.routes';
import {
  adminAdminsRouter,
  adminUsersRouter,
  adminWashersRouter,
  meProfileRouter,
} from './modules/users/users.routes';
import { adminVehiclesRouter, meVehiclesRouter } from './modules/vehicles/vehicles.routes';
import {
  adminWashLogsRouter,
  meWashLogsRouter,
  washerRouter,
} from './modules/wash-logs/wash-logs.routes';

/** Built client: dist/client next to dist/server. */
function clientDir(): string | null {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [path.resolve(here, '../client'), path.resolve(here, '../dist/client')];
  return candidates.find((p) => fs.existsSync(path.join(p, 'index.html'))) ?? null;
}

export function createApp() {
  const config = getConfig();
  const app = express();
  app.disable('x-powered-by');
  // Hostinger (and most hosts) put the app behind one reverse proxy.
  app.set('trust proxy', 1);

  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: true,
        directives: {
          'default-src': ["'self'"],
          'script-src': ["'self'"],
          'style-src': ["'self'", "'unsafe-inline'"],
          'font-src': ["'self'", 'data:'],
          'img-src': ["'self'", 'data:'],
          'connect-src': ["'self'"],
          'form-action': ["'self'"],
          'upgrade-insecure-requests': config.auth.cookieSecure ? [] : null,
        },
      },
      strictTransportSecurity: config.auth.cookieSecure,
    }),
  );
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());

  const api = Router();
  api.use((_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  api.get('/health', async (_req, res) => {
    try {
      await pingDb();
      res.json({ status: 'ok', db: 'ok', time: new Date().toISOString() });
    } catch (err) {
      logger.error('Health check: database unreachable', err);
      res.status(503).json({ status: 'error', db: 'unreachable' });
    }
  });
  api.use(loadUser);
  api.use('/auth', authRouter);
  api.use('/public', publicPlansRouter, publicSettingsRouter, publicSocietiesRouter);

  const me = Router();
  me.use(requireRole('USER'));
  me.use('/profile', meProfileRouter);
  me.use('/vehicles', meVehiclesRouter);
  me.use('/subscriptions', meSubscriptionsRouter);
  me.use('/wash-logs', meWashLogsRouter);
  me.use('/enquiries', meEnquiriesRouter);
  me.use('/dashboard', meDashboardRouter);
  api.use('/me', me);

  api.use('/washer', requireRole('WASHER'), washerRouter);

  const admin = Router();
  admin.use(requireRole('ADMIN'));
  admin.use('/dashboard', adminDashboardRouter);
  admin.use('/users', adminUsersRouter);
  admin.use('/washers', adminWashersRouter);
  admin.use('/societies', adminSocietiesRouter);
  admin.use('/admins', adminAdminsRouter);
  admin.use('/vehicles', adminVehiclesRouter);
  admin.use('/plans', adminPlansRouter);
  admin.use('/subscriptions', adminSubscriptionsRouter);
  admin.use('/payments', adminPaymentsRouter);
  admin.use('/wash-logs', adminWashLogsRouter);
  admin.use('/enquiries', adminEnquiriesRouter);
  admin.use('/settings', adminSettingsRouter);
  api.use('/admin', admin);

  api.use(notFoundApi);
  app.use('/api', api);

  const dir = clientDir();
  if (dir) {
    const indexHtml = fs
      .readFileSync(path.join(dir, 'index.html'), 'utf8')
      .replaceAll('__APP_NAME__', escapeHtml(config.appName));
    app.use(
      express.static(dir, {
        index: false,
        setHeaders(res, file) {
          // Vite fingerprints everything under /assets.
          if (file.includes(`${path.sep}assets${path.sep}`)) {
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
          }
        },
      }),
    );
    // SPA fallback: every non-API GET gets the app shell.
    app.get(/^(?!\/api\/).*/, (_req, res) => {
      res.setHeader('Cache-Control', 'no-cache');
      res.type('html').send(indexHtml);
    });
  } else if (config.isProduction) {
    logger.warn('Built client not found (dist/client). Run `npm run build`.');
  }

  app.use(errorHandler);
  return app;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}
