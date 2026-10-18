import {
  BOOKING_SLOTS,
  LABELS,
  parseSlots,
  type BookingPaymentStatus,
  type BookingSlot,
  type BookingStatus,
} from '@shared/enums';
import type { BookingDto, OneTimeServiceDto, Paged } from '@shared/types';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, qs } from '../../api/client';
import { useApi, useApiMutation } from '../../api/hooks';
import { Pagination } from '../../components/Pagination';
import { Phone, WhatsApp } from '../../components/icons';
import { BookingStatusBadge, slotText, whenText } from '../../components/oneTime';
import {
  AnchorButton,
  Badge,
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
  TimelineItem,
  Dot,
  useToast,
} from '../../components/ui';
import { telTo, whatsappTo } from '../../lib/contact';
import { dateTime, firstName, money } from '../../lib/format';
import { todayIst } from '../../lib/forms';
import { FilterTabs, SearchBox, WasherSelect } from './parts';
import { RecordPaymentSheet } from './Payments';
import { ReceiptSheet } from './Receipt';
import type { PaymentDto } from '@shared/types';

function useSlots() {
  const q = useApi<Record<string, string>>(['admin', 'settings'], '/admin/settings');
  return parseSlots(q.data?.booking_slots);
}

/** Confirm (REQUESTED) or reschedule (CONFIRMED / NOT_DONE): washer, date and slot. */
function ScheduleSheet({ b, onClose }: { b: BookingDto; onClose: () => void }) {
  const toast = useToast();
  const slots = useSlots();
  const confirming = b.status === 'REQUESTED';
  const [washerId, setWasherId] = useState(b.assignedWasherId ? String(b.assignedWasherId) : '');
  const [date, setDate] = useState(
    b.scheduledDate && b.status !== 'NOT_DONE' ? b.scheduledDate : b.preferredDate,
  );
  const [slot, setSlot] = useState<BookingSlot>(b.scheduledSlot ?? b.preferredSlot);
  const [notes, setNotes] = useState(b.adminNotes ?? '');
  const save = useApiMutation(
    (body: unknown) =>
      api.post<BookingDto>(
        `/admin/bookings/${b.id}/${confirming ? 'confirm' : 'reschedule'}`,
        body,
      ),
    [['admin'], ['bookings']],
  );
  return (
    <Sheet open onClose={onClose} title={confirming ? `Confirm ${b.ref}` : `Reschedule ${b.ref}`}>
      <div className="flex flex-col gap-4">
        <p className="text-sm text-muted">
          Customer asked for {whenText({ date: b.preferredDate, slot: b.preferredSlot }, slots)}.
        </p>
        <Field label="Washer" htmlFor="bw">
          <WasherSelect
            id="bw"
            emptyLabel="Choose a washer"
            value={washerId}
            onChange={(e) => setWasherId(e.target.value)}
          />
        </Field>
        <Field label="Date" htmlFor="bd">
          <Input
            id="bd"
            type="date"
            min={todayIst()}
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </Field>
        <ChoiceGroup<BookingSlot>
          legend="Slot"
          columns={2}
          options={BOOKING_SLOTS.map((s) => ({ value: s, label: slotText(s, slots) }))}
          value={slot}
          onChange={setSlot}
        />
        <Field label="Admin notes" htmlFor="bn">
          <Textarea id="bn" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
        <FormError error={save.error} />
        <Button
          variant="cta"
          size="lg"
          disabled={!washerId}
          loading={save.isPending}
          onClick={async () => {
            try {
              await save.mutateAsync({
                washerId: Number(washerId),
                date,
                slot,
                adminNotes: notes || null,
              });
              toast(confirming ? `${b.ref} confirmed` : `${b.ref} rescheduled`);
              onClose();
            } catch {
              /* shown */
            }
          }}
        >
          {confirming ? 'Confirm booking' : 'Save new time'}
        </Button>
      </div>
    </Sheet>
  );
}

function CancelSheet({ b, onClose }: { b: BookingDto; onClose: () => void }) {
  const toast = useToast();
  const [reason, setReason] = useState('');
  const cancel = useApiMutation(
    (body: { reason: string }) => api.post(`/admin/bookings/${b.id}/cancel`, body),
    [['admin'], ['bookings']],
  );
  return (
    <Sheet open onClose={onClose} title={`Cancel ${b.ref}`}>
      <div className="flex flex-col gap-4">
        <Field label="Reason" htmlFor="cr" hint="The customer sees this in the email">
          <Textarea
            id="cr"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="No washer available that day"
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
              toast(`${b.ref} cancelled`);
              onClose();
            } catch {
              /* shown */
            }
          }}
        >
          Cancel booking
        </Button>
      </div>
    </Sheet>
  );
}

function HistorySheet({ b, onClose }: { b: BookingDto; onClose: () => void }) {
  const events = b.events ?? [];
  return (
    <Sheet open onClose={onClose} title={`${b.ref} history`}>
      <div className="flex flex-col pb-2">
        {events.map((e, i) => (
          <TimelineItem
            key={i}
            last={i === events.length - 1}
            marker={
              <Dot>
                <span className="text-[11px] font-bold">{i + 1}</span>
              </Dot>
            }
          >
            <div className="font-semibold">{LABELS.bookingStatus[e.toStatus]}</div>
            <div className="text-[13px] text-muted">
              {dateTime(e.createdAt)}
              {e.actorName ? ` · ${e.actorName}` : ''}
            </div>
            {e.note ? <div className="text-sm">{e.note}</div> : null}
          </TimelineItem>
        ))}
      </div>
    </Sheet>
  );
}

type Action = 'schedule' | 'cancel' | 'pay' | 'history';

const STATUS_TABS: { value: BookingStatus | 'ALL'; label: string }[] = [
  { value: 'REQUESTED', label: 'New' },
  { value: 'CONFIRMED', label: 'Confirmed' },
  { value: 'NOT_DONE', label: 'Not done' },
  { value: 'COMPLETED', label: 'Washed' },
  { value: 'CANCELLED', label: 'Cancelled' },
  { value: 'ALL', label: 'All' },
];

export function AdminBookings() {
  const [params, setParams] = useSearchParams();
  const get = (k: string, d = '') => params.get(k) ?? d;
  const status = get('status', 'REQUESTED') as BookingStatus | 'ALL';
  const page = Number(get('page')) || 1;
  const slots = useSlots();
  const services = useApi<OneTimeServiceDto[]>(
    ['admin', 'one-time-services'],
    '/admin/one-time-services',
  );
  const q = useApi<Paged<BookingDto>>(
    ['admin', 'bookings', params.toString()],
    `/admin/bookings${qs({
      status: status === 'ALL' ? '' : status,
      from: get('from'),
      to: get('to'),
      slot: get('slot'),
      area: get('area'),
      washerId: get('washerId'),
      paymentStatus: get('paymentStatus'),
      serviceId: get('serviceId'),
      search: get('search'),
      page,
      pageSize: 25,
    })}`,
  );
  const [active, setActive] = useState<{ b: BookingDto; action: Action } | null>(null);
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
      <PageTitle title="Bookings" eyebrow="One-time washes" />
      <FilterTabs value={status} options={STATUS_TABS} onChange={(v) => set({ status: v })} />
      <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
        <SearchBox
          value={get('search')}
          onChange={(v) => set({ search: v })}
          placeholder="Name, mobile, vehicle or SG-B number"
          className="sm:col-span-2"
        />
        <Input
          type="date"
          aria-label="From date"
          value={get('from')}
          onChange={(e) => set({ from: e.target.value })}
          className="h-12"
        />
        <Input
          type="date"
          aria-label="To date"
          value={get('to')}
          onChange={(e) => set({ to: e.target.value })}
          className="h-12"
        />
        <Select
          aria-label="Slot"
          value={get('slot')}
          onChange={(e) => set({ slot: e.target.value })}
          className="h-12"
        >
          <option value="">All slots</option>
          {slots.map((s) => (
            <option key={s.key} value={s.key}>
              {s.label}
            </option>
          ))}
        </Select>
        <Input
          aria-label="Area"
          placeholder="Area"
          value={get('area')}
          onChange={(e) => set({ area: e.target.value })}
          className="h-12"
        />
        <WasherSelect
          aria-label="Washer"
          emptyLabel="All washers"
          value={get('washerId')}
          onChange={(e) => set({ washerId: e.target.value })}
          className="h-12"
        />
        <Select
          aria-label="Payment"
          value={get('paymentStatus')}
          onChange={(e) => set({ paymentStatus: e.target.value as BookingPaymentStatus })}
          className="h-12"
        >
          <option value="">Paid and unpaid</option>
          <option value="UNPAID">Unpaid</option>
          <option value="PAID">Paid</option>
        </Select>
        <Select
          aria-label="Service"
          value={get('serviceId')}
          onChange={(e) => set({ serviceId: e.target.value })}
          className="h-12 sm:col-span-2 lg:col-span-1"
        >
          <option value="">All services</option>
          {(services.data ?? []).map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </Select>
      </div>
      <QueryView query={q}>
        {(d) =>
          d.items.length ? (
            <>
              {d.items.map((b) => {
                const open = ['REQUESTED', 'CONFIRMED', 'NOT_DONE'].includes(b.status);
                const msg = `Hi ${firstName(b.userName)}, this is about your booking ${b.ref} (${b.serviceName}).`;
                return (
                  <Card key={b.id} className="flex flex-col gap-3">
                    <div className="flex flex-wrap justify-between gap-3 items-start">
                      <div className="min-w-0">
                        <div className="font-semibold">
                          {b.ref} · {b.serviceName} ·{' '}
                          <span className="plate">{b.registrationNumber}</span>
                        </div>
                        <div className="text-[13px] text-muted">
                          <Link to={`/admin/users/${b.userId}`} className="no-underline">
                            {b.userName}
                          </Link>{' '}
                          · {b.userMobile} · {LABELS.vehicleType[b.vehicleType]} · {b.vehicleColor}
                        </div>
                      </div>
                      <div className="flex gap-1.5 items-center">
                        <Badge tone={b.paymentStatus === 'PAID' ? 'active' : 'warn'}>
                          {LABELS.paymentStatus[b.paymentStatus]} · {money(b.price)}
                        </Badge>
                        <BookingStatusBadge status={b.status} />
                      </div>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-3 text-sm">
                      <div className="bg-canvas rounded-xl px-3 py-2">
                        <div className="text-xs text-muted">
                          {b.scheduledDate ? 'Scheduled' : 'Preferred'}
                        </div>
                        <div className="font-semibold">{whenText(b, slots)}</div>
                      </div>
                      <div className="bg-canvas rounded-xl px-3 py-2">
                        <div className="text-xs text-muted">Where</div>
                        <div className="font-semibold">
                          {b.flatOrHouseNo}, {b.societyOrBuilding}, {b.area}
                        </div>
                        {b.parkingNotes ? (
                          <div className="text-xs text-muted">{b.parkingNotes}</div>
                        ) : null}
                      </div>
                      <div className="bg-canvas rounded-xl px-3 py-2">
                        <div className="text-xs text-muted">Washer</div>
                        <div className="font-semibold">
                          {b.assignedWasherName ?? 'Not assigned'}
                        </div>
                      </div>
                    </div>
                    {b.customerNotes ? (
                      <p className="text-sm bg-canvas rounded-xl px-3 py-2">“{b.customerNotes}”</p>
                    ) : null}
                    {b.notDoneReason && b.status === 'NOT_DONE' ? (
                      <p className="text-sm text-warn-ink">Not done: {b.notDoneReason}</p>
                    ) : null}
                    {b.cancelReason && b.status === 'CANCELLED' ? (
                      <p className="text-sm text-muted">Cancelled: {b.cancelReason}</p>
                    ) : null}
                    <div className="flex flex-wrap gap-2 dotted-top pt-3">
                      <AnchorButton
                        size="sm"
                        href={whatsappTo(b.userMobile, msg)}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <WhatsApp size={16} className="text-accent-ink" /> WhatsApp
                      </AnchorButton>
                      <AnchorButton size="sm" href={telTo(b.userMobile)}>
                        <Phone size={16} className="text-accent-ink" /> Call
                      </AnchorButton>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setActive({ b, action: 'history' })}
                      >
                        History
                      </Button>
                      <span className="flex-1" />
                      {b.paymentStatus === 'UNPAID' && b.status !== 'CANCELLED' ? (
                        <Button size="sm" onClick={() => setActive({ b, action: 'pay' })}>
                          Record payment
                        </Button>
                      ) : null}
                      {open ? (
                        <Button
                          size="sm"
                          variant="danger"
                          onClick={() => setActive({ b, action: 'cancel' })}
                        >
                          Cancel
                        </Button>
                      ) : null}
                      {open ? (
                        <Button
                          size="sm"
                          variant={b.status === 'CONFIRMED' ? 'secondary' : 'cta'}
                          onClick={() => setActive({ b, action: 'schedule' })}
                        >
                          {b.status === 'REQUESTED' ? 'Confirm' : 'Reschedule'}
                        </Button>
                      ) : null}
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
              <EmptyState title="No bookings here" />
            </Card>
          )
        }
      </QueryView>
      {active?.action === 'schedule' ? (
        <ScheduleSheet b={active.b} onClose={() => setActive(null)} />
      ) : null}
      {active?.action === 'cancel' ? (
        <CancelSheet b={active.b} onClose={() => setActive(null)} />
      ) : null}
      {active?.action === 'history' ? (
        <HistorySheet b={active.b} onClose={() => setActive(null)} />
      ) : null}
      {active?.action === 'pay' ? (
        <RecordPaymentSheet
          presetUserId={active.b.userId}
          presetBooking={active.b}
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
