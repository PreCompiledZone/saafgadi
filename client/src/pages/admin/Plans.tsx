import { CAR_TYPES, LABELS, type VehicleType } from '@shared/enums';
import type { PlanActivityDto, PlanDto } from '@shared/types';
import { useState } from 'react';
import { api } from '../../api/client';
import { useApi, useApiMutation } from '../../api/hooks';
import { Plus, X } from '../../components/icons';
import { PlanIcon } from '../../components/PlanCard';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  Checkbox,
  Field,
  FormError,
  Input,
  PageTitle,
  QueryView,
  Textarea,
  useToast,
} from '../../components/ui';

type ActivityDraft = Omit<PlanActivityDto, 'id'> & { id?: number; key: string };

function DetailsForm({ plan }: { plan: PlanDto }) {
  const toast = useToast();
  const [name, setName] = useState(plan.name);
  const [description, setDescription] = useState(plan.description ?? '');
  const [isActive, setIsActive] = useState(plan.isActive);
  const save = useApiMutation(
    () =>
      api.put(`/admin/plans/${plan.id}`, {
        name,
        description,
        isActive,
        sortOrder: plan.sortOrder,
      }),
    [['admin', 'plans'], ['public']],
  );
  return (
    <div className="flex flex-col gap-4">
      <Field label="Plan name" htmlFor={`pn${plan.id}`}>
        <Input id={`pn${plan.id}`} value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label="Description" htmlFor={`pd${plan.id}`}>
        <Textarea
          id={`pd${plan.id}`}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="min-h-20"
        />
      </Field>
      <Checkbox
        label="Plan is active"
        hint="Inactive plans are hidden from customers and can't be activated"
        checked={isActive}
        onChange={(e) => setIsActive(e.target.checked)}
      />
      <FormError error={save.error} />
      <Button
        className="self-start"
        loading={save.isPending}
        onClick={async () => {
          await save.mutateAsync(undefined);
          toast('Plan saved');
        }}
      >
        Save details
      </Button>
    </div>
  );
}

function PricesForm({ plan }: { plan: PlanDto }) {
  const toast = useToast();
  const types: VehicleType[] = plan.vehicleCategory === 'CAR' ? [...CAR_TYPES] : ['BIKE'];
  const [prices, setPrices] = useState<Record<string, string>>(
    Object.fromEntries(
      types.map((t) => [
        t,
        String(plan.prices.find((p) => p.vehicleType === t)?.monthlyPrice ?? 0),
      ]),
    ),
  );
  const save = useApiMutation(
    () =>
      api.put(`/admin/plans/${plan.id}/prices`, {
        prices: types.map((t) => ({
          vehicleType: t,
          monthlyPrice: Number(prices[t] || 0),
          isActive: true,
        })),
      }),
    [['admin', 'plans'], ['public']],
  );
  return (
    <div className="flex flex-col gap-4">
      <div
        className="grid gap-3"
        style={{ gridTemplateColumns: `repeat(${Math.min(types.length, 3)}, minmax(0, 1fr))` }}
      >
        {types.map((t) => (
          <Field
            key={t}
            label={`${LABELS.vehicleType[t]} (₹/month)`}
            htmlFor={`price-${plan.id}-${t}`}
          >
            <Input
              id={`price-${plan.id}-${t}`}
              type="number"
              inputMode="decimal"
              min={0}
              step="1"
              value={prices[t]}
              onChange={(e) => setPrices({ ...prices, [t]: e.target.value })}
            />
          </Field>
        ))}
      </div>
      <p className="text-[13px] text-muted">
        Price changes apply to new activations and renewals only. Existing subscriptions keep their
        price.
      </p>
      <FormError error={save.error} />
      <Button
        variant="cta"
        className="self-start"
        loading={save.isPending}
        onClick={async () => {
          await save.mutateAsync(undefined);
          toast('Prices saved');
        }}
      >
        Save prices
      </Button>
    </div>
  );
}

function ActivitiesForm({ plan }: { plan: PlanDto }) {
  const toast = useToast();
  const [rows, setRows] = useState<ActivityDraft[]>(
    plan.activities.map((a) => ({ ...a, key: String(a.id) })),
  );
  const save = useApiMutation(
    () =>
      api.put(`/admin/plans/${plan.id}/activities`, {
        activities: rows.map((r, i) => ({
          id: r.id,
          name: r.name,
          description: r.description,
          quotaPerMonth: Number(r.quotaPerMonth),
          minGapDays: Number(r.minGapDays),
          sortOrder: i + 1,
          isActive: r.isActive,
        })),
      }),
    [['admin', 'plans'], ['public']],
  );
  const set = (key: string, patch: Partial<ActivityDraft>) =>
    setRows(rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  return (
    <div className="flex flex-col gap-3">
      {rows.map((r) => (
        <div key={r.key} className="bg-canvas rounded-[14px] p-3.5 flex flex-col gap-3">
          <div className="grid gap-3 sm:grid-cols-[1fr_120px_120px] items-end">
            <Field label="Service" htmlFor={`an-${r.key}`}>
              <Input
                id={`an-${r.key}`}
                value={r.name}
                onChange={(e) => set(r.key, { name: e.target.value })}
              />
            </Field>
            <Field label="Per month" htmlFor={`aq-${r.key}`}>
              <Input
                id={`aq-${r.key}`}
                type="number"
                min={1}
                value={r.quotaPerMonth}
                onChange={(e) => set(r.key, { quotaPerMonth: Number(e.target.value) })}
              />
            </Field>
            <Field label="Spacing (days)" htmlFor={`ag-${r.key}`}>
              <Input
                id={`ag-${r.key}`}
                type="number"
                min={1}
                value={r.minGapDays}
                onChange={(e) => set(r.key, { minGapDays: Number(e.target.value) })}
              />
            </Field>
          </div>
          <Field label="Description" htmlFor={`ad-${r.key}`}>
            <Input
              id={`ad-${r.key}`}
              value={r.description ?? ''}
              onChange={(e) => set(r.key, { description: e.target.value })}
            />
          </Field>
          <div className="flex flex-wrap items-center gap-3 justify-between">
            <Checkbox
              label="Active"
              checked={r.isActive}
              onChange={(e) => set(r.key, { isActive: e.target.checked })}
            />
            <span className="text-[13px] text-muted">
              {r.minGapDays === 1
                ? 'Any day until done'
                : r.minGapDays === 2
                  ? 'Alternate days'
                  : `Every ${r.minGapDays} days`}
            </span>
            {!r.id ? (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setRows(rows.filter((x) => x.key !== r.key))}
              >
                <X size={16} /> Remove
              </Button>
            ) : null}
          </div>
        </div>
      ))}
      <p className="text-[13px] text-muted">
        Spacing decides what shows as due: 2 = alternate days. Washers can still log a pending
        service as a catch-up. Services already logged can’t be removed — deactivate them instead.
      </p>
      <FormError error={save.error} />
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="ghost"
          onClick={() =>
            setRows([
              ...rows,
              {
                key: `new-${Date.now()}`,
                name: '',
                description: '',
                quotaPerMonth: 1,
                minGapDays: 1,
                sortOrder: rows.length + 1,
                isActive: true,
              },
            ])
          }
        >
          <Plus size={16} /> Add service
        </Button>
        <span className="flex-1" />
        <Button
          loading={save.isPending}
          onClick={async () => {
            await save.mutateAsync(undefined);
            toast('Services saved');
          }}
        >
          Save services
        </Button>
      </div>
    </div>
  );
}

export function AdminPlans() {
  const q = useApi<PlanDto[]>(['admin', 'plans'], '/admin/plans');
  return (
    <>
      <PageTitle title="Plans & pricing" />
      <QueryView query={q}>
        {(plans) =>
          plans.map((p) => (
            <Card
              key={`${p.id}-${p.prices.map((x) => x.monthlyPrice).join()}-${p.activities.length}`}
              className="flex flex-col gap-6"
            >
              <div className="flex items-center gap-3">
                <PlanIcon plan={p} />
                <div className="flex-1">
                  <h2 className="text-xl font-semibold">{p.name}</h2>
                  <div className="text-sm text-muted">{LABELS.category[p.vehicleCategory]}s</div>
                </div>
                {p.isActive ? (
                  <Badge tone="active">Active</Badge>
                ) : (
                  <Badge tone="muted">Inactive</Badge>
                )}
              </div>
              <div className="grid gap-6 xl:grid-cols-2">
                <section>
                  <CardHeader title="Monthly prices" />
                  <PricesForm plan={p} />
                </section>
                <section>
                  <CardHeader title="Details" />
                  <DetailsForm plan={p} />
                </section>
              </div>
              <section className="dotted-top pt-5">
                <CardHeader title="Services included" />
                <ActivitiesForm plan={p} />
              </section>
            </Card>
          ))
        }
      </QueryView>
    </>
  );
}
