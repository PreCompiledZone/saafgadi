import { LABELS, subscriptionRef } from '@shared/enums';
import type {
  BookingDto,
  OneTimeServiceDto,
  SubscriptionDto,
  UserDashboard,
  UserVehicleSummary,
  WashLogDto,
  WasherContact,
} from '@shared/types';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../../api/client';
import { useApi, useApiMutation, useContact, usePublicPlans } from '../../api/hooks';
import { PlanIcon, PlanServices } from '../../components/PlanCard';
import { readDashboardTab, writeDashboardTab } from '../../lib/dashboardTab';
import { EmailVerify } from '../../components/EmailVerify';
import {
  Calendar,
  Car,
  Check,
  ChevronRight,
  Clock,
  Interior,
  Phone,
  Plus,
  Sparkles,
  Wash,
  WhatsApp,
  X,
} from '../../components/icons';
import { BookingStatusBadge, whenText } from '../../components/oneTime';
import {
  AnchorButton,
  Badge,
  Button,
  Card,
  cx,
  Dot,
  FormError,
  LinkButton,
  Progress,
  QueryView,
  Sheet,
  TimelineItem,
  useToast,
} from '../../components/ui';
import { useAuthActions, useSession } from '../../lib/auth';
import { greeting as hiBusiness, telTo, whatsappLink, whatsappTo } from '../../lib/contact';
import {
  dayDate,
  firstName,
  fullDate,
  initials,
  money,
  relativeDay,
  shortDate,
  timeOf,
} from '../../lib/format';

// ------------------------------------------------------------- shared bits

/** Direct line to the assigned washer, for timing and parking questions. */
function WasherCard({ washer, vehicle }: { washer: WasherContact; vehicle: string }) {
  const { user } = useSession();
  const message = `Hi ${firstName(washer.name)}, this is ${user?.name ?? 'your customer'} (${vehicle}).`;
  return (
    <section
      aria-label="Your washer"
      className="bg-white rounded-[20px] p-[18px] shadow-card flex flex-col gap-3.5"
    >
      <div className="flex items-center gap-3">
        <span className="w-12 h-12 shrink-0 rounded-full bg-accent-soft-2 text-accent-deep font-bold flex items-center justify-center">
          {initials(washer.name)}
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[13px] text-muted">Your washer</div>
          <div className="font-display font-semibold text-[17px] truncate">{washer.name}</div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2.5">
        <AnchorButton href={telTo(washer.mobile)} aria-label={`Call ${washer.name}`}>
          <Phone size={18} className="text-accent-ink" />
          Call
        </AnchorButton>
        <AnchorButton
          href={whatsappTo(washer.mobile, message)}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`WhatsApp ${washer.name}`}
        >
          <WhatsApp size={18} className="text-accent-ink" />
          WhatsApp
        </AnchorButton>
      </div>
      <p className="text-[13px] text-muted -mt-1">
        For wash timing or parking. For plans and payments, message us instead.
      </p>
    </section>
  );
}

/** Shown to admin-added customers whose email isn't verified yet. */
function VerifyEmailBanner() {
  const { user } = useSession();
  const { signedIn } = useAuthActions();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  if (!user?.email || user.emailVerified) return null;
  return (
    <>
      <div className="flex items-center gap-3 rounded-[16px] bg-accent-soft text-accent-deep px-4 py-3">
        <span className="flex-1 text-sm font-medium">
          Verify your email to reset your password yourself
        </span>
        <Button size="sm" variant="cta" onClick={() => setOpen(true)}>
          Send code
        </Button>
      </div>
      {open ? (
        <Sheet open onClose={() => setOpen(false)} title="Verify your email">
          <div className="pb-2">
            <EmailVerify
              email={user.email}
              autoSend
              onVerified={async (u) => {
                await signedIn(u);
                setOpen(false);
                toast('Email verified');
              }}
            />
          </div>
        </Sheet>
      ) : null}
    </>
  );
}

function SectionTitle({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <div className="flex justify-between items-center mt-1">
      <h2 className="text-[17px] font-semibold">{title}</h2>
      {action}
    </div>
  );
}

function UpcomingBooking({ b, d }: { b: BookingDto; d: UserDashboard }) {
  return (
    <Link
      to="/app/history?type=one_time&status=upcoming"
      className="no-underline text-ink bg-white rounded-[20px] p-[18px] shadow-card flex items-center gap-3"
    >
      <span className="w-11 h-11 shrink-0 rounded-xl bg-accent-soft text-accent-ink flex items-center justify-center">
        <Calendar size={22} />
      </span>
      <span className="flex-1 min-w-0">
        <span className="block text-[13px] text-muted">Upcoming one-time wash</span>
        <span className="block font-semibold truncate">
          {b.serviceName} · {b.registrationNumber}
        </span>
        <span className="block text-[13px] text-muted">{whenText(b, d.slots)}</span>
      </span>
      <span className="flex flex-col items-end gap-1 shrink-0">
        <BookingStatusBadge status={b.status} />
        <ChevronRight size={18} className="text-muted" />
      </span>
    </Link>
  );
}

// ------------------------------------------------------- pending request

/** "Plan requested – pending activation", with WhatsApp and an in-page cancel. */
function PendingCard({ s, renewal }: { s: SubscriptionDto; renewal?: boolean }) {
  const contact = useContact().data;
  const toast = useToast();
  const [confirming, setConfirming] = useState(false);
  const cancel = useApiMutation(
    () => api.post<SubscriptionDto>(`/subscriptions/${s.id}/cancel`),
    [['me']],
  );
  const ref = subscriptionRef(s.id);
  const wa = whatsappLink(
    contact,
    `${hiBusiness(contact)}, plan request ${ref} for ${s.registrationNumber}`,
  );
  return (
    <section
      aria-label="Plan request"
      className="bg-white rounded-[20px] p-[18px] shadow-card border-2 border-dashed border-accent-line flex flex-col gap-3"
    >
      <div className="flex items-start gap-3">
        <span className="w-10 h-10 shrink-0 rounded-xl bg-warn-soft text-warn-ink flex items-center justify-center">
          <Clock size={20} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-[17px] font-semibold leading-tight">
            {renewal ? 'Renewal requested' : 'Plan requested'} – pending activation
          </h2>
          <div className="text-[13px] text-muted">
            {ref} · requested {shortDate(s.createdAt.slice(0, 10))}
          </div>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2 text-sm">
        {[
          ['Plan', s.planName.replace(/ plan$/i, '')],
          ['Months', String(s.months)],
          ['Total', money(s.totalAmount)],
        ].map(([k, v]) => (
          <div key={k} className="bg-canvas rounded-xl p-2.5 min-w-0">
            <div className="text-xs text-muted">{k}</div>
            <div className="font-semibold truncate">{v}</div>
          </div>
        ))}
      </div>
      <p className="text-[13px] text-muted">
        {s.registrationNumber} · from {fullDate(s.startDate)}. Pay by cash or UPI and we’ll activate
        it.
      </p>
      {wa ? (
        <AnchorButton href={wa} target="_blank" rel="noopener noreferrer" variant="cta">
          <WhatsApp size={18} /> Message us on WhatsApp
        </AnchorButton>
      ) : null}
      <FormError error={cancel.error} />
      {confirming ? (
        <div className="flex items-center justify-between gap-2 bg-canvas rounded-xl px-3 py-2">
          <span className="text-sm">Cancel this request?</span>
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
              Keep it
            </Button>
            <Button
              size="sm"
              variant="danger"
              loading={cancel.isPending}
              onClick={async () => {
                try {
                  await cancel.mutateAsync(undefined);
                  toast(`${ref} cancelled`);
                } catch {
                  /* shown */
                }
              }}
            >
              Yes, cancel
            </Button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          className="self-center text-sm font-semibold text-muted underline underline-offset-4 py-1"
          onClick={() => setConfirming(true)}
        >
          Cancel request
        </button>
      )}
    </section>
  );
}

// ------------------------------------------------------------- plan view

function PlanBadge({ s, window }: { s: SubscriptionDto; window: number }) {
  if (s.displayStatus === 'UPCOMING')
    return <Badge tone="accent">Starts {shortDate(s.startDate)}</Badge>;
  if (s.displayStatus === 'EXPIRED') return <Badge tone="danger">Expired</Badge>;
  if (s.daysLeft <= window)
    return (
      <Badge tone="warn" dot>
        Ends soon
      </Badge>
    );
  return (
    <Badge tone="active" dot>
      Active
    </Badge>
  );
}

function TodayStrip({ v, today }: { v: UserVehicleSummary; today: string }) {
  const t = v.todayStatus;
  if (!t) return null;
  const base = 'rounded-[14px] px-3.5 py-3 text-[15px] flex items-center gap-2.5';
  switch (t.kind) {
    case 'WASHED':
      return (
        <div className={cx(base, 'bg-cta text-ink')}>
          <Check size={18} strokeWidth={3} className="shrink-0" />
          <span>
            <b>Washed today at {timeOf(t.at)}</b> by {t.washerFirstName}
            <span className="block text-[13px]">{t.activityName}</span>
          </span>
        </div>
      );
    case 'MISSED':
      return (
        <div className={cx(base, 'bg-warn-soft text-warn-ink')}>
          <X size={18} strokeWidth={3} className="shrink-0" />
          <span>
            <b>Missed today</b>
            {t.reason ? ` – ${t.reason}` : ''}
          </span>
        </div>
      );
    case 'DUE':
      return (
        <div className={cx(base, 'bg-accent-soft text-accent-deep')}>
          <Wash size={18} className="shrink-0" />
          <b>Due today</b>
        </div>
      );
    case 'NOT_DUE':
      return (
        <div className={cx(base, 'bg-canvas text-ink')}>
          <Calendar size={18} className="shrink-0 text-muted" />
          <span>
            Not due today
            {t.next ? ` – next wash ${relativeDay(t.next, today).toLowerCase()}` : ''}
          </span>
        </div>
      );
    case 'STARTS':
      return (
        <div className={cx(base, 'bg-accent-soft text-accent-deep')}>
          <Calendar size={18} className="shrink-0" />
          <span>
            Your plan starts on <b>{fullDate(t.date)}</b>
          </span>
        </div>
      );
  }
}

function PlanCard({ v, d }: { v: UserVehicleSummary; d: UserDashboard }) {
  const s = v.subscription!;
  return (
    <section
      aria-label="Your plan"
      className="bg-white rounded-[20px] p-[18px] shadow-float flex flex-col gap-3.5"
    >
      <div className="flex justify-between items-start gap-2">
        <div className="min-w-0">
          <h2 className="text-[19px] font-semibold leading-tight">{s.planName}</h2>
          <div className="text-[13px] text-muted">
            <span className="plate font-semibold text-ink">{v.vehicle.registrationNumber}</span> ·{' '}
            {v.vehicle.make} {v.vehicle.model}
          </div>
        </div>
        <PlanBadge s={s} window={d.renewWindowDays} />
      </div>
      <TodayStrip v={v} today={d.today} />
      {v.progress.length ? (
        <div className="flex flex-col gap-3">
          {v.progress.map((p) => (
            <div key={p.activityId} className="flex flex-col gap-1.5">
              <div className="flex justify-between text-[15px] gap-3">
                <span>
                  {p.name}
                  {p.behindSchedule ? (
                    <span className="ml-2 text-xs font-semibold text-danger">Behind schedule</span>
                  ) : null}
                </span>
                <span className="shrink-0">
                  <b>{p.used}</b> of {p.quota}
                </span>
              </div>
              <Progress value={p.used} max={p.quota} label={`${p.name}: ${p.used} of ${p.quota}`} />
            </div>
          ))}
        </div>
      ) : null}
      <div className="grid grid-cols-2 gap-2 text-sm">
        <div className="bg-canvas rounded-xl p-2.5 min-w-0">
          <div className="text-xs text-muted">Next wash</div>
          <div className="font-semibold truncate">
            {v.nextWashDate ? relativeDay(v.nextWashDate, d.today) : '—'}
          </div>
        </div>
        <div className="bg-canvas rounded-xl p-2.5 min-w-0">
          <div className="text-xs text-muted">Plan ends</div>
          <div className="font-semibold truncate">
            {shortDate(s.endDate)} · {Math.max(0, s.daysLeft)} {s.daysLeft === 1 ? 'day' : 'days'}
          </div>
        </div>
      </div>
      {v.canRenew ? (
        <LinkButton to={`/app/plans/${s.planId}/book?renew=${s.id}`} variant="cta">
          Renew plan
        </LinkButton>
      ) : null}
    </section>
  );
}

function RecentWashes({ v, today }: { v: UserVehicleSummary; today: string }) {
  if (!v.recent.length) return null;
  return (
    <Card className="rounded-[20px]">
      <SectionTitle
        title="Recent washes"
        action={
          <Link
            to={`/app/history?type=monthly&reg=${encodeURIComponent(v.vehicle.registrationNumber)}&range=any`}
            className="text-sm font-semibold no-underline py-2"
          >
            See all
          </Link>
        }
      />
      <div className="mt-2 flex flex-col">
        {v.recent.map((l: WashLogDto) => (
          <div
            key={l.id}
            className="flex items-center gap-3 py-2.5 dotted-top first:border-t-0 first:pt-1"
          >
            {l.status === 'DONE' ? (
              <Dot>
                <Check size={13} strokeWidth={3.4} />
              </Dot>
            ) : (
              <Dot tone="warn">
                <X size={13} strokeWidth={3} />
              </Dot>
            )}
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-[15px] truncate">{l.activityName}</div>
              <div className="text-[13px] text-muted">
                {relativeDay(l.serviceDate, today)} ·{' '}
                {l.status === 'DONE'
                  ? timeOf(l.performedAt)
                  : l.reason
                    ? LABELS.reason[l.reason]
                    : 'Not done'}
              </div>
            </div>
            <Badge tone={l.status === 'DONE' ? 'active' : 'warn'}>
              {l.status === 'DONE' ? 'Washed' : 'Missed'}
            </Badge>
          </div>
        ))}
      </div>
    </Card>
  );
}

function ExtraWashCard({ d, onBook }: { d: UserDashboard; onBook: () => void }) {
  if (!d.oneTimeServices.length) return null;
  return (
    <section className="rounded-[20px] border-2 border-dashed border-line-strong px-4 py-3.5 flex items-center gap-3">
      <span className="flex-1 text-[15px]">
        <b className="font-semibold">Need an extra wash?</b>
        <span className="block text-[13px] text-muted">
          Book a one-time wash
          {d.lowestOneTimePrice ? ` from ${money(d.lowestOneTimePrice)}` : ''}
        </span>
      </span>
      <Button variant="cta" size="sm" onClick={onBook}>
        Book
      </Button>
    </section>
  );
}

/** Vehicles with an ACTIVE (not ended) plan or a pending request. */
function planVehicles(d: UserDashboard) {
  return d.vehicles.filter(
    (v) => v.pending || (v.subscription?.status === 'ACTIVE' && v.subscription.endDate >= d.today),
  );
}

/** Plan card(s) and/or pending requests, with a switcher for 2+ vehicles. */
function PlanView({ d, onExtraWash }: { d: UserDashboard; onExtraWash: (id: number) => void }) {
  const list = planVehicles(d);
  const firstActive = list.find((v) => v.subscription?.status === 'ACTIVE') ?? list[0];
  const [selected, setSelected] = useState<number>(firstActive.vehicle.id);
  const v = list.find((x) => x.vehicle.id === selected) ?? firstActive;
  const active = v.subscription?.status === 'ACTIVE' && v.subscription.endDate >= d.today;
  const booking = d.upcomingBookings[0];
  return (
    <>
      {list.length > 1 ? (
        <div
          className="flex gap-2 overflow-x-auto -mx-5 px-5 pb-1"
          role="group"
          aria-label="Your vehicles"
        >
          {list.map((x) => (
            <button
              key={x.vehicle.id}
              type="button"
              aria-pressed={x === v}
              onClick={() => setSelected(x.vehicle.id)}
              className={cx(
                'shrink-0 rounded-xl px-3 py-2 text-sm border',
                x === v ? 'bg-white border-ink font-semibold' : 'border-line text-muted',
              )}
            >
              <span className="font-bold plate">{x.vehicle.registrationNumber}</span> ·{' '}
              {LABELS.category[x.vehicle.category]}
            </button>
          ))}
        </div>
      ) : null}
      {active ? <PlanCard v={v} d={d} /> : null}
      {v.pending ? <PendingCard s={v.pending} renewal={active} /> : null}
      {booking ? <UpcomingBooking b={booking} d={d} /> : null}
      {active ? <RecentWashes v={v} today={d.today} /> : null}
      {active && v.washer ? (
        <WasherCard washer={v.washer} vehicle={v.vehicle.registrationNumber} />
      ) : null}
      {active ? <ExtraWashCard d={d} onBook={() => onExtraWash(v.vehicle.id)} /> : null}
    </>
  );
}

function AddVehicleCard() {
  return (
    <Card className="rounded-[20px] flex items-center gap-3">
      <span className="w-10 h-10 shrink-0 rounded-xl bg-accent-soft text-accent-ink flex items-center justify-center">
        <Car size={22} />
      </span>
      <span className="flex-1 text-[15px] font-semibold">
        Add your vehicle to book a monthly plan
      </span>
      <LinkButton to="/app/vehicles?add=1" size="sm">
        <Plus size={16} /> Add vehicle
      </LinkButton>
    </Card>
  );
}

/** Monthly tab without a plan: the plans, each with "Request plan". Never empty. */
function NoPlanMonthly({ d }: { d: UserDashboard }) {
  const plans = usePublicPlans();
  return (
    <>
      {!d.vehicles.length ? <AddVehicleCard /> : null}
      <SectionTitle
        title="Monthly plans"
        action={
          <Link to="/app/plans" className="text-sm font-semibold no-underline py-2">
            See all
          </Link>
        }
      />
      {(plans.data ?? []).map((p) => {
        const priced = p.prices.filter((x) => x.isActive && x.monthlyPrice > 0);
        const from = priced.length ? Math.min(...priced.map((x) => x.monthlyPrice)) : null;
        return (
          <Card key={p.id} as="article" className="flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <PlanIcon plan={p} />
              <div className="flex-1 min-w-0">
                <h3 className="text-lg font-semibold leading-tight">{p.name}</h3>
                <div className="text-[13px] text-muted">Monthly plan</div>
              </div>
              {from ? (
                <div className="text-right shrink-0">
                  <div className="text-[11px] text-muted">from</div>
                  <div className="font-bold">{money(from)}/month</div>
                </div>
              ) : null}
            </div>
            <PlanServices plan={p} className="pl-14" />
            <LinkButton to={`/app/plans/${p.id}/book`} variant="cta">
              Request plan
            </LinkButton>
          </Card>
        );
      })}
    </>
  );
}

// ---------------------------------------------------------- one-time tab

function serviceIcon(s: OneTimeServiceDto) {
  return /interior/i.test(s.name) ? <Interior size={22} /> : <Wash size={22} />;
}

const bookLink = (params: { service?: number; vehicle?: number | null }) => {
  const q = new URLSearchParams();
  if (params.service) q.set('service', String(params.service));
  if (params.vehicle) q.set('vehicle', String(params.vehicle));
  const s = q.toString();
  return `/app/book${s ? `?${s}` : ''}`;
};

function Hero({ d, vehicleId }: { d: UserDashboard; vehicleId: number | null }) {
  const planUser = d.state === 'active';
  return (
    <section className="relative overflow-hidden rounded-[24px] p-5 text-white bg-linear-to-br from-accent to-accent-deep shadow-float">
      <Sparkles
        size={84}
        strokeWidth={1.4}
        aria-hidden="true"
        className="absolute -right-3 -top-3 text-cta opacity-70"
      />
      <span className="inline-block bg-cta text-ink text-xs font-bold rounded-full px-2.5 py-1">
        No subscription needed
      </span>
      <h2 className="mt-3 text-[24px] font-bold leading-tight max-w-[90%]">
        {planUser ? 'Book a wash for another vehicle or an extra wash' : 'Need a quick shine?'}
      </h2>
      <p className="mt-1.5 text-[15px] text-white/85 max-w-xs">
        Book a one-time wash at your parking. Just tell us your vehicle while booking.
      </p>
      {d.lowestOneTimePrice ? (
        <p className="mt-3 text-[15px]">
          from <b className="font-display text-[22px]">{money(d.lowestOneTimePrice)}</b> per wash
        </p>
      ) : null}
      <ul className="mt-3 flex flex-col gap-1.5 text-[15px]">
        {['Doorstep foam wash', 'Pay after confirmation'].map((p) => (
          <li key={p} className="flex items-center gap-2">
            <span className="w-5 h-5 rounded-full bg-cta text-ink flex items-center justify-center">
              <Check size={12} strokeWidth={3.4} />
            </span>
            {p}
          </li>
        ))}
      </ul>
      <LinkButton
        to={bookLink({ vehicle: vehicleId })}
        variant="cta"
        size="lg"
        className="mt-4 w-full"
      >
        Book a one-time wash
      </LinkButton>
    </section>
  );
}

function OneTimeTab({ d, vehicleId }: { d: UserDashboard; vehicleId: number | null }) {
  const services = d.oneTimeServices;
  const [picked, setPicked] = useState<number | null>(services[0]?.id ?? null);
  const selected = services.find((s) => s.id === picked) ?? services[0];
  return (
    <>
      {d.upcomingBookings.map((b) => (
        <UpcomingBooking key={b.id} b={b} d={d} />
      ))}
      {services.length ? (
        <>
          <Hero d={d} vehicleId={vehicleId} />
          <SectionTitle
            title="Pick a wash"
            action={
              <Link to="/app/plans#one-time" className="text-sm font-semibold no-underline py-2">
                See all
              </Link>
            }
          />
          <div className="grid grid-cols-3 gap-2" role="group" aria-label="One-time washes">
            {services.map((s) => {
              const on = s.id === selected?.id;
              return (
                <button
                  key={s.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setPicked(s.id)}
                  className={cx(
                    'flex flex-col items-start gap-1.5 rounded-2xl bg-white p-3 text-left min-w-0',
                    on ? 'border-2 border-accent' : 'border border-line',
                  )}
                >
                  <span
                    className={cx(
                      'w-9 h-9 rounded-[10px] flex items-center justify-center text-accent-ink',
                      on ? 'bg-accent-soft' : 'bg-canvas',
                    )}
                  >
                    {serviceIcon(s)}
                  </span>
                  <span className="font-semibold text-sm leading-tight">{s.name}</span>
                  <span className="text-xs text-muted">{s.durationMinutes} min</span>
                  <span className="text-sm font-bold">{money(s.fromPrice)}</span>
                </button>
              );
            })}
          </div>
          <Card className="rounded-[20px]">
            <h2 className="text-[17px] font-semibold mb-3">How booking works</h2>
            <div className="dotted-top pt-4 flex flex-col">
              {[
                'Pick a wash and a time slot',
                'Add your vehicle while booking',
                'We confirm, you pay cash or UPI',
              ].map((t, i, all) => (
                <TimelineItem
                  key={t}
                  last={i === all.length - 1}
                  marker={
                    <Dot>
                      <span className="text-[13px] font-bold">{i + 1}</span>
                    </Dot>
                  }
                >
                  <div className="font-semibold">{t}</div>
                </TimelineItem>
              ))}
            </div>
          </Card>
        </>
      ) : (
        <Card>
          <p className="text-[15px] text-muted text-center py-4">
            One-time washes are coming soon. Ask us on WhatsApp in the meantime.
          </p>
        </Card>
      )}
      {d.state === 'none' ? (
        <>
          {!d.vehicles.length ? <AddVehicleCard /> : null}
          <section className="rounded-[20px] bg-accent-soft px-4 py-4 flex items-center gap-3">
            <span className="flex-1 text-[15px] text-accent-deep">
              <b className="font-semibold">Want it every other day?</b>
              <span className="block text-[13px]">
                Monthly plans
                {d.lowestMonthlyPrice ? ` from ${money(d.lowestMonthlyPrice)}/month` : ''}
              </span>
            </span>
            <LinkButton to="/app/plans" size="sm" variant="outline">
              See plans
            </LinkButton>
          </section>
        </>
      ) : null}
      {selected ? (
        <>
          {/* Room for the sticky bar above the bottom navigation. */}
          <div className="h-16" aria-hidden="true" />
          <div
            className="fixed inset-x-0 z-30 px-4 pointer-events-none"
            style={{ bottom: 'calc(max(16px, env(safe-area-inset-bottom)) + 76px)' }}
          >
            <div className="pointer-events-auto mx-auto max-w-lg flex items-center gap-3 bg-ink text-white rounded-[18px] pl-4 pr-2 py-2 shadow-nav">
              <span className="flex-1 min-w-0 text-sm truncate">
                Selected: <b>{selected.name}</b>
              </span>
              <LinkButton
                to={bookLink({ service: selected.id, vehicle: vehicleId })}
                variant="cta"
                size="sm"
              >
                Book now
              </LinkButton>
            </div>
          </div>
        </>
      ) : null}
    </>
  );
}

// ------------------------------------------------------------------ page

type Tab = 'monthly' | 'one-time';
const isTab = (v: string | null): v is Tab => v === 'monthly' || v === 'one-time';

function Tabs({
  value,
  badges,
  onChange,
}: {
  value: Tab;
  badges: UserDashboard['badges'];
  onChange: (t: Tab) => void;
}) {
  const options: { t: Tab; label: string; dot: boolean }[] = [
    { t: 'monthly', label: 'Monthly', dot: badges.monthly },
    { t: 'one-time', label: 'One-time', dot: badges.oneTime },
  ];
  return (
    <div
      role="group"
      aria-label="Dashboard"
      className="grid grid-cols-2 gap-1 bg-sand rounded-2xl p-1"
    >
      {options.map((o) => {
        const on = value === o.t;
        return (
          <button
            key={o.t}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(o.t)}
            className={cx(
              'h-11 rounded-xl text-[15px] font-semibold transition inline-flex items-center justify-center gap-1.5',
              on ? 'bg-white text-accent-deep shadow-card' : 'text-muted hover:text-ink',
            )}
          >
            {o.label}
            {!on && o.dot ? (
              <>
                <span className="w-2 h-2 rounded-full bg-accent" aria-hidden="true" />
                <span className="sr-only">(has updates)</span>
              </>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

export function Dashboard() {
  const q = useApi<UserDashboard>(['me', 'dashboard'], '/me/dashboard');
  const [params, setParams] = useSearchParams();
  const deepLink = params.get('tab');
  // ?tab= (e.g. from a WhatsApp link) wins, then this session's choice, then the server's default.
  const [chosen, setChosen] = useState<Tab | null>(() =>
    isTab(deepLink) ? deepLink : readDashboardTab(),
  );
  const [extraVehicle, setExtraVehicle] = useState<number | null>(null);
  const choose = (t: Tab) => {
    setChosen(t);
    writeDashboardTab(t);
    if (deepLink) {
      const next = new URLSearchParams(params);
      next.delete('tab');
      setParams(next, { replace: true });
    }
  };
  return (
    <QueryView query={q}>
      {(d) => {
        const tab: Tab = chosen ?? d.defaultTab;
        return (
          <div className="flex flex-col gap-3.5 pt-1">
            <div>
              <div className="text-sm text-muted">Good {d.greeting}</div>
              <h1 className="mt-0.5 text-[27px] font-bold tracking-[-0.5px]">
                Hi, {firstName(d.name)}
              </h1>
            </div>
            <Tabs value={tab} badges={d.badges} onChange={choose} />
            <VerifyEmailBanner />
            {tab === 'monthly' ? (
              planVehicles(d).length ? (
                <PlanView
                  d={d}
                  onExtraWash={(id) => {
                    setExtraVehicle(id);
                    choose('one-time');
                    window.scrollTo({ top: 0 });
                  }}
                />
              ) : (
                <NoPlanMonthly d={d} />
              )
            ) : (
              <OneTimeTab d={d} vehicleId={extraVehicle} />
            )}
            <p className="text-center text-[13px] text-muted">{dayDate(d.today)}</p>
          </div>
        );
      }}
    </QueryView>
  );
}
