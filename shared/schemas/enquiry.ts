import { z } from 'zod';
import { ENQUIRY_STATUSES, ENQUIRY_TYPES } from '../enums';
import { optionalText, paginationQuery } from './common';

export const createEnquirySchema = z.object({
  type: z.enum(ENQUIRY_TYPES),
  vehicleId: z.number().int().positive().nullish(),
  planId: z.number().int().positive().nullish(),
  message: optionalText(1000),
});
export type CreateEnquiryInput = z.input<typeof createEnquirySchema>;

export const updateEnquirySchema = z.object({
  status: z.enum(ENQUIRY_STATUSES),
  adminNotes: optionalText(1000),
});

export const enquiryListQuery = paginationQuery.extend({
  status: z.enum(ENQUIRY_STATUSES).optional(),
});
