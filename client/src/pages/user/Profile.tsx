import { zodResolver } from '@hookform/resolvers/zod';
import { profileUpdateSchema } from '@shared/schemas';
import type { UserDto } from '@shared/types';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router-dom';
import type { z } from 'zod';
import { api } from '../../api/client';
import { useApi, useApiMutation } from '../../api/hooks';
import {
  Button,
  Card,
  CardHeader,
  Field,
  FormError,
  Input,
  PageTitle,
  QueryView,
  useToast,
} from '../../components/ui';
import { applyServerErrors } from '../../lib/forms';
import { SocietyField } from '../../components/SocietyField';
import { ChangePasswordCard } from '../shared/ChangePassword';
import { LogoutButton } from '../shared/LogoutButton';

type In = z.input<typeof profileUpdateSchema>;
type Out = z.output<typeof profileUpdateSchema>;

function ProfileForm({ user }: { user: UserDto }) {
  const toast = useToast();
  const save = useApiMutation(
    (v: Out) => api.put<UserDto>('/me/profile', v),
    [['me'], ['auth', 'me']],
  );
  const form = useForm<In, unknown, Out>({
    resolver: zodResolver(profileUpdateSchema),
    defaultValues: {
      name: user.name,
      email: user.email ?? '',
      societyId: user.societyId,
      societyOrBuilding: user.societyId ? '' : (user.societyOrBuilding ?? ''),
      flatOrHouseNo: user.flatOrHouseNo ?? '',
      addressLine: user.addressLine ?? '',
      area: user.area ?? '',
      city: user.city ?? '',
      pincode: user.pincode ?? '',
    },
  });
  const { register, handleSubmit, formState, setError } = form;
  const e = formState.errors;
  return (
    <Card>
      <CardHeader title="Your details" sub={`Mobile ${user.mobile} — ask us to change it`} />
      <form
        noValidate
        className="flex flex-col gap-4"
        onSubmit={handleSubmit(async (v) => {
          try {
            await save.mutateAsync(v);
            toast('Details saved');
          } catch (err) {
            if (
              !applyServerErrors(err, setError, ['name', 'email', 'societyId', 'societyOrBuilding'])
            )
              setError('root', { message: (err as Error).message });
          }
        })}
      >
        <Field label="Name" htmlFor="name" error={e.name?.message}>
          <Input id="name" {...register('name')} invalid={!!e.name} />
        </Field>
        <Field label="Email (optional)" htmlFor="email" error={e.email?.message}>
          <Input id="email" type="email" {...register('email')} invalid={!!e.email} />
        </Field>
        <SocietyField form={form} />
        <div className="grid grid-cols-2 gap-2.5">
          <Field label="Flat / house no." htmlFor="flat" error={e.flatOrHouseNo?.message}>
            <Input id="flat" {...register('flatOrHouseNo')} invalid={!!e.flatOrHouseNo} />
          </Field>
          <Field label="Pincode" htmlFor="pin" error={e.pincode?.message}>
            <Input id="pin" inputMode="numeric" {...register('pincode')} invalid={!!e.pincode} />
          </Field>
        </div>
        <Field label="Street / landmark" htmlFor="line">
          <Input id="line" {...register('addressLine')} />
        </Field>
        <div className="grid grid-cols-2 gap-2.5">
          <Field label="Area" htmlFor="area" error={e.area?.message}>
            <Input id="area" {...register('area')} invalid={!!e.area} />
          </Field>
          <Field label="City" htmlFor="city" error={e.city?.message}>
            <Input id="city" {...register('city')} invalid={!!e.city} />
          </Field>
        </div>
        <FormError error={e.root?.message} />
        <Button type="submit" variant="cta" loading={formState.isSubmitting}>
          Save details
        </Button>
      </form>
    </Card>
  );
}

export function Profile() {
  const q = useApi<UserDto>(['me', 'profile'], '/me/profile');
  return (
    <div className="flex flex-col gap-3.5 pt-1">
      <PageTitle title="Profile" />
      <QueryView query={q}>{(u) => <ProfileForm user={u} />}</QueryView>
      <ChangePasswordCard />
      <Card className="flex flex-col gap-2 text-[15px]">
        <Link to="/app/enquiries" className="font-semibold no-underline py-1">
          My enquiries
        </Link>
        <Link to="/app/vehicles" className="font-semibold no-underline py-1">
          My vehicles
        </Link>
      </Card>
      <LogoutButton />
    </div>
  );
}
