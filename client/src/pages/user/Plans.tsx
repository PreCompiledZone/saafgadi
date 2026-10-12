import type { VehicleDto } from '@shared/types';
import { useSearchParams } from 'react-router-dom';
import { useApi, usePublicPlans } from '../../api/hooks';
import { ContactButtons } from '../../components/contact';
import { PlanCard } from '../../components/PlanCard';
import { cx, LinkButton, PageTitle, QueryView } from '../../components/ui';

export function Plans() {
  const plans = usePublicPlans();
  const vehicles = useApi<VehicleDto[]>(['me', 'vehicles'], '/me/vehicles');
  const [params, setParams] = useSearchParams();
  const active = (vehicles.data ?? []).filter((v) => v.isActive);
  const selected = active.find((v) => v.id === Number(params.get('vehicle'))) ?? active[0];
  const change = params.get('change') === '1';

  return (
    <div className="flex flex-col gap-3.5 pt-1">
      <PageTitle
        title={change ? 'Change plan' : 'Plans'}
        eyebrow={selected ? `For ${selected.registrationNumber}` : undefined}
      />
      {active.length > 1 ? (
        <div className="flex gap-2 overflow-x-auto -mx-5 px-5 pb-1">
          {active.map((v) => (
            <button
              key={v.id}
              type="button"
              aria-pressed={v.id === selected?.id}
              onClick={() => {
                const next = new URLSearchParams(params);
                next.set('vehicle', String(v.id));
                setParams(next, { replace: true });
              }}
              className={cx(
                'shrink-0 rounded-xl px-3 py-2 text-sm font-bold plate border',
                v.id === selected?.id ? 'bg-white border-ink' : 'border-line text-muted',
              )}
            >
              {v.registrationNumber}
            </button>
          ))}
        </div>
      ) : null}
      <QueryView query={plans}>
        {(list) => {
          const shown = selected
            ? list.filter((p) => p.vehicleCategory === selected.category)
            : list;
          return (
            <>
              {shown.map((p) => (
                <PlanCard
                  key={p.id}
                  plan={p}
                  highlightType={selected?.vehicleType}
                  action={
                    selected ? (
                      <LinkButton
                        to={`/app/plans/${p.id}/book?vehicle=${selected.id}${change ? '&change=1' : ''}`}
                        variant="outline"
                        className="h-12"
                      >
                        {change
                          ? `Switch to ${p.name.replace(/ plan$/i, '')}`
                          : `Book ${p.name.replace(/ plan$/i, '')}`}
                      </LinkButton>
                    ) : (
                      <LinkButton to="/app/vehicles?add=1" variant="outline" className="h-12">
                        Add a vehicle to book
                      </LinkButton>
                    )
                  }
                />
              ))}
            </>
          );
        }}
      </QueryView>
      <ContactButtons className="mt-2" />
    </div>
  );
}
