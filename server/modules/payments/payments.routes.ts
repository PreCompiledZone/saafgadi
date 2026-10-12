import { Router } from 'express';
import { paymentListQuery, recordPaymentSchema } from '../../../shared/schemas';
import { today } from '../../lib/clock';
import { currentUser, json, parse } from '../../lib/http';
import { listPayments, paymentsCsv, recordPayment } from './payments.service';

export const adminPaymentsRouter = Router();
adminPaymentsRouter.get(
  '/',
  json((req) => listPayments(parse(paymentListQuery, req.query))),
);
adminPaymentsRouter.post(
  '/',
  json((req) => recordPayment(currentUser(req).id, parse(recordPaymentSchema, req.body)), 201),
);
adminPaymentsRouter.get('/export.csv', async (req, res) => {
  const csv = await paymentsCsv(parse(paymentListQuery, req.query));
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="payments-${today()}.csv"`);
  res.send('﻿' + csv);
});
