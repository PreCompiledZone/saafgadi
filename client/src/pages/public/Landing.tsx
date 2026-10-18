import { useContact, usePublicPlans } from '../../api/hooks';
import { useAppName } from '../../components/brand';
import { Logo, PublicHeaderActions } from '../../components/brand';
import { LogoMark, splitWordmark } from '../../components/LogoMark';
import { FooterContact } from '../../components/contact';
import { Check, ChevronRight, Interior, Wash } from '../../components/icons';
import { OneTimeServiceList, PlanKindToggle, usePlanKind } from '../../components/oneTime';
import { PlanCard } from '../../components/PlanCard';
import { Dot, LinkButton, Spinner, TimelineItem } from '../../components/ui';
import { HOME_FOR, useSession } from '../../lib/auth';

function PreviewCard() {
  return (
    <section aria-label="How the app looks" className="w-full max-w-[330px] mx-auto">
      <div className="bg-sand rounded-[28px] p-[18px] flex flex-col gap-2.5">
        <div className="bg-white rounded-[18px] px-4 pt-[18px] pb-3.5 shadow-float flex flex-col items-center gap-3">
          <div className="border-2 border-ink rounded-lg px-3.5 py-1.5 font-bold text-xl plate">
            MH 14 AB ****
          </div>
          <div className="w-full">
            <div className="h-[3px] rounded-sm bg-accent" />
            <div className="h-3.5 bg-accent-soft rounded-b-md" />
          </div>
          <div className="text-xs font-semibold tracking-[1.4px] text-accent-ink">
            WASHING · 7:42 AM
          </div>
        </div>
        {[
          {
            icon: <Wash size={18} />,
            title: 'Exterior foam wash',
            sub: '9 of 15 this month',
            inset: 'mx-2',
          },
          {
            icon: <Interior size={18} />,
            title: 'Interior clean & polish',
            sub: 'Once a month',
            inset: 'mx-4',
          },
        ].map((r) => (
          <div
            key={r.title}
            className={`bg-white rounded-[14px] px-3.5 py-3 flex items-center gap-3 ${r.inset}`}
          >
            <span className="w-[34px] h-[34px] shrink-0 rounded-[10px] bg-accent-soft text-accent-ink flex items-center justify-center">
              {r.icon}
            </span>
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-sm">{r.title}</div>
              <div className="text-xs text-muted">{r.sub}</div>
            </div>
            <span className="w-[22px] h-[22px] rounded-full bg-accent text-white flex items-center justify-center">
              <Check size={12} strokeWidth={3.4} />
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

export function Landing() {
  const plans = usePublicPlans();
  const contact = useContact().data;
  const name = useAppName();
  const { user } = useSession();
  const [kind, setKind] = usePlanKind();

  return (
    <div className="mx-auto max-w-5xl flex flex-col min-h-dvh">
      <header className="flex items-center justify-between px-5 py-[18px]">
        <Logo size="lg" />
        <PublicHeaderActions />
      </header>

      <div className="md:grid md:grid-cols-2 md:gap-10 md:items-center md:px-6 md:py-8">
        <div>
          <section className="px-6 pt-5 pb-2 flex flex-col items-center md:items-start gap-3 text-center md:text-left">
            <h1 className="text-[30px] md:text-[44px] font-bold leading-[1.15] tracking-[-0.6px]">
              Your car, shining
              <br />
              every other day
            </h1>
            <p className="text-base md:text-lg leading-normal text-muted max-w-md">
              Doorstep foam wash in your society parking. Track every wash from your phone.
            </p>
          </section>
          <div className="md:hidden px-8 pt-6 pb-2">
            <PreviewCard />
          </div>
          <section className="px-5 pt-6 pb-2 flex flex-col md:max-w-md">
            <LinkButton
              to={user ? HOME_FOR[user.role] : '/signup'}
              variant="cta"
              size="lg"
              className="h-[54px]"
            >
              {user ? 'Go to my dashboard' : 'Get started'}{' '}
              <ChevronRight size={18} strokeWidth={2.2} />
            </LinkButton>
          </section>
        </div>
        <div className="hidden md:block">
          <PreviewCard />
        </div>
      </div>

      <div className="md:grid md:grid-cols-[1fr_1.4fr] md:gap-6 md:px-6 md:items-start">
        <section className="px-5 pt-6 pb-2 md:px-0">
          <div className="bg-white rounded-[18px] p-5 shadow-card">
            <h2 className="text-lg font-semibold mb-3.5">How it works</h2>
            <div className="dotted-top pt-4 flex flex-col">
              {[
                ['Sign up with your vehicle', 'Registration number and parking spot'],
                ['Pick a plan and pay us', 'WhatsApp or call; we activate once paid'],
                ['See every wash, with time', 'Your washer marks it; you see it live'],
              ].map(([t, s], i, all) => (
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
                  <div className="text-sm text-muted">{s}</div>
                </TimelineItem>
              ))}
            </div>
          </div>
        </section>

        <section className="px-5 py-6 md:px-0 md:pt-6 flex flex-col gap-3" id="plans">
          <h2 className="text-xl font-semibold mb-1">Plans</h2>
          <PlanKindToggle value={kind} onChange={setKind} />
          {kind === 'one-time' ? (
            <OneTimeServiceList className="lg:grid-cols-2" />
          ) : plans.isLoading ? (
            <div className="py-8 flex justify-center text-accent">
              <Spinner />
            </div>
          ) : (
            <div className="grid gap-3 lg:grid-cols-2">
              {(plans.data ?? []).map((p) => (
                <PlanCard
                  key={p.id}
                  plan={p}
                  action={
                    <LinkButton
                      to={
                        user?.role === 'USER' ? `/app/plans/${p.id}/book` : `/signup?plan=${p.id}`
                      }
                      variant="outline"
                      className="h-12"
                    >
                      Book {p.name.replace(/ plan$/i, '')}
                    </LinkButton>
                  }
                />
              ))}
            </div>
          )}
        </section>
      </div>

      <footer className="mt-auto px-5 pt-6 pb-8 text-sm text-muted flex flex-col items-center gap-2 text-center">
        <LogoMark size={44} />
        <span className="font-display font-bold text-lg leading-none">
          <span className="text-ink">{splitWordmark(contact?.businessName || name)[0]}</span>
          <span className="text-accent">{splitWordmark(contact?.businessName || name)[1]}</span>
        </span>
        {[contact?.businessAddress, contact?.supportHours].filter(Boolean).length ? (
          <span>
            {[contact?.businessAddress, contact?.supportHours].filter(Boolean).join(' · ')}
          </span>
        ) : null}
        <div className="mt-3">
          <FooterContact />
        </div>
      </footer>
    </div>
  );
}
