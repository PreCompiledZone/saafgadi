import { LABELS } from '@shared/enums';
import type { PlanDto } from '@shared/types';
import type { ReactNode } from 'react';
import { money, plural } from '../lib/format';
import { Bike, Car, Check } from './icons';
import { Card } from './ui';

export function priceText(n: number | undefined): string {
  return n && n > 0 ? money(n) : 'Ask us';
}

export function activityLine(a: PlanDto['activities'][number]): string {
  const spacing =
    a.minGapDays === 2
      ? ', every other day'
      : a.minGapDays > 2
        ? `, every ${a.minGapDays} days`
        : '';
  return `${plural(a.quotaPerMonth, 'time')} a month${spacing}`;
}

/** Every service in the plan on its own line, with a tick. */
export function PlanServices({
  plan,
  className,
}: {
  plan: Pick<PlanDto, 'activities'>;
  className?: string;
}) {
  return (
    <ul className={`flex flex-col gap-2 text-[15px] ${className ?? ''}`}>
      {plan.activities
        .filter((a) => a.isActive)
        .map((a) => (
          <li key={a.id} className="flex gap-2.5">
            <span className="w-5 h-5 mt-0.5 shrink-0 rounded-full bg-accent-soft text-accent-ink flex items-center justify-center">
              <Check size={13} strokeWidth={3.2} />
            </span>
            <span>
              <b className="font-semibold">{a.quotaPerMonth}</b> × {a.name}
              <span className="block text-[13px] text-muted">
                {a.description ? `${a.description} · ` : ''}
                {activityLine(a)}
              </span>
            </span>
          </li>
        ))}
    </ul>
  );
}

export function PlanIcon({
  plan,
  size = 24,
}: {
  plan: Pick<PlanDto, 'vehicleCategory'>;
  size?: number;
}) {
  return (
    <span className="w-11 h-11 shrink-0 rounded-xl bg-accent-soft text-accent-ink flex items-center justify-center">
      {plan.vehicleCategory === 'CAR' ? (
        <Car size={size} strokeWidth={1.9} />
      ) : (
        <Bike size={size} strokeWidth={1.9} />
      )}
    </span>
  );
}

export function PlanCard({
  plan,
  action,
  highlightType,
}: {
  plan: PlanDto;
  action?: ReactNode;
  highlightType?: string;
}) {
  const prices = plan.prices.filter((p) => p.isActive);
  const single = prices.length === 1;
  return (
    <Card as="article" className="flex flex-col gap-3.5">
      <div className="flex gap-3 items-center">
        <PlanIcon plan={plan} />
        <div className="flex-1 min-w-0">
          <h3 className="text-lg font-semibold leading-tight">{plan.name}</h3>
          <div className="text-[13px] text-muted">Monthly plan</div>
        </div>
        {single ? <div className="font-bold">{priceText(prices[0].monthlyPrice)}</div> : null}
      </div>
      {plan.description ? (
        <p className="text-[14px] text-muted -mt-1 pl-14">{plan.description}</p>
      ) : null}
      <PlanServices plan={plan} className="pl-14" />
      {!single && prices.length ? (
        <div
          className="grid gap-2"
          style={{ gridTemplateColumns: `repeat(${prices.length}, minmax(0, 1fr))` }}
        >
          {prices.map((p) => (
            <div
              key={p.vehicleType}
              className={`rounded-xl px-1.5 py-2.5 text-center ${highlightType === p.vehicleType ? 'bg-accent-soft ring-2 ring-accent' : 'bg-canvas'}`}
            >
              <div className="text-xs text-muted">{LABELS.vehicleType[p.vehicleType]}</div>
              <div className="font-bold text-sm">{priceText(p.monthlyPrice)}</div>
            </div>
          ))}
        </div>
      ) : null}
      {action}
    </Card>
  );
}
