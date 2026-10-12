import { LABELS, PAYMENT_MODES, SUBSCRIPTION_MONTH_OPTIONS, type PaymentMode } from '@shared/enums';
import { addDays, maxDate } from '@shared/calendar';
import type { Paged, SubscriptionDto } from '@shared/types';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, qs } from '../../api/client';
import { useApi, useApiMutation } from '../../api/hooks';
import { Pagination } from '../../components/Pagination';
import { Plus } from '../../components/icons';
import { StatusBadge } from '../../components/status';
import {
  Badge,
  Button,
  Card,
  Checkbox,
  ChoiceGroup,
  EmptyState,
  Field,
  FormError,
  Input,
  LinkButton,
  PageTitle,
  QueryView,
  Sheet,
  useToast,
} from '../../components/ui';
import { fullDate, money, shortDate } from '../../lib/format';
import { todayIst } from '../../lib/forms';
import { FilterTabs, SearchBox, SocietySelect, Table, Td, Tr, WasherSelect } from './parts';

const FILTERS = [
  { value: 'active', label: 'Active' },
  { value: 'expiring', label: 'Expiring' },
  { value: 'expired', label: 'Expired' },
  { value: 'upcoming', label: 'Upcoming' },
  { value: 'unpaid', label: 'Unpaid' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'all', label: 'All' },
] as const;
type Filter = (typeof FILTERS)[number]['value'];

export function SubscriptionActions({ s, onDone }: { s: SubscriptionDto; onDone?: () => void }) {
  const [open, setOpen] = useState<'renew' | 'cancel' | 'washer' | null>(null);
  const close = () => {
    setOpen(null);
    onDone?.();
  };
  if (s.status === 'CANCELLED') return null;
  return (
    <div className="flex flex-wrap gap-1.5 justify-end">
      <Button size="sm" variant="ghost" onClick={() => setOpen('washer')}>
        Washer
      </Button>
      <Button size="sm" variant="ghost" onClick={() => setOpen('renew')}>
        Renew
      </Button>
      <Button size="sm" variant="ghost" className="text-danger" onClick={() => setOpen('cancel')}>
        Cancel
      </Button>
      {open === 'renew' ? <RenewSheet s={s} onClose={close} /> : null}
      {open === 'cancel' ? <CancelSheet s={s} onClose={close} /> : null}
      {open === 'washer' ? <WasherSheet s={s} onClose={close} /> : null}
    </div>
  );
}

function RenewSheet({ s, onClose }: { s: SubscriptionDto; onClose: () => void }) {
  const toast = useToast();
  const [months, setMonths] = useState(s.months);
  const [withoutPayment, setWithoutPayment] = useState(false);
  const [reason, setReason] = useState('');
  const [amount, setAmount] = useState(String(s.monthlyPrice * s.months));
  const [mode, setMode] = useState<PaymentMode>('UPI');
  const [reference, setReference] = useState('');
  const [paidOn, setPaidOn] = useState(todayIst());
  const renew = useApiMutation(
    (b: unknown) => api.post<SubscriptionDto>(`/admin/subscriptions/${s.id}/renew`, b),
    [['admin']],
  );
  const today = todayIst();
  const start = maxDate(addDays(s.endDate, 1), today);
  return (
    <Sheet open onClose={onClose} title={`Renew ${s.registrationNumber}`}>
      <div className="flex flex-col gap-4">
        <p className="text-sm text-muted">
          {s.planName}. The new subscription starts on <b>{fullDate(start)}</b> at the current price
          for this vehicle type.
        </p>
        <ChoiceGroup<number>
          legend="Months"
          columns={4}
          options={SUBSCRIPTION_MONTH_OPTIONS.map((m) => ({ value: m, label: String(m) }))}
          value={months}
          onChange={(m) => {
            setMonths(m);
            setAmount(String(s.monthlyPrice * m));
          }}
        />
        {!withoutPayment ? (
          <>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Amount (₹)" htmlFor="ramount">
                <Input
                  id="ramount"
                  type="number"
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </Field>
              <Field label="Paid on" htmlFor="rpaid">
                <Input
                  id="rpaid"
                  type="date"
                  value={paidOn}
                  onChange={(e) => setPaidOn(e.target.value)}
                />
              </Field>
            </div>
            <ChoiceGroup<PaymentMode>
              legend="Mode"
              columns={2}
              options={PAYMENT_MODES.map((m) => ({ value: m, label: LABELS.paymentMode[m] }))}
              value={mode}
              onChange={setMode}
            />
            <Field label="Reference" htmlFor="rref">
              <Input id="rref" value={reference} onChange={(e) => setReference(e.target.value)} />
            </Field>
          </>
        ) : (
          <Field label="Why no payment?" htmlFor="rreason">
            <Input id="rreason" value={reason} onChange={(e) => setReason(e.target.value)} />
          </Field>
        )}
        <Checkbox
          label="Renew without payment"
          checked={withoutPayment}
          onChange={(e) => setWithoutPayment(e.target.checked)}
        />
        <FormError error={renew.error} />
        <Button
          variant="cta"
          size="lg"
          loading={renew.isPending}
          onClick={async () => {
            try {
              const r = await renew.mutateAsync({
                months,
                withoutPayment,
                withoutPaymentReason: withoutPayment ? reason : null,
                payment: withoutPayment
                  ? null
                  : { amount: Number(amount), mode, reference: reference || null, paidOn },
              });
              toast(`Renewed until ${fullDate(r.endDate)}`);
              onClose();
            } catch {
              /* shown */
            }
          }}
        >
          Renew for {months} {months === 1 ? 'month' : 'months'}
        </Button>
      </div>
    </Sheet>
  );
}

function CancelSheet({ s, onClose }: { s: SubscriptionDto; onClose: () => void }) {
  const toast = useToast();
  const [reason, setReason] = useState('');
  const cancel = useApiMutation(
    (b: unknown) => api.post(`/admin/subscriptions/${s.id}/cancel`, b),
    [['admin']],
  );
  return (
    <Sheet open onClose={onClose} title={`Cancel ${s.registrationNumber}?`}>
      <div className="flex flex-col gap-4">
        <p className="text-sm text-muted">
          {s.planName} ends today and no more washes will be due. Payments already recorded stay as
          they are. To switch plans, cancel and then activate the new plan.
        </p>
        <Field label="Reason (optional)" htmlFor="creason">
          <Input
            id="creason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Changing to Bike Care"
          />
        </Field>
        <FormError error={cancel.error} />
        <Button
          variant="danger"
          size="lg"
          loading={cancel.isPending}
          onClick={async () => {
            try {
              await cancel.mutateAsync({ reason: reason || null });
              toast('Subscription cancelled');
              onClose();
            } catch {
              /* shown */
            }
          }}
        >
          Cancel subscription
        </Button>
      </div>
    </Sheet>
  );
}

function WasherSheet({ s, onClose }: { s: SubscriptionDto; onClose: () => void }) {
  const toast = useToast();
  const [washerId, setWasherId] = useState(s.assignedWasherId ? String(s.assignedWasherId) : '');
  const save = useApiMutation(
    (b: unknown) => api.put(`/admin/subscriptions/${s.id}/washer`, b),
    [['admin']],
  );
  return (
    <Sheet open onClose={onClose} title={`Washer for ${s.registrationNumber}`}>
      <div className="flex flex-col gap-4">
        <Field label="Washer" htmlFor="wsel">
          <WasherSelect id="wsel" value={washerId} onChange={(e) => setWasherId(e.target.value)} />
        </Field>
        <FormError error={save.error} />
        <Button
          variant="cta"
          size="lg"
          loading={save.isPending}
          onClick={async () => {
            try {
              await save.mutateAsync({ washerId: washerId ? Number(washerId) : null });
              toast('Washer updated');
              onClose();
            } catch {
              /* shown */
            }
          }}
        >
          Save
        </Button>
      </div>
    </Sheet>
  );
}

export function SubscriptionRows({ items }: { items: SubscriptionDto[] }) {
  return (
    <Table
      head={['Vehicle', 'Customer', 'Plan', 'Validity', 'Washer', 'Paid', 'Status', '']}
      minWidth={980}
    >
      {items.map((s) => (
        <Tr key={s.id}>
          <Td className="font-bold plate whitespace-nowrap">{s.registrationNumber}</Td>
          <Td>
            <Link to={`/admin/users/${s.userId}`} className="font-semibold no-underline">
              {s.userName}
            </Link>
            <div className="text-xs text-muted">{s.userMobile}</div>
          </Td>
          <Td>
            {s.planName}
            <div className="text-xs text-muted">
              {LABELS.vehicleType[s.vehicleType]} · {money(s.monthlyPrice)}/mo × {s.months}
            </div>
          </Td>
          <Td className="whitespace-nowrap">
            {shortDate(s.startDate)} – {shortDate(s.endDate)}
          </Td>
          <Td>
            {s.assignedWasherName ?? <span className="text-danger font-medium">Not assigned</span>}
          </Td>
          <Td className="whitespace-nowrap">
            {s.isUnpaid ? <Badge tone="danger">Unpaid</Badge> : money(s.paidAmount)}
          </Td>
          <Td>
            <StatusBadge status={s.displayStatus} daysLeft={s.daysLeft} />
          </Td>
          <Td>
            <SubscriptionActions s={s} />
          </Td>
        </Tr>
      ))}
    </Table>
  );
}

export function Subscriptions() {
  const [params, setParams] = useSearchParams();
  const filter = (params.get('filter') as Filter) ?? 'active';
  const search = params.get('search') ?? '';
  const societyId = params.get('societyId') ?? '';
  const page = Number(params.get('page')) || 1;
  const q = useApi<Paged<SubscriptionDto>>(
    ['admin', 'subscriptions', filter, search, societyId, page],
    `/admin/subscriptions${qs({ filter, search, societyId, page, pageSize: 25 })}`,
  );
  const update = (patch: Record<string, string>) => {
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
      <PageTitle
        title="Subscriptions"
        actions={
          <LinkButton
            to="/admin/subscriptions/activate"
            variant="cta"
            className="h-[46px] rounded-xl"
          >
            <Plus size={18} /> Activate plan
          </LinkButton>
        }
      />
      <div className="flex flex-col md:flex-row gap-3 md:items-center md:justify-between">
        <FilterTabs value={filter} options={[...FILTERS]} onChange={(v) => update({ filter: v })} />
        <div className="flex flex-col sm:flex-row gap-2.5">
          <SocietySelect
            className="h-12 sm:w-56"
            value={societyId}
            onChange={(v) => update({ societyId: v })}
          />
          <SearchBox
            className="md:w-72"
            value={search}
            onChange={(v) => update({ search: v })}
            placeholder="Name, mobile, vehicle"
          />
        </div>
      </div>
      <Card>
        <QueryView query={q}>
          {(d) =>
            d.items.length ? (
              <>
                <SubscriptionRows items={d.items} />
                <Pagination
                  page={d.page}
                  pageSize={d.pageSize}
                  total={d.total}
                  onPage={(p) => update({ page: String(p) })}
                />
              </>
            ) : (
              <EmptyState title="No subscriptions here" />
            )
          }
        </QueryView>
      </Card>
    </>
  );
}
