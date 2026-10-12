import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { useContact } from '../../api/hooks';
import { AnchorButton, Dot, LinkButton, TimelineItem } from '../../components/ui';
import { Check, CheckCircle, WhatsApp } from '../../components/icons';
import { bookingMessage, callLink, whatsappLink, greeting } from '../../lib/contact';
import { firstName } from '../../lib/format';
import { useSession } from '../../lib/auth';
import { formatRegistration } from '@shared/registration';

/** "You're all set" — shown right after sign-up. */
export function Welcome() {
  const { user } = useSession();
  const contact = useContact().data;
  const location = useLocation();
  const [params] = useSearchParams();
  const reg = (location.state as { registration?: string } | null)?.registration;
  const plan = params.get('plan');
  const message = bookingMessage({
    contact,
    intro: `${greeting(contact)}, I just signed up and would like to choose a plan.`,
    name: user?.name,
    mobile: user?.mobile,
    registration: reg ? formatRegistration(reg) : undefined,
  });
  const wa = whatsappLink(contact, message);
  const tel = callLink(contact);

  return (
    <div className="flex flex-col min-h-[calc(100dvh-180px)]">
      <section className="pt-8 flex flex-col items-center gap-3 text-center">
        <div className="relative w-16 h-16">
          <span className="absolute -right-1.5 -top-2 w-[30px] h-[30px] rounded-full bg-accent opacity-85" />
          <span className="absolute inset-0 rounded-2xl bg-accent-soft-2 text-accent-deep flex items-center justify-center">
            <CheckCircle size={30} />
          </span>
        </div>
        <h1 className="mt-2.5 text-[28px] font-bold tracking-[-0.5px]">
          You’re all set, {user ? firstName(user.name) : ''}!
        </h1>
        <p className="text-[15px] leading-normal text-muted">
          Your account{reg ? ` and ${formatRegistration(reg)} are` : ' is'} saved. Talk to us to
          pick a plan and book your first wash.
        </p>
      </section>

      <section className="pt-6">
        <div className="bg-white rounded-[18px] p-5 shadow-card">
          <h2 className="text-lg font-semibold mb-3.5">Track your progress</h2>
          <div className="dotted-top pt-4 flex flex-col">
            <TimelineItem
              marker={
                <Dot>
                  <Check size={13} strokeWidth={3.4} />
                </Dot>
              }
            >
              <div className="font-semibold">Create your account</div>
            </TimelineItem>
            <TimelineItem
              marker={
                <Dot tone="ring">
                  <span className="w-2 h-2 rounded-full bg-accent" />
                </Dot>
              }
            >
              <div className="font-semibold">Choose a plan and pay</div>
              <div className="text-[13px] text-muted">Cash, UPI or bank transfer</div>
            </TimelineItem>
            <TimelineItem marker={<Dot tone="empty" />}>
              <div className="text-muted font-medium">We activate your plan</div>
            </TimelineItem>
            <TimelineItem marker={<Dot tone="empty" />} last>
              <div className="text-muted font-medium">Your first wash</div>
            </TimelineItem>
          </div>
        </div>
      </section>

      <section className="pt-6 mt-auto flex flex-col gap-2.5">
        {plan ? (
          <LinkButton to={`/app/plans/${plan}/book`} variant="cta" size="lg">
            Continue booking your plan
          </LinkButton>
        ) : wa ? (
          <AnchorButton href={wa} target="_blank" rel="noopener noreferrer" variant="cta" size="lg">
            <WhatsApp size={20} />
            WhatsApp us to choose a plan
          </AnchorButton>
        ) : (
          <LinkButton to="/app/plans" variant="cta" size="lg">
            Choose a plan
          </LinkButton>
        )}
        {tel ? <AnchorButton href={tel}>Call us instead</AnchorButton> : null}
        <Link to="/app" className="self-center p-3 font-semibold text-[15px] no-underline">
          Go to my dashboard
        </Link>
      </section>
    </div>
  );
}
