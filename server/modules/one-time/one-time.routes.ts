import { Router } from 'express';
import {
  adminBookingQuery,
  bookingConfirmSchema,
  bookingCreateSchema,
  bookingListQuery,
  bookingRescheduleSchema,
  myWashesQuery,
  oneTimeServiceSchema,
  reasonSchema,
} from '../../../shared/schemas';
import { currentUser, json, paramId, parse } from '../../lib/http';
import {
  adminCancelBooking,
  adminGetBooking,
  adminListBookings,
  bookingOptions,
  cancelMyBooking,
  confirmBooking,
  createBooking,
  getMyBooking,
  listMyBookings,
  myWashes,
  rescheduleBooking,
  washerCompleteBooking,
  washerNotDoneBooking,
} from './bookings.service';
import { createService, listServices, updateService } from './services.service';

/** GET /api/one-time-services */
export const publicServicesRouter = Router();
publicServicesRouter.get(
  '/',
  json(() => listServices(true)),
);

/** /api/bookings (customer) */
export const userBookingsRouter = Router();
userBookingsRouter.get(
  '/options',
  json((req) => bookingOptions(currentUser(req).id)),
);
userBookingsRouter.post(
  '/',
  json((req) => createBooking(currentUser(req).id, parse(bookingCreateSchema, req.body)), 201),
);
userBookingsRouter.get(
  '/',
  json((req) => listMyBookings(currentUser(req).id, parse(bookingListQuery, req.query))),
);
userBookingsRouter.get(
  '/:id',
  json((req) => getMyBooking(currentUser(req).id, paramId(req))),
);
userBookingsRouter.post(
  '/:id/cancel',
  json((req) => cancelMyBooking(currentUser(req).id, paramId(req))),
);

/** /api/me/washes */
export const meWashesRouter = Router();
meWashesRouter.get(
  '/',
  json((req) => myWashes(currentUser(req).id, parse(myWashesQuery, req.query))),
);

/** /api/washer/bookings */
export const washerBookingsRouter = Router();
washerBookingsRouter.post(
  '/:id/complete',
  json((req) => washerCompleteBooking(currentUser(req).id, paramId(req))),
);
washerBookingsRouter.post(
  '/:id/not-done',
  json((req) =>
    washerNotDoneBooking(currentUser(req).id, paramId(req), parse(reasonSchema, req.body).reason),
  ),
);

/** /api/admin/one-time-services */
export const adminServicesRouter = Router();
adminServicesRouter.get(
  '/',
  json(() => listServices(false)),
);
adminServicesRouter.post(
  '/',
  json((req) => createService(currentUser(req).id, parse(oneTimeServiceSchema, req.body)), 201),
);
adminServicesRouter.put(
  '/:id',
  json((req) =>
    updateService(currentUser(req).id, paramId(req), parse(oneTimeServiceSchema, req.body)),
  ),
);

/** /api/admin/bookings */
export const adminBookingsRouter = Router();
adminBookingsRouter.get(
  '/',
  json((req) => adminListBookings(parse(adminBookingQuery, req.query))),
);
adminBookingsRouter.get(
  '/:id',
  json((req) => adminGetBooking(paramId(req))),
);
adminBookingsRouter.post(
  '/:id/confirm',
  json((req) =>
    confirmBooking(currentUser(req).id, paramId(req), parse(bookingConfirmSchema, req.body)),
  ),
);
adminBookingsRouter.post(
  '/:id/reschedule',
  json((req) =>
    rescheduleBooking(currentUser(req).id, paramId(req), parse(bookingRescheduleSchema, req.body)),
  ),
);
adminBookingsRouter.post(
  '/:id/cancel',
  json((req) =>
    adminCancelBooking(currentUser(req).id, paramId(req), parse(reasonSchema, req.body).reason),
  ),
);
