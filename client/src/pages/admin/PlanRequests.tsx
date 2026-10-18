import { LABELS, subscriptionRef, VEHICLE_TYPES } from '@shared/enums';
import type { Paged, PaymentDto, PlanDto, SubscriptionDto } from '@shared/types';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, qs } from '../../api/client';
import { useApi, useApiMutation } from '../../api/hooks';
import { Pagination } from '../../components/Pagination';
import { Phone, WhatsApp } from '../../components/icons';
import {
  AnchorButton,
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  FormError,
  Input,
  PageTitle,
  QueryView,
  Select,
  Sheet,
  Textarea,
  useToast,
} from '../../components/ui';
import { telTo, whatsappTo } from '../../lib/contact';
import { firstName, fullDate, money, shortDate } from '../../lib/format';
import { todayIst } from '../../lib/forms';
import { SearchBox, WasherSelect } from './parts';
import { RecordPaymentSheet } from './Payments';
import { ReceiptSheet } from './Receipt';

function ActivateSheet({ s, onClose }: { s: SubscriptionDto; onClose: () => void }) {
  const toast = useToast();
  const today = todayIst();
  const [start, setStart] = useState(s.startDate < today ? today : s.startDate);
  const [washerId, setWasherId] = useState('');
  const activate = useApiMutation(
    (body: unknown) => api.post<SubscriptionDto>(`/admin/subscriptions/${s.id}/activate`, body),
    [['admin']],
  );
  return (
    <Sheet open onClose={onClose} title={`Activate ${subscriptionRef(s.id)}`}>
      <div className="flex flex-col gap-4">
        <p className="text-sm text-muted">
          {s.userName} · {s.registrationNumber} · {s.planName}, {s.months}{' '}
          {s.months === 1 ? 'month' : 'months'} · {money(s.totalAmount)}
          {s.isUnpaid ? ' · no payment recorded yet' : ` · ${money(s.paidAmount)} paid`}
        </p>
        <Field label="Start date" htmlFor="as" hint={`Customer asked for ${fullDate(s.startDate)}`}>
          <Input
            id="as"
            type="date"
            min={today}
            value={start}
            onChange={(e) => setStart(e.target.value)}
          />
        </Field>
        <Field
          label="Washer"
          htmlFor="aw"
          hint="Empty: the society’s default washer, if it has one"
        >
          <WasherSelect
            id="aw"
            emptyLabel="Society default"
            value={washerId}
            onChange={(e) => setWasherId(e.target.value)}
          />
        </Field>
        <FormError error={activate.error} />
        <Button
          variant="cta"
          size="lg"
          loading={activate.isPending}
          onClick={async () => {
            try {
              await activate.mutateAsync({
                startDate: start,
                ...(washerId ? { washerId: Number(washerId) } : {}),
              });
              toast(`${subscriptionRef(s.id)} is active`);
              onClose();
            } catch {
              /* shown */
            }
          }}
        >
          Activate plan
        </Button>
      </div>
    </Sheet>
  );
}

function CancelSheet({ s, onClose }: { s: SubscriptionDto; onClose: () => void }) {
  const toast = useToast();
  const [reason, setReason] = useState('');
  const cancel = useApiMutation(
    (body: { reason: string }) => api.post(`/admin/subscriptions/${s.id}/cancel`, body),
    [['admin']],
  );
  return (
    <Sheet open onClose={onClose} title={`Cancel ${subscriptionRef(s.id)}`}>
      <div className="flex flex-col gap-4">
        <Field label="Reason" htmlFor="cr">
          <Textarea
            id="cr"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Customer changed their mind"
          />
        </Field>
        <FormError error={cancel.error} />
        <Button
          variant="danger"
          size="lg"
          disabled={!reason.trim()}
          loading={cancel.isPending}
          onClick={async () => {
            try {
              await cancel.mutateAsync({ reason: reason.trim() });
              toast(`${subscriptionRef(s.id)} cancelled`);
              onClose();
            } catch {
              /* shown */
            }
          }}
        >
          Cancel request
        </Button>
      </div>
    </Sheet>
  );
}

type Action = 'activate' | 'cancel' | 'pay';

/** Monthly plan requests waiting for payment and activation. */
export function PlanRequests() {
  const [params, setParams] = useSearchParams();
  const get = (k: string) => params.get(k) ?? '';
  const page = Number(get('page')) || 1;
  const plans = useApi<PlanDto[]>(['admin', 'plans'], '/admin/plans');
  const q = useApi<Paged<SubscriptionDto>>(
    ['admin', 'subscriptions', 'pending', params.toString()],
    `/admin/subscriptions${qs({
      status: 'PENDING',
      area: get('area'),
      planId: get('planId'),
      vehicleType: get('vehicleType'),
      requestedFrom: get('from'),
      requestedTo: get('to'),
      search: get('search'),
      page,
      pageSize: 25,
    })}`,
  );
  const [active, setActive] = useState<{ s: SubscriptionDto; action: Action } | null>(null);
  const [receipt, setReceipt] = useState<PaymentDto | null>(null);
  const set = (patch: Record<string, string>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    if (!('page' in patch)) next.delete('page');
    setParams(next, { replace: true });
  };

  return (
    <>
      <PageTitle title="Plan requests" eyebrow="Monthly plans waiting for activation" />
      <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
        <SearchBox
          value={get('search')}
          onChange={(v) => set({ search: v })}
          placeholder="Name, mobile or vehicle number"
          className="sm:col-span-2 lg:col-span-3"
        />
        <Input
          aria-label="Area"
          placeholder="Area"
          value={get('area')}
          onChange={(e) => set({ area: e.target.value })}
          className="h-12"
        />
        <Select
          aria-label="Plan"
          value={get('planId')}
          onChange={(e) => set({ planId: e.target.value })}
          className="h-12"
        >
          <option value="">All plans</option>
          {(plans.data ?? []).map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Select>
        <Select
          aria-label="Vehicle type"
          value={get('vehicleType')}
          onChange={(e) => set({ vehicleType: e.target.value })}
          className="h-12"
        >
          <option value="">All vehicle types</option>
          {VEHICLE_TYPES.map((t) => (
            <option key={t} value={t}>
              {LABELS.vehicleType[t]}
            </option>
          ))}
        </Select>
        <Input
          type="date"
          aria-label="Requested from"
          value={get('from')}
          onChange={(e) => set({ from: e.target.value })}
          className="h-12"
        />
        <Input
          type="date"
          aria-label="Requested to"
          value={get('to')}
          onChange={(e) => set({ to: e.target.value })}
          className="h-12"
        />
      </div>
      <QueryView query={q}>
        {(d) =>
          d.items.length ? (
            <>
              {d.items.map((s) => {
                const ref = subscriptionRef(s.id);
                const msg = `Hi ${firstName(s.userName)}, this is about your plan request ${ref} for ${s.registrationNumber}.`;
                return (
                  <Card key={s.id} className="flex flex-col gap-3">
                    <div className="flex flex-wrap justify-between gap-3 items-start">
                      <div className="min-w-0">
                        <div className="font-semibold">
                          {ref} · {s.planName} ·{' '}
                          <span className="plate">{s.registrationNumber}</span>
                        </div>
                        <div className="text-[13px] text-muted">
                          <Link to={`/admin/users/${s.userId}`} className="no-underline">
                            {s.userName}
                          </Link>{' '}
                          · {s.userMobile} · {s.vehicleLabel} · requested{' '}
                          {shortDate(s.createdAt.slice(0, 10))}
                        </div>
                      </div>
                      <Badge tone={s.isUnpaid ? 'warn' : 'active'}>
                        {s.isUnpaid ? 'Unpaid' : `${money(s.paidAmount)} paid`}
                      </Badge>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-sm">
                      {[
                        ['Months', String(s.months)],
                        ['Total', money(s.totalAmount)],
                        ['Wants to start', shortDate(s.startDate)],
                      ].map(([k, v]) => (
                        <div key={k} className="bg-canvas rounded-xl px-3 py-2">
                          <div className="text-xs text-muted">{k}</div>
                          <div className="font-semibold">{v}</div>
                        </div>
                      ))}
                    </div>
                    {s.notes ? <p className="text-sm text-muted">{s.notes}</p> : null}
                    <div className="flex flex-wrap gap-2 dotted-top pt-3">
                      <AnchorButton
                        size="sm"
                        href={whatsappTo(s.userMobile, msg)}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <WhatsApp size={16} className="text-accent-ink" /> WhatsApp
                      </AnchorButton>
                      <AnchorButton size="sm" href={telTo(s.userMobile)}>
                        <Phone size={16} className="text-accent-ink" /> Call
                      </AnchorButton>
                      <span className="flex-1" />
                      <Button
                        size="sm"
                        variant="danger"
                        onClick={() => setActive({ s, action: 'cancel' })}
                      >
                        Cancel
                      </Button>
                      <Button size="sm" onClick={() => setActive({ s, action: 'pay' })}>
                        Record payment
                      </Button>
                      <Button
                        size="sm"
                        variant="cta"
                        onClick={() => setActive({ s, action: 'activate' })}
                      >
                        Activate
                      </Button>
                    </div>
                  </Card>
                );
              })}
              <Pagination
                page={d.page}
                pageSize={d.pageSize}
                total={d.total}
                onPage={(p) => set({ page: String(p) })}
              />
            </>
          ) : (
            <Card>
              <EmptyState title="No plan requests waiting" />
            </Card>
          )
        }
      </QueryView>
      {active?.action === 'activate' ? (
        <ActivateSheet s={active.s} onClose={() => setActive(null)} />
      ) : null}
      {active?.action === 'cancel' ? (
        <CancelSheet s={active.s} onClose={() => setActive(null)} />
      ) : null}
      {active?.action === 'pay' ? (
        <RecordPaymentSheet
          presetUserId={active.s.userId}
          presetSubscription={active.s}
          onClose={() => setActive(null)}
          onRecorded={(p) => {
            setActive(null);
            setReceipt(p);
          }}
        />
      ) : null}
      {receipt ? <ReceiptSheet payment={receipt} onClose={() => setReceipt(null)} /> : null}
    </>
  );
}
