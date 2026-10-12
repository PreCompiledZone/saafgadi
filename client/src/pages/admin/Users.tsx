import { zodResolver } from '@hookform/resolvers/zod';
import { LABELS } from '@shared/enums';
import { staffCreateSchema } from '@shared/schemas';
import type { Paged, UserDto } from '@shared/types';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate, useSearchParams } from 'react-router-dom';
import type { z } from 'zod';
import { api, qs } from '../../api/client';
import { useApi, useApiMutation } from '../../api/hooks';
import { Pagination } from '../../components/Pagination';
import { Plus } from '../../components/icons';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  FormError,
  Input,
  PageTitle,
  QueryView,
  Sheet,
  useToast,
} from '../../components/ui';
import { fullDate } from '../../lib/format';
import { applyServerErrors } from '../../lib/forms';
import { SearchBox, Table, Td, Tr } from './parts';

type StaffIn = z.input<typeof staffCreateSchema>;
type StaffOut = z.output<typeof staffCreateSchema>;

/** Create a customer / washer / admin account (name, mobile, password). */
export function CreateAccountSheet({
  open,
  onClose,
  title,
  endpoint,
  onCreated,
  extraBody,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  endpoint: string;
  onCreated?: (u: UserDto) => void;
  extraBody?: Record<string, unknown>;
}) {
  const toast = useToast();
  const create = useApiMutation(
    (v: StaffOut) => api.post<UserDto>(endpoint, { ...v, ...extraBody }),
    [['admin']],
  );
  const form = useForm<StaffIn, unknown, StaffOut>({
    resolver: zodResolver(staffCreateSchema),
    defaultValues: { name: '', mobile: '', email: '', password: '' },
  });
  const { register, handleSubmit, formState, setError, reset } = form;
  const e = formState.errors;
  return (
    <Sheet open={open} onClose={onClose} title={title}>
      <form
        noValidate
        className="flex flex-col gap-4"
        onSubmit={handleSubmit(async (v) => {
          try {
            const u = await create.mutateAsync(v);
            toast(`${u.name} created`);
            reset();
            onClose();
            onCreated?.(u);
          } catch (err) {
            if (!applyServerErrors(err, setError, ['name', 'mobile', 'email', 'password'])) {
              setError('root', { message: (err as Error).message });
            }
          }
        })}
      >
        <Field label="Name" htmlFor="cname" error={e.name?.message}>
          <Input id="cname" {...register('name')} invalid={!!e.name} />
        </Field>
        <Field label="Mobile (used to log in)" htmlFor="cmobile" error={e.mobile?.message}>
          <Input
            id="cmobile"
            type="tel"
            inputMode="numeric"
            {...register('mobile')}
            invalid={!!e.mobile}
          />
        </Field>
        <Field label="Email (optional)" htmlFor="cemail" error={e.email?.message}>
          <Input id="cemail" type="email" {...register('email')} invalid={!!e.email} />
        </Field>
        <Field
          label="Password"
          htmlFor="cpass"
          error={e.password?.message}
          hint="At least 8 characters. Share it with them directly."
        >
          <Input
            id="cpass"
            type="text"
            autoComplete="new-password"
            {...register('password')}
            invalid={!!e.password}
          />
        </Field>
        <FormError error={e.root?.message} />
        <Button type="submit" variant="cta" size="lg" loading={formState.isSubmitting}>
          Create
        </Button>
      </form>
    </Sheet>
  );
}

export function ResetPasswordSheet({
  user,
  endpoint,
  onClose,
}: {
  user: UserDto;
  endpoint: string;
  onClose: () => void;
}) {
  const toast = useToast();
  const [password, setPassword] = useState('');
  const reset = useApiMutation((p: string) => api.post(endpoint, { password: p }));
  return (
    <Sheet open onClose={onClose} title={`Reset password for ${user.name}`}>
      <div className="flex flex-col gap-4">
        <Field
          label="New password"
          htmlFor="rp"
          hint="At least 8 characters. Share it with them directly."
        >
          <Input
            id="rp"
            type="text"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        <FormError error={reset.error} />
        <Button
          variant="cta"
          size="lg"
          disabled={password.length < 8}
          loading={reset.isPending}
          onClick={async () => {
            try {
              await reset.mutateAsync(password);
              toast('Password reset');
              onClose();
            } catch {
              /* shown */
            }
          }}
        >
          Set password
        </Button>
      </div>
    </Sheet>
  );
}

export function Users() {
  const [params, setParams] = useSearchParams();
  const search = params.get('search') ?? '';
  const page = Number(params.get('page')) || 1;
  const [creating, setCreating] = useState(false);
  const navigate = useNavigate();
  const q = useApi<Paged<UserDto>>(
    ['admin', 'users', search, page],
    `/admin/users${qs({ search, page, pageSize: 25 })}`,
  );
  return (
    <>
      <PageTitle
        title="Users"
        eyebrow="Customers"
        actions={
          <Button variant="cta" className="h-[46px] rounded-xl" onClick={() => setCreating(true)}>
            <Plus size={18} /> Add customer
          </Button>
        }
      />
      <SearchBox
        className="md:max-w-md"
        value={search}
        onChange={(v) => setParams(v ? { search: v } : {}, { replace: true })}
        placeholder="Search name, mobile or vehicle number"
      />
      <Card>
        <QueryView query={q}>
          {(d) =>
            d.items.length ? (
              <>
                <Table head={['Name', 'Mobile', 'Society / flat', 'Area', 'Joined', 'Status']}>
                  {d.items.map((u) => (
                    <Tr key={u.id} onClick={() => navigate(`/admin/users/${u.id}`)}>
                      <Td className="font-semibold">{u.name}</Td>
                      <Td>{u.mobile}</Td>
                      <Td>
                        {[u.societyOrBuilding, u.flatOrHouseNo].filter(Boolean).join(', ') || '—'}
                      </Td>
                      <Td>{u.area ?? '—'}</Td>
                      <Td className="whitespace-nowrap">{fullDate(u.createdAt.slice(0, 10))}</Td>
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
                <Pagination
                  page={d.page}
                  pageSize={d.pageSize}
                  total={d.total}
                  onPage={(p) =>
                    setParams({ ...(search ? { search } : {}), page: String(p) }, { replace: true })
                  }
                />
              </>
            ) : (
              <EmptyState title={search ? `No customers match “${search}”` : 'No customers yet'} />
            )
          }
        </QueryView>
      </Card>
      <CreateAccountSheet
        open={creating}
        onClose={() => setCreating(false)}
        title={`Add ${LABELS.role.USER.toLowerCase()}`}
        endpoint="/admin/users"
        onCreated={(u) => navigate(`/admin/users/${u.id}`)}
      />
    </>
  );
}
