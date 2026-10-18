import { LABELS, type BookingSlot, type BookingStatus, type SlotSetting } from '@shared/enums';
import type { BookingDto, OneTimeServiceDto } from '@shared/types';
import { useEffect, useState, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useApi } from '../api/hooks';
import { dateTime, fullDate, money } from '../lib/format';
import { Bike, Car, Check, Clock } from './icons';
import { Badge, Card, cx, LinkButton } from './ui';

export const useOneTimeServices = () =>
  useApi<OneTimeServiceDto[]>(['public', 'one-time-services'], '/one-time-services', {
    staleTime: 5 * 60_000,
  });

/** "Morning (08:00–10:00)"; falls back to the key before settings load. */
export function slotText(slot: BookingSlot, slots: SlotSetting[] | undefined): string {
  const s = slots?.find((x) => x.key === slot);
  return s ? `${s.label} (${s.start}–${s.end})` : slot;
}

export function whenText(b: Pick<BookingDto, 'date' | 'slot'>, slots?: SlotSetting[]): string {
  return `${fullDate(b.date)} · ${slotText(b.slot, slots)}`;
}

export function BookingStatusBadge({ status }: { status: BookingStatus }) {
  const tone =
    status === 'COMPLETED'
      ? 'active'
      : status === 'CONFIRMED'
        ? 'accent'
        : status === 'REQUESTED'
          ? 'neutral'
          : status === 'NOT_DONE'
            ? 'warn'
            : 'muted';
  return (
    <Badge tone={tone} dot={status === 'CONFIRMED' || status === 'COMPLETED'}>
      {LABELS.bookingStatus[status]}
    </Badge>
  );
}

const STEPS: { status: BookingStatus; label: string }[] = [
  { status: 'REQUESTED', label: 'Requested' },
  { status: 'CONFIRMED', label: 'Confirmed' },
  { status: 'COMPLETED', label: 'Washed' },
];

/** Requested → Confirmed → Washed, with times from the booking's events. */
export function BookingTimeline({ booking }: { booking: BookingDto }) {
  const events = booking.events ?? [];
  const ended = booking.status === 'CANCELLED' || booking.status === 'NOT_DONE';
  const at = (s: BookingStatus) => [...events].reverse().find((e) => e.toStatus === s)?.createdAt;
  const reached = (s: BookingStatus) =>
    s === 'REQUESTED' ||
    (s === 'CONFIRMED' && ['CONFIRMED', 'COMPLETED'].includes(booking.status)) ||
    (s === 'COMPLETED' && booking.status === 'COMPLETED');
  return (
    <ol className="flex items-start" aria-label="Booking progress">
      {STEPS.map((step, i) => {
        const on = reached(step.status);
        const when = on ? at(step.status) : undefined;
        return (
          <li key={step.status} className="flex-1 flex flex-col items-center text-center min-w-0">
            <div className="flex items-center w-full">
              <span
                className={cx(
                  'h-[2px] flex-1',
                  i === 0 ? 'invisible' : on ? 'bg-accent' : 'bg-line',
                )}
              />
              <span
                className={cx(
                  'w-6 h-6 shrink-0 rounded-full flex items-center justify-center',
                  on ? 'bg-accent text-white' : 'bg-white border border-line text-muted',
                )}
              >
                {on ? <Check size={13} strokeWidth={3.4} /> : null}
              </span>
              <span
                className={cx(
                  'h-[2px] flex-1',
                  i === STEPS.length - 1
                    ? 'invisible'
                    : reached(STEPS[i + 1].status)
                      ? 'bg-accent'
                      : 'bg-line',
                )}
              />
            </div>
            <span className={cx('mt-1 text-xs font-semibold', on ? 'text-ink' : 'text-muted')}>
              {step.label}
            </span>
            {when ? <span className="text-[11px] text-muted">{dateTime(when)}</span> : null}
          </li>
        );
      })}
      {ended ? <span className="sr-only">{LABELS.bookingStatus[booking.status]}</span> : null}
    </ol>
  );
}

/** Small car / bike icons for the vehicle types a service applies to. */
function AppliesTo({ s }: { s: OneTimeServiceDto }) {
  const cars = s.appliesTo.filter((t) => t !== 'BIKE');
  const bike = s.appliesTo.includes('BIKE');
  return (
    <div className="flex flex-wrap gap-1.5 text-[13px] text-muted">
      {cars.length ? (
        <span className="inline-flex items-center gap-1 bg-canvas rounded-lg px-2 py-1">
          <Car size={15} /> {cars.map((t) => LABELS.vehicleType[t]).join(', ')}
        </span>
      ) : null}
      {bike ? (
        <span className="inline-flex items-center gap-1 bg-canvas rounded-lg px-2 py-1">
          <Bike size={15} /> Bike
        </span>
      ) : null}
    </div>
  );
}

export function ServiceCard({ s, action }: { s: OneTimeServiceDto; action?: ReactNode }) {
  return (
    <Card as="article" className="flex flex-col gap-3.5">
      <div className="flex gap-3 items-start">
        <div className="flex-1 min-w-0">
          <h3 className="text-lg font-semibold leading-tight">{s.name}</h3>
          <div className="text-[13px] text-muted inline-flex items-center gap-1 mt-0.5">
            <Clock size={14} /> About {s.durationMinutes} min · One-time
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className="text-[11px] text-muted">from</div>
          <div className="font-bold">{s.fromPrice > 0 ? money(s.fromPrice) : 'Ask us'}</div>
        </div>
      </div>
      {s.description ? <p className="text-[14px] text-muted -mt-1">{s.description}</p> : null}
      {s.includes.length ? (
        <ul className="flex flex-col gap-1.5 text-[15px]">
          {s.includes.map((i) => (
            <li key={i} className="flex gap-2.5">
              <Check size={20} strokeWidth={2.4} className="text-accent-ink shrink-0" />
              {i}
            </li>
          ))}
        </ul>
      ) : null}
      <AppliesTo s={s} />
      {action}
    </Card>
  );
}

export type PlanKind = 'monthly' | 'one-time';

/** Monthly plans | One-time wash, remembered in the URL hash (#one-time). */
export function usePlanKind(): [PlanKind, (k: PlanKind) => void] {
  const location = useLocation();
  const navigate = useNavigate();
  const fromHash = (): PlanKind => (location.hash === '#one-time' ? 'one-time' : 'monthly');
  const [kind, setKind] = useState<PlanKind>(fromHash);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => setKind(fromHash()), [location.hash]);
  return [
    kind,
    (k) => {
      setKind(k);
      navigate(
        {
          pathname: location.pathname,
          search: location.search,
          hash: k === 'one-time' ? '#one-time' : '',
        },
        { replace: true, preventScrollReset: true },
      );
    },
  ];
}

export function PlanKindToggle({
  value,
  onChange,
}: {
  value: PlanKind;
  onChange: (k: PlanKind) => void;
}) {
  const options: { k: PlanKind; label: string }[] = [
    { k: 'monthly', label: 'Monthly plans' },
    { k: 'one-time', label: 'One-time wash' },
  ];
  return (
    <div
      role="group"
      aria-label="Plan type"
      className="grid grid-cols-2 gap-1 bg-sand rounded-2xl p-1"
    >
      {options.map((o) => (
        <button
          key={o.k}
          type="button"
          aria-pressed={value === o.k}
          onClick={() => onChange(o.k)}
          className={cx(
            'h-11 rounded-xl text-[15px] font-semibold transition',
            value === o.k ? 'bg-white text-accent-deep shadow-card' : 'text-muted hover:text-ink',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Active one-time services, each with "Book now" (logged-out visitors go via log in). */
export function OneTimeServiceList({ className }: { className?: string }) {
  const q = useOneTimeServices();
  if (q.isLoading) return null;
  const list = q.data ?? [];
  if (!list.length) {
    return (
      <Card>
        <p className="text-[15px] text-muted text-center py-4">
          One-time washes are coming soon. Ask us on WhatsApp in the meantime.
        </p>
      </Card>
    );
  }
  return (
    <div className={cx('grid gap-3', className)}>
      {list.map((s) => (
        <ServiceCard
          key={s.id}
          s={s}
          action={
            <LinkButton to={`/app/book?service=${s.id}`} variant="cta" className="h-12">
              Book now
            </LinkButton>
          }
        />
      ))}
    </div>
  );
}
