import { LABELS, type SlotSetting } from '@shared/enums';
import type { BookingDto, MyWashes as Data, MyWashItem, WashLogDto } from '@shared/types';
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, qs } from '../../api/client';
import { useApi, useApiMutation, useContact } from '../../api/hooks';
import { Pagination } from '../../components/Pagination';
import { Check, WhatsApp, X } from '../../components/icons';
import { BookingStatusBadge, BookingTimeline, whenText } from '../../components/oneTime';
import {
  AnchorButton,
  Button,
  Card,
  cx,
  Dot,
  EmptyState,
  FormError,
  Input,
  LinkButton,
  PageTitle,
  QueryView,
  Select,
  Tag,
  useToast,
} from '../../components/ui';
import { customerHelpMessage, whatsappLink } from '../../lib/contact';
import { dayDate, money, timeOf } from '../../lib/format';
import { todayIst } from '../../lib/forms';

type Range = 'this' | 'last' | 'custom';

function monthBounds(offset: number): { from: string; to: string } {
  const [y, m] = todayIst().split('-').map(Number);
  const first = new Date(Date.UTC(y, m - 1 + offset, 1));
  const last = new Date(Date.UTC(y, m + offset, 0));
  return { from: first.toISOString().slice(0, 10), to: last.toISOString().slice(0, 10) };
}

function Chips<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div role="group" aria-label={label} className="flex gap-1.5 overflow-x-auto -mx-5 px-5 pb-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={o.value === value}
          onClick={() => onChange(o.value)}
          className={cx(
            'shrink-0 h-9 px-3.5 rounded-full text-sm font-semibold border',
            o.value === value
              ? 'bg-accent-soft border-accent text-accent-deep'
              : 'bg-white border-line text-muted hover:text-ink',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function MonthlyRow({ log }: { log: WashLogDto }) {
  const done = log.status === 'DONE';
  return (
    <Card className="flex gap-3 items-start py-4">
      {done ? (
        <Dot>
          <Check size={13} strokeWidth={3.4} />
        </Dot>
      ) : (
        <Dot tone="warn">
          <X size={13} strokeWidth={3} />
        </Dot>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex justify-between gap-2">
          <span className="font-semibold">
            {log.activityName} {log.isCatchUp ? <Tag>Catch-up</Tag> : null}
          </span>
          <Tag tone="neutral">Monthly</Tag>
        </div>
        <div className="text-[13px] text-muted">
          {log.registrationNumber} · {dayDate(log.serviceDate)} · {timeOf(log.performedAt)}
          {done
            ? ` · ${log.washerName}`
            : ` · Not done${log.reason ? `: ${LABELS.reason[log.reason]}` : ''}`}
        </div>
      </div>
    </Card>
  );
}

function BookingCard({ b, slots }: { b: BookingDto; slots: SlotSetting[] }) {
  const toast = useToast();
  const contact = useContact().data;
  const cancel = useApiMutation(
    () => api.post<BookingDto>(`/bookings/${b.id}/cancel`),
    [['me'], ['bookings']],
  );
  const [confirming, setConfirming] = useState(false);
  const open = b.status === 'REQUESTED' || b.status === 'CONFIRMED';
  const wa = whatsappLink(contact, customerHelpMessage(contact, b.registrationNumber));
  return (
    <Card className="flex flex-col gap-3">
      <div className="flex justify-between gap-2 items-start">
        <div className="min-w-0">
          <div className="font-semibold">{b.serviceName}</div>
          <div className="text-[13px] text-muted">
            {b.ref} · <span className="plate font-semibold text-ink">{b.registrationNumber}</span>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <Tag>One-time</Tag>
          <BookingStatusBadge status={b.status} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 text-sm">
        <div className="bg-canvas rounded-xl p-2.5 col-span-2">
          <div className="text-xs text-muted">
            {b.scheduledDate ? 'Scheduled' : 'Requested for'}
          </div>
          <div className="font-semibold">{whenText(b, slots)}</div>
        </div>
        <div className="bg-canvas rounded-xl p-2.5">
          <div className="text-xs text-muted">Washer</div>
          <div className="font-semibold truncate">{b.assignedWasherName ?? 'Assigning'}</div>
        </div>
        <div className="bg-canvas rounded-xl p-2.5">
          <div className="text-xs text-muted">{LABELS.paymentStatus[b.paymentStatus]}</div>
          <div className="font-semibold">{money(b.price)}</div>
        </div>
      </div>
      {b.status === 'CANCELLED' || b.status === 'NOT_DONE' ? (
        <p className="text-sm text-muted">
          {b.status === 'CANCELLED'
            ? `Cancelled${b.cancelReason ? `: ${b.cancelReason}` : ''}`
            : `Not done${b.notDoneReason ? `: ${b.notDoneReason}` : ''}. We’ll reschedule it.`}
        </p>
      ) : (
        <BookingTimeline booking={b} />
      )}
      {b.status === 'COMPLETED' && b.completedAt ? (
        <p className="text-sm font-semibold text-accent-ink">
          Washed at {timeOf(b.completedAt)} on {dayDate(b.date)}
        </p>
      ) : null}
      {open ? (
        <div className="dotted-top pt-3 flex flex-col gap-2">
          <FormError error={cancel.error} />
          {b.canCancel ? (
            confirming ? (
              <div className="grid grid-cols-2 gap-2">
                <Button size="sm" onClick={() => setConfirming(false)}>
                  Keep it
                </Button>
                <Button
                  size="sm"
                  variant="danger"
                  loading={cancel.isPending}
                  onClick={async () => {
                    try {
                      await cancel.mutateAsync(undefined);
                      toast(`${b.ref} cancelled`);
                    } catch {
                      /* shown */
                    }
                  }}
                >
                  Yes, cancel
                </Button>
              </div>
            ) : (
              <Button size="sm" variant="danger" onClick={() => setConfirming(true)}>
                Cancel booking
              </Button>
            )
          ) : (
            <div className="flex items-center justify-between gap-3">
              <span className="text-[13px] text-muted">Too close to the slot to cancel here.</span>
              {wa ? (
                <AnchorButton size="sm" href={wa} target="_blank" rel="noopener noreferrer">
                  <WhatsApp size={16} className="text-accent-ink" /> Contact us
                </AnchorButton>
              ) : null}
            </div>
          )}
        </div>
      ) : null}
    </Card>
  );
}

export function MyWashes() {
  const [params, setParams] = useSearchParams();
  const type = (params.get('type') ?? 'all') as 'all' | 'monthly' | 'one_time';
  const status = (params.get('status') ?? '') as '' | 'upcoming' | 'completed' | 'cancelled';
  const reg = params.get('reg') ?? '';
  const range = (params.get('range') ?? (status === 'upcoming' ? 'any' : 'this')) as Range | 'any';
  const page = Number(params.get('page')) || 1;
  const bounds =
    range === 'this'
      ? monthBounds(0)
      : range === 'last'
        ? monthBounds(-1)
        : range === 'custom'
          ? { from: params.get('from') ?? '', to: params.get('to') ?? '' }
          : { from: '', to: '' };

  const q = useApi<Data>(
    ['me', 'washes', type, status, reg, bounds.from, bounds.to, page],
    `/me/washes${qs({ type, status, reg, from: bounds.from, to: bounds.to, page, pageSize: 20 })}`,
  );
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
    <div className="flex flex-col gap-3 pt-1">
      <PageTitle title="My washes" />
      <Chips
        label="Type"
        value={type}
        options={[
          { value: 'all', label: 'All' },
          { value: 'monthly', label: 'Monthly' },
          { value: 'one_time', label: 'One-time' },
        ]}
        onChange={(v) => set({ type: v === 'all' ? '' : v })}
      />
      <Chips
        label="Status"
        value={status}
        options={[
          { value: '', label: 'Any status' },
          { value: 'upcoming', label: 'Upcoming' },
          { value: 'completed', label: 'Completed' },
          { value: 'cancelled', label: 'Cancelled & not done' },
        ]}
        onChange={(v) => set({ status: v })}
      />
      <Chips
        label="Dates"
        value={range}
        options={[
          { value: 'this', label: 'This month' },
          { value: 'last', label: 'Last month' },
          { value: 'any', label: 'Any time' },
          { value: 'custom', label: 'Custom' },
        ]}
        onChange={(v) =>
          set({
            range: v,
            ...(v === 'custom' ? monthBounds(0) : { from: '', to: '' }),
          })
        }
      />
      {range === 'custom' ? (
        <div className="grid grid-cols-2 gap-2">
          <Input
            type="date"
            aria-label="From"
            value={bounds.from}
            onChange={(e) => set({ from: e.target.value })}
          />
          <Input
            type="date"
            aria-label="To"
            value={bounds.to}
            onChange={(e) => set({ to: e.target.value })}
          />
        </div>
      ) : null}
      {q.data && q.data.registrations.length > 1 ? (
        <Select aria-label="Vehicle" value={reg} onChange={(e) => set({ reg: e.target.value })}>
          <option value="">All vehicles</option>
          {q.data.registrations.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </Select>
      ) : null}
      <QueryView query={q}>
        {(d) =>
          d.items.length ? (
            <>
              {d.items.map((i: MyWashItem) =>
                i.kind === 'MONTHLY' ? (
                  <MonthlyRow key={`m${i.log.id}`} log={i.log} />
                ) : (
                  <BookingCard key={`b${i.booking.id}`} b={i.booking} slots={d.slots} />
                ),
              )}
              <Pagination
                page={d.page}
                pageSize={d.pageSize}
                total={d.total}
                onPage={(p) => set({ page: String(p) })}
              />
            </>
          ) : (
            <Card>
              <EmptyState
                title="No washes here"
                action={
                  <LinkButton to="/app/book" variant="cta">
                    Book a one-time wash
                  </LinkButton>
                }
              >
                Try another filter, or book a wash.
              </EmptyState>
            </Card>
          )
        }
      </QueryView>
    </div>
  );
}
