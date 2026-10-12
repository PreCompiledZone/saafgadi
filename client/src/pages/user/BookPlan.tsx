import { LABELS } from '@shared/enums';
import type { EnquiryDto, VehicleDto } from '@shared/types';
import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../../api/client';
import { useApi, useApiMutation, useContact, usePublicPlans } from '../../api/hooks';
import { Check, ChevronLeft, ChevronRight, Message, Phone, WhatsApp } from '../../components/icons';
import { priceText } from '../../components/PlanCard';
import {
  Card,
  EmptyState,
  FormError,
  FullPageSpinner,
  LinkButton,
  Notice,
  Switch,
} from '../../components/ui';
import { bookingMessage, callLink, whatsappLink, greeting } from '../../lib/contact';
import { useSession } from '../../lib/auth';

function OptionRow({
  icon,
  title,
  sub,
  href,
  onClick,
  external,
}: {
  icon: React.ReactNode;
  title: string;
  sub: string;
  href?: string;
  onClick: () => void;
  external?: boolean;
}) {
  const body = (
    <>
      <span className="w-10 h-10 shrink-0 rounded-full bg-accent-soft text-accent-ink flex items-center justify-center">
        {icon}
      </span>
      <span className="flex-1 min-w-0">
        <span className="block font-semibold">{title}</span>
        <span className="block text-[13px] text-muted">{sub}</span>
      </span>
      <ChevronRight size={20} className="text-muted" />
    </>
  );
  const cls =
    'flex items-center gap-3.5 px-4 py-3.5 rounded-2xl bg-white border border-line text-ink no-underline text-left w-full hover:border-line-strong';
  return href ? (
    <a
      href={href}
      target={external ? '_blank' : undefined}
      rel={external ? 'noopener noreferrer' : undefined}
      onClick={onClick}
      className={cls}
    >
      {body}
    </a>
  ) : (
    <button type="button" onClick={onClick} className={cls}>
      {body}
    </button>
  );
}

export function BookPlan() {
  const { planId } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const plans = usePublicPlans();
  const vehicles = useApi<VehicleDto[]>(['me', 'vehicles'], '/me/vehicles');
  const contact = useContact().data;
  const { user } = useSession();
  const [asap, setAsap] = useState(true);
  const [sent, setSent] = useState<EnquiryDto | null>(null);
  const change = params.get('change') === '1';
  const enquire = useApiMutation(
    (body: { type: string; vehicleId?: number; planId: number; message: string }) =>
      api.post<EnquiryDto>('/me/enquiries', body),
    [['me', 'enquiries'], ['admin']],
  );

  if (plans.isLoading || vehicles.isLoading) return <FullPageSpinner />;
  const plan = plans.data?.find((p) => p.id === Number(planId));
  if (!plan) {
    return (
      <EmptyState
        title="Plan not found"
        action={<LinkButton to="/app/plans">See plans</LinkButton>}
      />
    );
  }
  const eligible = (vehicles.data ?? []).filter(
    (v) => v.isActive && v.category === plan.vehicleCategory,
  );
  const vehicle = eligible.find((v) => v.id === Number(params.get('vehicle'))) ?? eligible[0];
  const shortName = plan.name.replace(/ plan$/i, '');

  if (!vehicle) {
    return (
      <div className="pt-1">
        <EmptyState
          title={`Add a ${plan.vehicleCategory === 'CAR' ? 'car' : 'bike'} first`}
          action={
            <LinkButton to="/app/vehicles?add=1" variant="cta">
              Add vehicle
            </LinkButton>
          }
        >
          {plan.name} is for {plan.vehicleCategory === 'CAR' ? 'cars' : 'bikes'}.
        </EmptyState>
      </div>
    );
  }

  const price = plan.prices.find((p) => p.vehicleType === vehicle.vehicleType && p.isActive);
  const start = asap ? 'As soon as possible' : 'I’ll tell you a start date';
  const message = bookingMessage({
    contact,
    intro: `${greeting(contact)}, I’d like to ${change ? 'change my plan to' : 'book'} ${plan.name}.`,
    name: user?.name,
    mobile: user?.mobile,
    registration: vehicle.registrationNumber,
    vehicle: `${vehicle.make} ${vehicle.model}, ${LABELS.vehicleType[vehicle.vehicleType]}`,
    plan: `${plan.name}${price && price.monthlyPrice > 0 ? ` (${priceText(price.monthlyPrice)}/month)` : ''}`,
    start,
  });
  const wa = whatsappLink(contact, message);
  const tel = callLink(contact);
  const record = () =>
    enquire.mutateAsync({
      type: change ? 'CHANGE_PLAN' : 'NEW_PLAN',
      vehicleId: vehicle.id,
      planId: plan.id,
      message,
    });

  if (sent) {
    return (
      <div className="pt-6 flex flex-col items-center text-center gap-3">
        <span className="w-16 h-16 rounded-2xl bg-accent-soft-2 text-accent-deep flex items-center justify-center">
          <Check size={30} strokeWidth={2.6} />
        </span>
        <h1 className="text-[26px] font-bold">Enquiry sent</h1>
        <p className="text-[15px] text-muted">
          We’ll call you back on {user?.mobile} to confirm {plan.name} for{' '}
          {vehicle.registrationNumber}.
        </p>
        <div className="flex flex-col gap-2.5 w-full mt-4">
          <LinkButton to="/app/enquiries" variant="cta" size="lg">
            My enquiries
          </LinkButton>
          <LinkButton to="/app">Back to home</LinkButton>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-[calc(100dvh-200px)]">
      <button
        type="button"
        aria-label="Back"
        onClick={() => navigate(-1)}
        className="w-11 h-11 -ml-3 flex items-center justify-center rounded-full hover:bg-white"
      >
        <ChevronLeft size={22} />
      </button>
      <div className="flex flex-col gap-1.5">
        <h1 className="text-[27px] font-bold tracking-[-0.5px]">
          {change ? `Change to ${shortName}` : `Book ${shortName}`}
        </h1>
        <p className="text-[15px] text-muted">
          For {vehicle.registrationNumber} · {vehicle.make} {vehicle.model},{' '}
          {LABELS.vehicleType[vehicle.vehicleType]}
        </p>
      </div>

      <section className="pt-[18px] flex flex-col gap-3">
        <Card className="flex flex-col gap-3">
          <div className="flex justify-between items-baseline">
            <span className="font-semibold">Monthly price</span>
            <span className="font-display font-bold text-[22px]">
              {priceText(price?.monthlyPrice)}
            </span>
          </div>
          <div className="dotted-top pt-3 flex flex-col gap-2 text-sm">
            {plan.activities.map((a) => (
              <div key={a.id} className="flex gap-2.5">
                <Check size={18} strokeWidth={2.4} className="text-accent-ink shrink-0" />
                {a.quotaPerMonth} × {a.name.toLowerCase()}
                {a.description ? `, ${a.description.toLowerCase()}` : ''}
              </div>
            ))}
          </div>
        </Card>
        <Card className="flex items-center gap-3.5 py-4">
          <div className="flex-1">
            <label htmlFor="asap" className="font-semibold">
              Start as soon as possible
            </label>
            <div className="text-[13px] text-muted mt-0.5">
              Or tell us a start date when we talk
            </div>
          </div>
          <Switch id="asap" checked={asap} onChange={setAsap} label="Start as soon as possible" />
        </Card>
      </section>

      <section className="pt-[22px] flex flex-col gap-2.5">
        <div className="dotted-top pt-[18px] font-semibold text-[15px]">Select how to continue</div>
        {wa ? (
          <OptionRow
            icon={<WhatsApp size={20} />}
            title="WhatsApp us"
            sub="Message is ready with your vehicle details"
            href={wa}
            external
            onClick={() => void record()}
          />
        ) : null}
        {tel ? (
          <OptionRow
            icon={<Phone size={20} />}
            title="Call us"
            sub={
              contact?.supportHours ? `Talk to us now, ${contact.supportHours}` : 'Talk to us now'
            }
            href={tel}
            onClick={() => void record()}
          />
        ) : null}
        <OptionRow
          icon={<Message size={20} />}
          title="Send an enquiry"
          sub="We’ll call you back"
          onClick={async () => {
            try {
              setSent(await record());
            } catch {
              /* shown below */
            }
          }}
        />
        <FormError error={enquire.error} />
        {change ? <Notice>Your current plan keeps running until we switch it.</Notice> : null}
      </section>

      <p className="mt-auto pt-6 text-[13px] text-muted text-center">
        Payment is collected in person or by UPI. Your plan starts once we confirm it.{' '}
        <Link to="/app/enquiries">My enquiries</Link>
      </p>
    </div>
  );
}
