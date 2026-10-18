import { LABELS, PAYMENT_MODES, type PaymentMode } from '@shared/enums';
import type {
  AdminUserDetail,
  BookingDto,
  Paged,
  PaymentDto,
  SubscriptionDto,
  UserDto,
} from '@shared/types';
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, qs } from '../../api/client';
import { useApi, useApiMutation } from '../../api/hooks';
import { Pagination } from '../../components/Pagination';
import { Download, Plus } from '../../components/icons';
import {
  AnchorButton,
  Button,
  Card,
  ChoiceGroup,
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
import { fullDate, money } from '../../lib/format';
import { todayIst } from '../../lib/forms';
import { SearchBox, Table, Td, Tr, UserPicker } from './parts';
import { ReceiptSheet } from './Receipt';

export function RecordPaymentSheet({
  onClose,
  onRecorded,
  presetUserId,
  presetBooking,
  presetSubscription,
}: {
  onClose: () => void;
  onRecorded: (p: PaymentDto) => void;
  presetUserId?: number;
  /** Paying for this one-time booking. */
  presetBooking?: BookingDto;
  /** Paying for this plan (e.g. a pending request). */
  presetSubscription?: SubscriptionDto;
}) {
  const toast = useToast();
  const [user, setUser] = useState<UserDto | null>(null);
  const preset = useApi<AdminUserDetail>(
    ['admin', 'users', presetUserId],
    presetUserId ? `/admin/users/${presetUserId}` : null,
  );
  useEffect(() => {
    if (preset.data && !user) setUser(preset.data.user);
  }, [preset.data, user]);
  const detail = useApi<AdminUserDetail>(
    ['admin', 'users', user?.id],
    user ? `/admin/users/${user.id}` : null,
  );
  const userBookings = useApi<Paged<BookingDto>>(
    ['admin', 'bookings', 'for-user', user?.id],
    user ? `/admin/bookings${qs({ userId: user.id, pageSize: 50 })}` : null,
  );
  /** `s<id>` for a subscription, `b<id>` for a booking, '' for an advance. */
  const [subscriptionId, setSubscriptionId] = useState(
    presetBooking ? `b${presetBooking.id}` : presetSubscription ? `s${presetSubscription.id}` : '',
  );
  const [amount, setAmount] = useState(
    presetBooking
      ? String(Math.max(0, presetBooking.price - presetBooking.paidAmount))
      : presetSubscription
        ? String(Math.max(0, presetSubscription.totalAmount - presetSubscription.paidAmount))
        : '',
  );
  const [mode, setMode] = useState<PaymentMode>('UPI');
  const [reference, setReference] = useState('');
  const [paidOn, setPaidOn] = useState(todayIst());
  const [notes, setNotes] = useState('');
  const record = useApiMutation(
    (b: unknown) => api.post<PaymentDto>('/admin/payments', b),
    [['admin']],
  );
  const subs = (detail.data?.subscriptions ?? []).filter((s) => s.status !== 'CANCELLED');
  const books = (userBookings.data?.items ?? []).filter(
    (b) => b.status !== 'CANCELLED' || b.paidAmount > 0,
  );

  return (
    <Sheet open onClose={onClose} title="Record payment">
      <div className="flex flex-col gap-4">
        <Field label="Customer">
          <UserPicker
            value={user}
            onChange={(u) => {
              setUser(u);
              setSubscriptionId('');
            }}
          />
        </Field>
        <Field
          label="For"
          htmlFor="psub"
          hint="A plan or a one-time booking; leave as advance if neither yet"
        >
          <Select
            id="psub"
            disabled={!user}
            value={subscriptionId}
            onChange={(e) => {
              setSubscriptionId(e.target.value);
              const s = subs.find((x) => `s${x.id}` === e.target.value);
              if (s && !amount) setAmount(String(Math.max(0, s.totalAmount - s.paidAmount)));
              const b = books.find((x) => `b${x.id}` === e.target.value);
              if (b && !amount) setAmount(String(Math.max(0, b.price - b.paidAmount)));
            }}
          >
            <option value="">Advance / not linked</option>
            {books.length ? (
              <optgroup label="One-time bookings">
                {books.map((b) => (
                  <option key={`b${b.id}`} value={`b${b.id}`}>
                    {b.ref} · {b.serviceName} · {b.registrationNumber} · {fullDate(b.date)}
                    {b.paymentStatus === 'UNPAID' ? ' · UNPAID' : ''}
                  </option>
                ))}
              </optgroup>
            ) : null}
            {subs.map((s) => (
              <option key={s.id} value={`s${s.id}`}>
                {s.registrationNumber} · {s.planName} · {fullDate(s.startDate)}–
                {fullDate(s.endDate)}
                {s.status === 'PENDING' ? ' · REQUESTED' : s.isUnpaid ? ' · UNPAID' : ''}
              </option>
            ))}
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Amount (₹)" htmlFor="pamount">
            <Input
              id="pamount"
              type="number"
              inputMode="decimal"
              min={0}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </Field>
          <Field label="Paid on" htmlFor="pdate">
            <Input
              id="pdate"
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
        <Field label="Reference (UPI ref / note)" htmlFor="pref">
          <Input id="pref" value={reference} onChange={(e) => setReference(e.target.value)} />
        </Field>
        <Field label="Notes" htmlFor="pnotes">
          <Textarea
            id="pnotes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="min-h-16"
          />
        </Field>
        <FormError error={record.error} />
        <Button
          variant="cta"
          size="lg"
          disabled={!user || !(Number(amount) > 0)}
          loading={record.isPending}
          onClick={async () => {
            try {
              const p = await record.mutateAsync({
                userId: user!.id,
                subscriptionId: subscriptionId.startsWith('s')
                  ? Number(subscriptionId.slice(1))
                  : null,
                bookingId: subscriptionId.startsWith('b') ? Number(subscriptionId.slice(1)) : null,
                amount: Number(amount),
                mode,
                reference: reference || null,
                paidOn,
                notes: notes || null,
              });
              toast(`${money(p.amount)} recorded for ${p.userName}`);
              onRecorded(p);
            } catch {
              /* shown */
            }
          }}
        >
          Record payment
        </Button>
      </div>
    </Sheet>
  );
}

export function Payments() {
  const [params, setParams] = useSearchParams();
  const get = (k: string) => params.get(k) ?? '';
  const filters = {
    from: get('from'),
    to: get('to'),
    mode: get('mode'),
    search: get('search'),
    userId: get('userId'),
  };
  const page = Number(params.get('page')) || 1;
  const q = useApi<Paged<PaymentDto> & { totalAmount: number }>(
    ['admin', 'payments', filters, page],
    `/admin/payments${qs({ ...filters, page, pageSize: 25 })}`,
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
  const recording = params.get('record') === '1';
  const [receipt, setReceipt] = useState<PaymentDto | null>(null);

  return (
    <>
      <PageTitle
        title="Payments"
        actions={
          <>
            <AnchorButton
              href={`/api/admin/payments/export.csv${qs(filters)}`}
              className="h-[46px] rounded-xl"
              download
            >
              <Download size={18} /> Export CSV
            </AnchorButton>
            <Button
              variant="cta"
              className="h-[46px] rounded-xl"
              onClick={() => update({ record: '1' })}
            >
              <Plus size={18} /> Record payment
            </Button>
          </>
        }
      />
      <Card className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 items-end">
        <Field label="From" htmlFor="ffrom">
          <Input
            id="ffrom"
            type="date"
            value={filters.from}
            onChange={(e) => update({ from: e.target.value })}
            className="h-12"
          />
        </Field>
        <Field label="To" htmlFor="fto">
          <Input
            id="fto"
            type="date"
            value={filters.to}
            onChange={(e) => update({ to: e.target.value })}
            className="h-12"
          />
        </Field>
        <Field label="Mode" htmlFor="fmode">
          <Select
            id="fmode"
            value={filters.mode}
            onChange={(e) => update({ mode: e.target.value })}
            className="h-12"
          >
            <option value="">All modes</option>
            {PAYMENT_MODES.map((m) => (
              <option key={m} value={m}>
                {LABELS.paymentMode[m]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Customer / reference">
          <SearchBox
            value={filters.search}
            onChange={(v) => update({ search: v })}
            placeholder="Search"
          />
        </Field>
      </Card>
      <Card>
        <QueryView query={q}>
          {(d) =>
            d.items.length ? (
              <>
                <div className="flex justify-between text-sm mb-2">
                  <span className="text-muted">{d.total} payments</span>
                  <span>
                    Total <b className="font-display text-base">{money(d.totalAmount)}</b>
                  </span>
                </div>
                <Table
                  head={[
                    'Paid on',
                    'Customer',
                    'Amount',
                    'Mode',
                    'Reference',
                    'For',
                    'Recorded by',
                    '',
                  ]}
                  minWidth={940}
                >
                  {d.items.map((p) => (
                    <Tr key={p.id}>
                      <Td className="whitespace-nowrap">{fullDate(p.paidOn)}</Td>
                      <Td>
                        <Link
                          to={`/admin/users/${p.userId}`}
                          className="font-semibold no-underline"
                        >
                          {p.userName}
                        </Link>
                        <div className="text-xs text-muted">{p.userMobile}</div>
                      </Td>
                      <Td className="font-semibold whitespace-nowrap">{money(p.amount)}</Td>
                      <Td>{LABELS.paymentMode[p.mode]}</Td>
                      <Td className="max-w-40 truncate">{p.reference ?? '—'}</Td>
                      <Td>
                        {p.registrationNumber ? (
                          <>
                            <span className="font-bold plate whitespace-nowrap">
                              {p.registrationNumber}
                            </span>
                            <div className="text-xs text-muted">
                              {p.planName ?? (p.serviceName ? `One-time · ${p.serviceName}` : null)}
                            </div>
                          </>
                        ) : (
                          'Advance'
                        )}
                      </Td>
                      <Td>{p.recordedByName}</Td>
                      <Td>
                        <Button size="sm" onClick={() => setReceipt(p)}>
                          Receipt
                        </Button>
                      </Td>
                    </Tr>
                  ))}
                </Table>
                <Pagination
                  page={d.page}
                  pageSize={d.pageSize}
                  total={d.total}
                  onPage={(p) => update({ page: String(p) })}
                />
              </>
            ) : (
              <EmptyState title="No payments match" />
            )
          }
        </QueryView>
      </Card>
      {recording ? (
        <RecordPaymentSheet
          presetUserId={Number(params.get('userId')) || undefined}
          onClose={() => update({ record: '' })}
          onRecorded={(p) => {
            update({ record: '' });
            setReceipt(p);
          }}
        />
      ) : null}
      {receipt ? <ReceiptSheet payment={receipt} onClose={() => setReceipt(null)} /> : null}
    </>
  );
}
