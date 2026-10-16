import { usePublicPlans } from '../../api/hooks';
import { Logo, PublicHeaderActions } from '../../components/brand';
import { FooterContact } from '../../components/contact';
import { PlanCard } from '../../components/PlanCard';
import { LinkButton, QueryView } from '../../components/ui';
import { useSession } from '../../lib/auth';

export function PlansPage() {
  const plans = usePublicPlans();
  const { user } = useSession();
  return (
    <div className="mx-auto max-w-3xl px-5 pb-12">
      <header className="flex items-center justify-between py-[18px]">
        <Logo size="lg" />
        <PublicHeaderActions />
      </header>
      <h1 className="text-[27px] font-bold tracking-[-0.5px] mt-2 mb-4">Plans</h1>
      <QueryView query={plans}>
        {(list) => (
          <div className="grid gap-3 md:grid-cols-2">
            {list.map((p) => (
              <PlanCard
                key={p.id}
                plan={p}
                action={
                  <LinkButton
                    to={user?.role === 'USER' ? `/app/plans/${p.id}/book` : `/signup?plan=${p.id}`}
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
      </QueryView>
      <footer className="mt-10 text-sm">
        <FooterContact />
      </footer>
    </div>
  );
}
