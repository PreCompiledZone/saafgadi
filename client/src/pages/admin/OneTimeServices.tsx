import { LABELS, VEHICLE_TYPES, type VehicleType } from '@shared/enums';
import type { OneTimeServiceDto } from '@shared/types';
import { useState } from 'react';
import { api } from '../../api/client';
import { useApi, useApiMutation } from '../../api/hooks';
import { Plus } from '../../components/icons';
import {
  Badge,
  Button,
  Card,
  Checkbox,
  Field,
  FormError,
  Input,
  PageTitle,
  QueryView,
  Textarea,
  useToast,
} from '../../components/ui';
import { money } from '../../lib/format';

const blank: OneTimeServiceDto = {
  id: 0,
  name: '',
  description: '',
  includes: [],
  appliesTo: ['HATCHBACK', 'SEDAN', 'SUV'],
  durationMinutes: 30,
  isActive: false,
  sortOrder: 0,
  prices: [],
  fromPrice: 0,
};

function ServiceForm({ service, onDone }: { service: OneTimeServiceDto; onDone?: () => void }) {
  const toast = useToast();
  const isNew = !service.id;
  const [name, setName] = useState(service.name);
  const [description, setDescription] = useState(service.description ?? '');
  const [includes, setIncludes] = useState(service.includes.join('\n'));
  const [appliesTo, setAppliesTo] = useState<VehicleType[]>(service.appliesTo);
  const [duration, setDuration] = useState(String(service.durationMinutes));
  const [sortOrder, setSortOrder] = useState(String(service.sortOrder));
  const [isActive, setIsActive] = useState(service.isActive);
  const [prices, setPrices] = useState<Record<string, string>>(
    Object.fromEntries(
      VEHICLE_TYPES.map((t) => [
        t,
        String(service.prices.find((p) => p.vehicleType === t)?.price ?? ''),
      ]),
    ),
  );
  const save = useApiMutation(
    (body: unknown) =>
      isNew
        ? api.post<OneTimeServiceDto>('/admin/one-time-services', body)
        : api.put<OneTimeServiceDto>(`/admin/one-time-services/${service.id}`, body),
    [['admin', 'one-time-services'], ['public']],
  );
  const id = (k: string) => `${k}-${service.id}`;

  return (
    <form
      noValidate
      className="flex flex-col gap-4"
      onSubmit={async (e) => {
        e.preventDefault();
        try {
          await save.mutateAsync({
            name,
            description,
            includes: includes
              .split('\n')
              .map((l) => l.trim())
              .filter(Boolean),
            appliesTo,
            durationMinutes: Number(duration),
            sortOrder: Number(sortOrder) || 0,
            isActive,
            prices: appliesTo.map((t) => ({ vehicleType: t, price: Number(prices[t] || 0) })),
          });
          toast(isNew ? 'Service added' : 'Service saved');
          onDone?.();
        } catch {
          /* shown */
        }
      }}
    >
      <div className="grid gap-4 sm:grid-cols-[1fr_140px_120px]">
        <Field label="Name" htmlFor={id('n')}>
          <Input id={id('n')} value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Duration (min)" htmlFor={id('d')}>
          <Input
            id={id('d')}
            type="number"
            min={5}
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
          />
        </Field>
        <Field label="Display order" htmlFor={id('o')}>
          <Input
            id={id('o')}
            type="number"
            min={0}
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value)}
          />
        </Field>
      </div>
      <Field label="Short description" htmlFor={id('ds')}>
        <Input id={id('ds')} value={description} onChange={(e) => setDescription(e.target.value)} />
      </Field>
      <Field label="Includes" htmlFor={id('i')} hint="One item per line, shown as a checklist">
        <Textarea
          id={id('i')}
          value={includes}
          onChange={(e) => setIncludes(e.target.value)}
          className="min-h-24"
        />
      </Field>
      <fieldset className="border-0 p-0 m-0">
        <legend className="font-semibold text-sm mb-2.5">Vehicles and price (₹)</legend>
        <div className="grid gap-3 grid-cols-2 sm:grid-cols-4">
          {VEHICLE_TYPES.map((t) => {
            const on = appliesTo.includes(t);
            return (
              <div key={t} className="bg-canvas rounded-[14px] p-3 flex flex-col gap-2">
                <Checkbox
                  label={LABELS.vehicleType[t]}
                  checked={on}
                  onChange={(e) =>
                    setAppliesTo(
                      e.target.checked
                        ? VEHICLE_TYPES.filter((x) => x === t || appliesTo.includes(x))
                        : appliesTo.filter((x) => x !== t),
                    )
                  }
                />
                <Input
                  aria-label={`${LABELS.vehicleType[t]} price`}
                  type="number"
                  inputMode="numeric"
                  min={0}
                  step="1"
                  disabled={!on}
                  value={prices[t]}
                  onChange={(e) => setPrices({ ...prices, [t]: e.target.value })}
                />
              </div>
            );
          })}
        </div>
      </fieldset>
      <p className="text-[13px] text-muted">
        Price changes apply to new bookings only. Existing bookings keep the price they were made
        with.
      </p>
      <Checkbox
        label="Active"
        hint="Active services show on the welcome page and can be booked"
        checked={isActive}
        onChange={(e) => setIsActive(e.target.checked)}
      />
      <FormError error={save.error} />
      <div className="flex gap-2">
        <Button type="submit" variant="cta" loading={save.isPending}>
          {isNew ? 'Add service' : 'Save service'}
        </Button>
        {onDone && isNew ? (
          <Button variant="ghost" onClick={onDone}>
            Cancel
          </Button>
        ) : null}
      </div>
    </form>
  );
}

export function OneTimeServices() {
  const q = useApi<OneTimeServiceDto[]>(['admin', 'one-time-services'], '/admin/one-time-services');
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<number | null>(null);
  return (
    <>
      <PageTitle
        title="One-time washes"
        eyebrow="Single washes customers book without a plan"
        actions={
          adding ? null : (
            <Button variant="cta" onClick={() => setAdding(true)}>
              <Plus size={18} /> Add service
            </Button>
          )
        }
      />
      {adding ? (
        <Card>
          <ServiceForm
            service={{ ...blank, sortOrder: (q.data?.length ?? 0) + 1 }}
            onDone={() => setAdding(false)}
          />
        </Card>
      ) : null}
      <QueryView query={q}>
        {(list) =>
          list.map((s) => (
            <Card key={s.id} className="flex flex-col gap-4">
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex-1 min-w-0">
                  <h2 className="text-lg font-semibold">{s.name}</h2>
                  <div className="text-sm text-muted">
                    {s.appliesTo.map((t) => LABELS.vehicleType[t]).join(', ')} · {s.durationMinutes}{' '}
                    min · from {money(s.fromPrice)}
                  </div>
                </div>
                {s.isActive ? (
                  <Badge tone="active">Active</Badge>
                ) : (
                  <Badge tone="muted">Hidden</Badge>
                )}
                <Button size="sm" onClick={() => setEditing(editing === s.id ? null : s.id)}>
                  {editing === s.id ? 'Close' : 'Edit'}
                </Button>
              </div>
              {editing === s.id ? (
                <ServiceForm
                  key={`${s.id}-${s.prices.map((p) => p.price).join()}`}
                  service={s}
                  onDone={() => setEditing(null)}
                />
              ) : null}
            </Card>
          ))
        }
      </QueryView>
    </>
  );
}
