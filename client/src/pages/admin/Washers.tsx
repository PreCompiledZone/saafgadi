import { zodResolver } from '@hookform/resolvers/zod';
import { staffUpdateSchema } from '@shared/schemas';
import type { SubscriptionDto, UserDto, WasherDto } from '@shared/types';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import type { z } from 'zod';
import { api } from '../../api/client';
import { useApi, useApiMutation } from '../../api/hooks';
import { Plus } from '../../components/icons';
import {
  Badge,
  Button,
  Card,
  Checkbox,
  EmptyState,
  Field,
  FormError,
  Input,
  PageTitle,
  Progress,
  QueryView,
  Sheet,
  useToast,
} from '../../components/ui';
import { shortDate } from '../../lib/format';
import { applyServerErrors } from '../../lib/forms';
import { useWashers } from './parts';
import { CreateAccountSheet, ResetPasswordSheet } from './Users';

type In = z.input<typeof staffUpdateSchema>;
type Out = z.output<typeof staffUpdateSchema>;

/** Edit name / mobile / email / active for a washer or admin. */
export function EditStaffSheet({
  user,
  endpoint,
  onClose,
}: {
  user: UserDto;
  endpoint: string;
  onClose: () => void;
}) {
  const toast = useToast();
  const save = useApiMutation((v: Out) => api.put(endpoint, v), [['admin']]);
  const form = useForm<In, unknown, Out>({
    resolver: zodResolver(staffUpdateSchema),
    defaultValues: {
      name: user.name,
      mobile: user.mobile,
      email: user.email ?? '',
      isActive: user.isActive,
    },
  });
  const { register, handleSubmit, formState, setError } = form;
  const e = formState.errors;
  return (
    <Sheet open onClose={onClose} title={`Edit ${user.name}`}>
      <form
        noValidate
        className="flex flex-col gap-4"
        onSubmit={handleSubmit(async (v) => {
          try {
            await save.mutateAsync(v);
            toast('Saved');
            onClose();
          } catch (err) {
            if (!applyServerErrors(err, setError, ['name', 'mobile', 'email']))
              setError('root', { message: (err as Error).message });
          }
        })}
      >
        <Field label="Name" htmlFor="ename" error={e.name?.message}>
          <Input id="ename" {...register('name')} invalid={!!e.name} />
        </Field>
        <Field label="Mobile" htmlFor="emobile" error={e.mobile?.message}>
          <Input id="emobile" type="tel" {...register('mobile')} invalid={!!e.mobile} />
        </Field>
        <Field label="Email (optional)" htmlFor="eemail" error={e.email?.message}>
          <Input id="eemail" type="email" {...register('email')} invalid={!!e.email} />
        </Field>
        <Checkbox
          label="Account is active"
          hint="Deactivated accounts can't log in"
          {...register('isActive')}
        />
        <FormError error={e.root?.message} />
        <Button type="submit" variant="cta" size="lg" loading={formState.isSubmitting}>
          Save
        </Button>
      </form>
    </Sheet>
  );
}

function AssignedSheet({ washer, onClose }: { washer: WasherDto; onClose: () => void }) {
  const q = useApi<{ assigned: SubscriptionDto[] }>(
    ['admin', 'washers', washer.id],
    `/admin/washers/${washer.id}`,
  );
  return (
    <Sheet open onClose={onClose} title={`${washer.name}’s vehicles`} wide>
      <QueryView query={q}>
        {(d) =>
          d.assigned.length ? (
            <ul className="flex flex-col gap-2">
              {d.assigned.map((s) => (
                <li key={s.id} className="bg-white rounded-[14px] p-3 flex justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-bold plate">{s.registrationNumber}</div>
                    <div className="text-[13px] text-muted truncate">
                      {s.vehicleLabel} · {s.userName}
                    </div>
                  </div>
                  <div className="text-[13px] text-muted text-right whitespace-nowrap">
                    {s.planName.replace(/ plan$/i, '')}
                    <br />
                    till {shortDate(s.endDate)}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="No vehicles assigned">
              Assign vehicles from Subscriptions or Vehicles.
            </EmptyState>
          )
        }
      </QueryView>
    </Sheet>
  );
}

export function Washers() {
  const q = useWashers();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<WasherDto | null>(null);
  const [resetting, setResetting] = useState<WasherDto | null>(null);
  const [viewing, setViewing] = useState<WasherDto | null>(null);
  return (
    <>
      <PageTitle
        title="Washers"
        actions={
          <Button variant="cta" className="h-[46px] rounded-xl" onClick={() => setCreating(true)}>
            <Plus size={18} /> Add washer
          </Button>
        }
      />
      <QueryView query={q}>
        {(list) =>
          list.length ? (
            <div className="grid gap-3.5 md:grid-cols-2 xl:grid-cols-3">
              {list.map((w) => (
                <Card key={w.id} className="flex flex-col gap-3">
                  <div className="flex justify-between items-start gap-3">
                    <div>
                      <div className="font-display font-semibold text-lg">{w.name}</div>
                      <div className="text-sm text-muted">{w.mobile}</div>
                    </div>
                    {w.isActive ? (
                      <Badge tone="active">Active</Badge>
                    ) : (
                      <Badge tone="muted">Deactivated</Badge>
                    )}
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <div className="flex justify-between text-sm">
                      <span>Today</span>
                      <span className="text-muted">
                        {w.today.done} of {w.today.due} done
                        {w.today.notDone ? ` · ${w.today.notDone} not done` : ''}
                      </span>
                    </div>
                    <Progress
                      value={w.today.done}
                      max={w.today.due}
                      label={`${w.name} today`}
                      height={8}
                    />
                    {w.today.behind ? (
                      <div className="text-[13px] font-semibold text-danger">
                        {w.today.behind} behind schedule
                      </div>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-1.5 dotted-top pt-3">
                    <Button size="sm" variant="ghost" onClick={() => setViewing(w)}>
                      {w.assignedCount} assigned
                    </Button>
                    <span className="flex-1" />
                    <Button size="sm" variant="ghost" onClick={() => setResetting(w)}>
                      Reset password
                    </Button>
                    <Button size="sm" onClick={() => setEditing(w)}>
                      Edit
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          ) : (
            <Card>
              <EmptyState
                title="No washers yet"
                action={
                  <Button variant="cta" onClick={() => setCreating(true)}>
                    Add washer
                  </Button>
                }
              >
                Create an account for each washer. They log in with their mobile number.
              </EmptyState>
            </Card>
          )
        }
      </QueryView>
      <CreateAccountSheet
        open={creating}
        onClose={() => setCreating(false)}
        title="Add washer"
        endpoint="/admin/washers"
      />
      {editing ? (
        <EditStaffSheet
          user={editing}
          endpoint={`/admin/washers/${editing.id}`}
          onClose={() => setEditing(null)}
        />
      ) : null}
      {resetting ? (
        <ResetPasswordSheet
          user={resetting}
          endpoint={`/admin/washers/${resetting.id}/reset-password`}
          onClose={() => setResetting(null)}
        />
      ) : null}
      {viewing ? <AssignedSheet washer={viewing} onClose={() => setViewing(null)} /> : null}
    </>
  );
}
