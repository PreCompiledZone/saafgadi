import { zodResolver } from '@hookform/resolvers/zod';
import { societyInputSchema } from '@shared/schemas';
import type { SocietyDetail, SocietyDto, UnlistedSociety } from '@shared/types';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useParams } from 'react-router-dom';
import type { z } from 'zod';
import { api } from '../../api/client';
import { useApi, useApiMutation } from '../../api/hooks';
import { Alert, MapPin, Plus, Users as UsersIcon } from '../../components/icons';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  Checkbox,
  EmptyState,
  Field,
  FormError,
  Input,
  LinkButton,
  Notice,
  PageTitle,
  Progress,
  QueryView,
  Sheet,
  Stat,
  Textarea,
  useToast,
} from '../../components/ui';
import { plural } from '../../lib/format';
import { applyServerErrors } from '../../lib/forms';
import { SubscriptionRows } from './Subscriptions';
import { Table, Td, Tr, WasherSelect } from './parts';

type In = z.input<typeof societyInputSchema>;
type Out = z.output<typeof societyInputSchema>;

export function useSocieties() {
  return useApi<SocietyDto[]>(['admin', 'societies'], '/admin/societies');
}

/** Onboard a new society (optionally from a typed name) or edit one. */
export function SocietySheet({
  society,
  fromUnlisted,
  onClose,
}: {
  society?: SocietyDto;
  fromUnlisted?: UnlistedSociety;
  onClose: () => void;
}) {
  const toast = useToast();
  const save = useApiMutation(
    (v: Out) =>
      society
        ? api.put<SocietyDto>(`/admin/societies/${society.id}`, v)
        : api.post<SocietyDto>('/admin/societies', v),
    [['admin'], ['public', 'societies']],
  );
  const form = useForm<In, unknown, Out>({
    resolver: zodResolver(societyInputSchema),
    defaultValues: {
      name: society?.name ?? fromUnlisted?.name ?? '',
      area: society?.area ?? fromUnlisted?.area ?? '',
      city: society?.city ?? fromUnlisted?.city ?? 'Pune',
      pincode: society?.pincode ?? fromUnlisted?.pincode ?? '',
      addressLine: society?.addressLine ?? '',
      notes: society?.notes ?? '',
      defaultWasherId: society?.defaultWasherId ?? null,
      isActive: society?.isActive ?? true,
      linkUnlistedName: fromUnlisted?.name ?? null,
    },
  });
  const { register, handleSubmit, formState, setError, watch, setValue } = form;
  const e = formState.errors;
  const washerId = watch('defaultWasherId');
  return (
    <Sheet
      open
      onClose={onClose}
      title={society ? `Edit ${society.name}` : 'Onboard a society'}
      wide
    >
      <form
        noValidate
        className="flex flex-col gap-4"
        onSubmit={handleSubmit(async (v) => {
          try {
            const s = await save.mutateAsync(v);
            toast(
              society
                ? 'Society saved'
                : `${s.name} onboarded${s.customers ? ` · ${plural(s.customers, 'customer')} linked` : ''}`,
            );
            onClose();
          } catch (err) {
            if (!applyServerErrors(err, setError, ['name', 'area', 'city', 'pincode'])) {
              setError('root', { message: (err as Error).message });
            }
          }
        })}
      >
        {fromUnlisted ? (
          <Notice>
            {plural(fromUnlisted.customers, 'customer')} typed “{fromUnlisted.name}”. They’ll be
            linked to this society.
          </Notice>
        ) : null}
        <Field label="Society name" htmlFor="sname" error={e.name?.message}>
          <Input
            id="sname"
            placeholder="Kumar Pebble Park"
            {...register('name')}
            invalid={!!e.name}
          />
        </Field>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Area" htmlFor="sarea" error={e.area?.message}>
            <Input id="sarea" placeholder="Hadapsar" {...register('area')} invalid={!!e.area} />
          </Field>
          <Field label="City" htmlFor="scity" error={e.city?.message}>
            <Input id="scity" {...register('city')} invalid={!!e.city} />
          </Field>
          <Field label="Pincode" htmlFor="spin" error={e.pincode?.message}>
            <Input id="spin" inputMode="numeric" {...register('pincode')} invalid={!!e.pincode} />
          </Field>
        </div>
        <Field label="Address / landmark (optional)" htmlFor="sline">
          <Input id="sline" placeholder="Near Magarpatta gate" {...register('addressLine')} />
        </Field>
        <Field
          label="Default washer"
          htmlFor="swasher"
          hint="Pre-selected when you activate a plan for someone in this society"
        >
          <WasherSelect
            id="swasher"
            value={washerId ? String(washerId) : ''}
            onChange={(ev) =>
              setValue('defaultWasherId', ev.target.value ? Number(ev.target.value) : null)
            }
          />
        </Field>
        <Field label="Notes for washers / admins (optional)" htmlFor="snotes">
          <Textarea
            id="snotes"
            placeholder="Gate 2 entry, security needs name list"
            {...register('notes')}
            className="min-h-16"
          />
        </Field>
        <Checkbox
          label="Society is active"
          hint="Inactive societies are hidden from customers at sign-up"
          {...register('isActive')}
        />
        <FormError error={e.root?.message} />
        <Button type="submit" variant="cta" size="lg" loading={formState.isSubmitting}>
          {society ? 'Save society' : 'Onboard society'}
        </Button>
      </form>
    </Sheet>
  );
}

export function AssignSocietyWasherSheet({
  society,
  onClose,
}: {
  society: SocietyDto;
  onClose: () => void;
}) {
  const toast = useToast();
  const [washerId, setWasherId] = useState(
    society.defaultWasherId ? String(society.defaultWasherId) : '',
  );
  const [onlyUnassigned, setOnlyUnassigned] = useState(false);
  const [makeDefault, setMakeDefault] = useState(true);
  const assign = useApiMutation(
    (b: unknown) =>
      api.post<{ updated: number }>(`/admin/societies/${society.id}/assign-washer`, b),
    [['admin']],
  );
  const affected = onlyUnassigned ? society.unassigned : society.activeSubscriptions;
  return (
    <Sheet open onClose={onClose} title={`Washer for ${society.name}`}>
      <div className="flex flex-col gap-4">
        <p className="text-sm text-muted">
          {plural(society.activeSubscriptions, 'running plan')} in this society
          {society.unassigned ? `, ${society.unassigned} without a washer` : ''}.
        </p>
        <Field label="Washer" htmlFor="awasher">
          <WasherSelect
            id="awasher"
            emptyLabel="No washer (unassign)"
            value={washerId}
            onChange={(e) => setWasherId(e.target.value)}
          />
        </Field>
        <Checkbox
          label="Only plans without a washer"
          hint="Leave others with their current washer"
          checked={onlyUnassigned}
          onChange={(e) => setOnlyUnassigned(e.target.checked)}
        />
        <Checkbox
          label="Make this the society’s default washer"
          hint="Used for new plans in this society"
          checked={makeDefault}
          onChange={(e) => setMakeDefault(e.target.checked)}
        />
        <FormError error={assign.error} />
        <Button
          variant="cta"
          size="lg"
          loading={assign.isPending}
          onClick={async () => {
            try {
              const r = await assign.mutateAsync({
                washerId: washerId ? Number(washerId) : null,
                onlyUnassigned,
                makeDefault,
              });
              toast(`${plural(r.updated, 'plan')} updated`);
              onClose();
            } catch {
              /* shown */
            }
          }}
        >
          Apply to {plural(affected, 'plan')}
        </Button>
      </div>
    </Sheet>
  );
}

function SocietyCard({
  s,
  onEdit,
  onAssign,
}: {
  s: SocietyDto;
  onEdit: () => void;
  onAssign: () => void;
}) {
  return (
    <Card className="flex flex-col gap-3">
      <div className="flex justify-between items-start gap-3">
        <div className="min-w-0">
          <Link
            to={`/admin/societies/${s.id}`}
            className="font-display font-semibold text-lg text-ink no-underline"
          >
            {s.name}
          </Link>
          <div className="text-sm text-muted flex items-center gap-1">
            <MapPin size={14} className="shrink-0" /> {s.area}, {s.city} {s.pincode}
          </div>
        </div>
        {s.isActive ? <Badge tone="active">Active</Badge> : <Badge tone="muted">Inactive</Badge>}
      </div>
      <div className="grid grid-cols-3 gap-2 text-center">
        {[
          ['Customers', s.customers],
          ['Vehicles', s.vehicles],
          ['Running plans', s.activeSubscriptions],
        ].map(([k, v]) => (
          <div key={k} className="bg-canvas rounded-xl py-2">
            <div className="font-display font-bold text-lg">{v}</div>
            <div className="text-xs text-muted">{k}</div>
          </div>
        ))}
      </div>
      <div className="text-sm">
        <span className="text-muted">Default washer: </span>
        <b>{s.defaultWasherName ?? 'None'}</b>
        {s.washers.length ? (
          <div className="text-[13px] text-muted mt-0.5">
            Covering now: {s.washers.map((w) => `${w.name} (${w.count})`).join(', ')}
          </div>
        ) : null}
        {s.unassigned ? (
          <div className="text-[13px] font-semibold text-danger mt-0.5">
            {plural(s.unassigned, 'plan')} without a washer
          </div>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-1.5 dotted-top pt-3">
        <LinkButton size="sm" variant="ghost" to={`/admin/societies/${s.id}`}>
          View
        </LinkButton>
        <span className="flex-1" />
        <Button size="sm" variant="ghost" onClick={onEdit}>
          Edit
        </Button>
        <Button size="sm" onClick={onAssign}>
          Assign washer
        </Button>
      </div>
    </Card>
  );
}

export function Societies() {
  const q = useSocieties();
  const unlisted = useApi<UnlistedSociety[]>(
    ['admin', 'societies', 'unlisted'],
    '/admin/societies/unlisted',
  );
  const [creating, setCreating] = useState<{ from?: UnlistedSociety } | null>(null);
  const [editing, setEditing] = useState<SocietyDto | null>(null);
  const [assigning, setAssigning] = useState<SocietyDto | null>(null);

  return (
    <>
      <PageTitle
        title="Societies"
        actions={
          <Button variant="cta" className="h-[46px] rounded-xl" onClick={() => setCreating({})}>
            <Plus size={18} /> Onboard society
          </Button>
        }
      />

      {unlisted.data?.length ? (
        <Card>
          <CardHeader
            title="Not yet onboarded"
            sub="Society names customers typed at sign-up. Onboard them to group their vehicles and assign a washer."
          />
          <Table head={['Typed name', 'Area', 'Customers', 'Running plans', '']} minWidth={560}>
            {unlisted.data.map((u) => (
              <Tr key={u.key}>
                <Td className="font-semibold">{u.name}</Td>
                <Td>{[u.area, u.pincode].filter(Boolean).join(' · ') || '—'}</Td>
                <Td>{u.customers}</Td>
                <Td>{u.activeSubscriptions}</Td>
                <Td>
                  <Button size="sm" variant="cta" onClick={() => setCreating({ from: u })}>
                    Onboard
                  </Button>
                </Td>
              </Tr>
            ))}
          </Table>
        </Card>
      ) : null}

      <QueryView query={q}>
        {(list) =>
          list.length ? (
            <div className="grid gap-3.5 md:grid-cols-2 xl:grid-cols-3">
              {list.map((s) => (
                <SocietyCard
                  key={s.id}
                  s={s}
                  onEdit={() => setEditing(s)}
                  onAssign={() => setAssigning(s)}
                />
              ))}
            </div>
          ) : (
            <Card>
              <EmptyState
                icon={<UsersIcon size={24} />}
                title="No societies yet"
                action={
                  <Button variant="cta" onClick={() => setCreating({})}>
                    Onboard a society
                  </Button>
                }
              >
                Add the societies you serve. Customers pick theirs at sign-up, and you can give each
                a default washer.
              </EmptyState>
            </Card>
          )
        }
      </QueryView>

      {creating ? (
        <SocietySheet fromUnlisted={creating.from} onClose={() => setCreating(null)} />
      ) : null}
      {editing ? <SocietySheet society={editing} onClose={() => setEditing(null)} /> : null}
      {assigning ? (
        <AssignSocietyWasherSheet society={assigning} onClose={() => setAssigning(null)} />
      ) : null}
    </>
  );
}

export function SocietyDetailPage() {
  const id = Number(useParams().id);
  const q = useApi<SocietyDetail>(['admin', 'societies', id], `/admin/societies/${id}`);
  const [editing, setEditing] = useState(false);
  const [assigning, setAssigning] = useState(false);
  return (
    <QueryView query={q}>
      {(d) => (
        <>
          <PageTitle
            eyebrow={<Link to="/admin/societies">Societies</Link>}
            title={d.society.name}
            actions={
              <>
                <Button className="h-[46px] rounded-xl" onClick={() => setEditing(true)}>
                  Edit
                </Button>
                <Button
                  variant="cta"
                  className="h-[46px] rounded-xl"
                  onClick={() => setAssigning(true)}
                >
                  Assign washer
                </Button>
              </>
            }
          />
          <div className="text-sm text-muted -mt-3">
            {[d.society.addressLine, d.society.area, d.society.city, d.society.pincode]
              .filter(Boolean)
              .join(', ')}
            {!d.society.isActive ? ' · inactive (hidden at sign-up)' : ''}
          </div>
          {d.society.notes ? <Notice>{d.society.notes}</Notice> : null}

          <section className="grid gap-3.5 grid-cols-2 xl:grid-cols-4">
            <Stat
              label="Default washer"
              value={d.society.defaultWasherName ?? '—'}
              sub={
                d.society.washers.map((w) => `${w.name} (${w.count})`).join(', ') || 'No plans yet'
              }
            />
            <Stat
              label="Running plans"
              value={d.society.activeSubscriptions}
              sub={plural(d.society.vehicles, 'vehicle')}
            />
            <Stat
              label="Without a washer"
              value={d.society.unassigned}
              tone={d.society.unassigned ? 'danger' : undefined}
              sub={
                d.society.unassigned ? (
                  <button
                    type="button"
                    className="font-semibold text-accent-ink"
                    onClick={() => setAssigning(true)}
                  >
                    Assign now
                  </button>
                ) : (
                  'All covered'
                )
              }
            />
            <div className="bg-white rounded-[18px] p-[18px] shadow-card flex flex-col gap-2">
              <div className="text-[13px] text-muted">Today</div>
              <div className="font-display text-[28px] font-bold leading-tight">
                {d.today.done}{' '}
                <span className="text-base text-muted font-sans font-normal">
                  of {d.today.due} done
                </span>
              </div>
              <Progress
                value={d.today.done}
                max={d.today.due}
                label="Today’s washes in this society"
                height={8}
              />
              {d.today.behind ? (
                <div className="text-[13px] font-semibold text-danger flex items-center gap-1">
                  <Alert size={14} /> {d.today.behind} behind schedule
                </div>
              ) : null}
            </div>
          </section>

          <Card>
            <CardHeader
              title="Running and upcoming plans"
              sub="Change a single vehicle’s washer here, or all of them with Assign washer."
            />
            {d.subscriptions.length ? (
              <SubscriptionRows items={d.subscriptions} />
            ) : (
              <EmptyState title="No plans in this society yet" />
            )}
          </Card>

          <Card>
            <CardHeader title="Customers" sub={plural(d.customers.length, 'customer')} />
            {d.customers.length ? (
              <Table head={['Name', 'Flat', 'Mobile', 'Status']} minWidth={480}>
                {d.customers.map((u) => (
                  <Tr key={u.id}>
                    <Td>
                      <Link to={`/admin/users/${u.id}`} className="font-semibold no-underline">
                        {u.name}
                      </Link>
                    </Td>
                    <Td>{u.flatOrHouseNo ?? '—'}</Td>
                    <Td>{u.mobile}</Td>
                    <Td>
                      {u.isActive ? (
                        <Badge tone="active">Active</Badge>
                      ) : (
                        <Badge tone="muted">Deactivated</Badge>
                      )}
                    </Td>
                  </Tr>
                ))}
              </Table>
            ) : (
              <EmptyState title="No customers linked yet" />
            )}
          </Card>

          {editing ? <SocietySheet society={d.society} onClose={() => setEditing(false)} /> : null}
          {assigning ? (
            <AssignSocietyWasherSheet society={d.society} onClose={() => setAssigning(false)} />
          ) : null}
        </>
      )}
    </QueryView>
  );
}
