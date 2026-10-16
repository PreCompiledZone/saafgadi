import { LABELS } from '@shared/enums';
import type {
  ActivityProgress,
  UserDashboard,
  UserVehicleSummary,
  WashLogDto,
  WasherContact,
} from '@shared/types';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useApi, useContact } from '../../api/hooks';
import { Calendar, Car, Check, Phone, Plus, WhatsApp, X } from '../../components/icons';
import { StatusBadge } from '../../components/status';
import {
  AnchorButton,
  Button,
  Card,
  cx,
  Dot,
  EmptyState,
  LinkButton,
  Notice,
  Plate,
  Progress,
  QueryView,
  Sheet,
  Tag,
  TimelineItem,
  useToast,
} from '../../components/ui';
import { callLink, customerHelpMessage, telTo, whatsappLink, whatsappTo } from '../../lib/contact';
import { ContactButtons } from '../../components/contact';
import {
  firstName,
  fullDate,
  initials,
  longDate,
  relativeDay,
  shortDate,
  timeOf,
} from '../../lib/format';
import { useAuthActions, useSession } from '../../lib/auth';
import { EmailVerify } from '../../components/EmailVerify';

export function WashTimeline({
  logs,
  today,
  showVehicle,
}: {
  logs: WashLogDto[];
  today: string;
  showVehicle?: boolean;
}) {
  return (
    <div className="dotted-top pt-4 flex flex-col">
      {logs.map((l, i) => (
        <TimelineItem
          key={l.id}
          last={i === logs.length - 1}
          marker={
            l.status === 'DONE' ? (
              <Dot>
                <Check size={13} strokeWidth={3.4} />
              </Dot>
            ) : (
              <Dot tone="warn">
                <X size={13} strokeWidth={3} />
              </Dot>
            )
          }
        >
          <div className="font-semibold">
            {l.status === 'DONE' ? l.activityName : `Not done · ${l.activityName}`}{' '}
            {l.isCatchUp ? <Tag>Catch-up</Tag> : null}
          </div>
          <div className="text-[13px] text-muted">
            {relativeDay(l.serviceDate, today)}, {timeOf(l.performedAt)}
            {l.status === 'NOT_DONE' && l.reason
              ? ` · ${LABELS.reason[l.reason]}`
              : ` · ${l.washerName}`}
            {showVehicle ? ` · ${l.registrationNumber}` : ''}
          </div>
        </TimelineItem>
      ))}
    </div>
  );
}

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

function nextWashText(p: ActivityProgress, today: string): string | null {
  if (p.state === 'COMPLETE') {
    return p.resetDate
      ? `All ${p.quota} done this month — next on ${shortDate(p.resetDate)}`
      : `All ${p.quota} done for this plan`;
  }
  if (!p.nextDueDate) return null;
  const name = p.name.toLowerCase();
  if (p.nextDueDate === today) return `Next ${name}: due today`;
  const when = relativeDay(p.nextDueDate, today);
  return `Next ${name}: ${when === 'Tomorrow' ? 'tomorrow' : when}`;
}

function VehicleSummary({ v, today }: { v: UserVehicleSummary; today: string }) {
  const s = v.subscription;
  const current = s && (v.displayStatus === 'ACTIVE' || v.displayStatus === 'EXPIRING') ? s : null;
  const rhythm = v.progress.find((p) => p.minGapDays >= 2) ?? v.progress[0];
  const resetDate = v.progress.find((p) => p.resetDate)?.resetDate;
  const label = [
    v.vehicle.make + ' ' + v.vehicle.model,
    LABELS.vehicleType[v.vehicle.vehicleType],
    v.vehicle.color,
  ].join(' · ');

  return (
    <>
      <section className="bg-white rounded-[20px] p-[18px] shadow-float flex flex-col gap-3.5">
        <div className="flex justify-between items-center gap-2">
          <Plate>{v.vehicle.registrationNumber}</Plate>
          {v.displayStatus === 'NO_PLAN' ? (
            <StatusBadge status="NO_PLAN" />
          ) : (
            <StatusBadge status={v.displayStatus} daysLeft={current?.daysLeft} />
          )}
        </div>
        <div className="text-sm text-muted">{label}</div>
        {s ? (
          <div className="grid grid-cols-3 gap-2">
            {[
              ['Plan', s.planName.replace(/ plan$/i, '')],
              [
                v.displayStatus === 'EXPIRED' || v.displayStatus === 'CANCELLED'
                  ? 'Ended'
                  : 'Valid till',
                shortDate(s.endDate),
              ],
              ['Washer', s.assignedWasherName ? firstName(s.assignedWasherName) : 'Assigning'],
            ].map(([k, val]) => (
              <div key={k} className="bg-canvas rounded-xl p-2.5 min-w-0">
                <div className="text-xs text-muted">{k}</div>
                <div className="font-semibold text-sm truncate">{val}</div>
              </div>
            ))}
          </div>
        ) : null}
        {v.upcoming ? (
          <Notice icon={<Calendar size={18} />}>
            Renewed: {v.upcoming.planName} from {fullDate(v.upcoming.startDate)}
          </Notice>
        ) : null}
        {!current ? (
          <div className="flex flex-col gap-2.5">
            <p className="text-[15px] text-muted">
              {v.displayStatus === 'NO_PLAN'
                ? 'No plan yet. Pick one and we’ll start washing once it’s activated.'
                : v.displayStatus === 'UPCOMING'
                  ? `Your plan starts on ${fullDate(v.upcoming?.startDate ?? s?.startDate)}.`
                  : 'Your plan has ended. Renew to keep your vehicle shining.'}
            </p>
            {v.displayStatus !== 'UPCOMING' ? (
              <LinkButton to={`/app/plans?vehicle=${v.vehicle.id}`} variant="cta">
                {v.displayStatus === 'NO_PLAN' ? 'Choose a plan' : 'Renew my plan'}
              </LinkButton>
            ) : null}
          </div>
        ) : null}
      </section>

      {current && v.progress.length ? (
        <section className="bg-white rounded-[20px] p-[18px] shadow-card flex flex-col gap-4">
          <div className="flex justify-between items-baseline">
            <h2 className="text-[17px] font-semibold">This month</h2>
            {resetDate ? (
              <span className="text-[13px] text-muted">Resets {shortDate(resetDate)}</span>
            ) : null}
          </div>
          {v.progress.map((p) => (
            <div key={p.activityId} className="flex flex-col gap-2">
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
          {rhythm && nextWashText(rhythm, today) ? (
            <Notice icon={<Calendar size={18} />}>{nextWashText(rhythm, today)}</Notice>
          ) : null}
        </section>
      ) : null}

      {v.washer ? <WasherCard washer={v.washer} vehicle={v.vehicle.registrationNumber} /> : null}

      {v.recent.length ? (
        <Card className="rounded-[20px]">
          <div className="flex justify-between items-center mb-3">
            <h2 className="text-[17px] font-semibold">Recent washes</h2>
            <Link
              to={`/app/history?vehicle=${v.vehicle.id}`}
              className="text-sm font-semibold no-underline py-2"
            >
              See all
            </Link>
          </div>
          <WashTimeline logs={v.recent} today={today} />
        </Card>
      ) : null}

      {current ? (
        <LinkButton to={`/app/plans?vehicle=${v.vehicle.id}&change=1`}>Change plan</LinkButton>
      ) : null}
    </>
  );
}

/** WhatsApp and Call us, always visible to customers. */
function HelpCard({ registration }: { registration?: string }) {
  const contact = useContact().data;
  if (!whatsappLink(contact) && !callLink(contact)) return null;
  return (
    <Card className="rounded-[20px] flex flex-col gap-3">
      <h2 className="text-[17px] font-semibold">Need help?</h2>
      <ContactButtons
        message={customerHelpMessage(contact, registration)}
        labels={{ whatsapp: 'WhatsApp us', call: 'Call us' }}
      />
    </Card>
  );
}

/** Shown while the customer's email is unverified; the code is entered in a sheet. */
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

export function Dashboard() {
  const q = useApi<UserDashboard>(['me', 'dashboard'], '/me/dashboard');
  const [selected, setSelected] = useState<number | null>(null);
  return (
    <QueryView query={q}>
      {(d) => {
        const v = d.vehicles.find((x) => x.vehicle.id === selected) ?? d.vehicles[0];
        return (
          <div className="flex flex-col gap-3.5 pt-1">
            <div>
              <div className="text-sm text-muted">{longDate(d.today)}</div>
              <h1 className="mt-0.5 text-[27px] font-bold tracking-[-0.5px]">
                Hi {firstName(d.name)}
              </h1>
            </div>
            <VerifyEmailBanner />
            {d.vehicles.length > 1 ? (
              <div
                className="flex gap-2 overflow-x-auto -mx-5 px-5 pb-1"
                role="tablist"
                aria-label="Your vehicles"
              >
                {d.vehicles.map((x) => (
                  <button
                    key={x.vehicle.id}
                    type="button"
                    role="tab"
                    aria-selected={x === v}
                    onClick={() => setSelected(x.vehicle.id)}
                    className={cx(
                      'shrink-0 rounded-xl px-3 py-2 text-sm font-bold plate border',
                      x === v ? 'bg-white border-ink' : 'bg-transparent border-line text-muted',
                    )}
                  >
                    {x.vehicle.registrationNumber}
                  </button>
                ))}
              </div>
            ) : null}
            {v ? (
              <VehicleSummary key={v.vehicle.id} v={v} today={d.today} />
            ) : (
              <Card>
                <EmptyState
                  icon={<Car size={24} />}
                  title="Add your vehicle"
                  action={
                    <LinkButton to="/app/vehicles?add=1" variant="cta">
                      <Plus size={18} /> Add vehicle
                    </LinkButton>
                  }
                >
                  Tell us your car or bike and where it’s parked, then pick a plan.
                </EmptyState>
              </Card>
            )}
            <HelpCard
              registration={
                d.vehicles.find(
                  (x) => x.displayStatus === 'ACTIVE' || x.displayStatus === 'EXPIRING',
                )?.vehicle.registrationNumber
              }
            />
          </div>
        );
      }}
    </QueryView>
  );
}
