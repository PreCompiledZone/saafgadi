import { Router } from 'express';
import {
  createEnquirySchema,
  enquiryListQuery,
  paginationQuery,
  updateEnquirySchema,
} from '../../../shared/schemas';
import { currentUser, json, paramId, parse } from '../../lib/http';
import { createEnquiry, listEnquiries, updateEnquiry } from './enquiries.service';

export const meEnquiriesRouter = Router();
meEnquiriesRouter.get(
  '/',
  json((req) =>
    listEnquiries({ ...parse(paginationQuery, req.query), userId: currentUser(req).id }),
  ),
);
meEnquiriesRouter.post(
  '/',
  json((req) => createEnquiry(currentUser(req).id, parse(createEnquirySchema, req.body)), 201),
);

export const adminEnquiriesRouter = Router();
adminEnquiriesRouter.get(
  '/',
  json((req) => listEnquiries(parse(enquiryListQuery, req.query))),
);
adminEnquiriesRouter.put(
  '/:id',
  json((req) =>
    updateEnquiry(currentUser(req).id, paramId(req), parse(updateEnquirySchema, req.body)),
  ),
);
