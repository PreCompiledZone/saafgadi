import { zodResolver } from '@hookform/resolvers/zod';
import { changePasswordSchema } from '@shared/schemas';
import { useForm } from 'react-hook-form';
import type { z } from 'zod';
import { api } from '../../api/client';
import { Button, Card, CardHeader, Field, FormError, Input, useToast } from '../../components/ui';
import { applyServerErrors } from '../../lib/forms';

type Values = z.input<typeof changePasswordSchema>;

export function ChangePasswordCard() {
  const toast = useToast();
  const form = useForm<Values>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: { currentPassword: '', newPassword: '' },
  });
  const { register, handleSubmit, formState, setError, reset } = form;
  const e = formState.errors;
  return (
    <Card>
      <CardHeader title="Change password" />
      <form
        noValidate
        className="flex flex-col gap-4"
        onSubmit={handleSubmit(async (v) => {
          try {
            await api.post('/auth/change-password', v);
            reset();
            toast('Password changed');
          } catch (err) {
            if (!applyServerErrors(err, setError, ['currentPassword', 'newPassword'])) {
              setError('root', { message: (err as Error).message });
            }
          }
        })}
      >
        <Field label="Current password" htmlFor="cur" error={e.currentPassword?.message}>
          <Input
            id="cur"
            type="password"
            autoComplete="current-password"
            {...register('currentPassword')}
            invalid={!!e.currentPassword}
          />
        </Field>
        <Field
          label="New password"
          htmlFor="new"
          error={e.newPassword?.message}
          hint="At least 8 characters"
        >
          <Input
            id="new"
            type="password"
            autoComplete="new-password"
            {...register('newPassword')}
            invalid={!!e.newPassword}
          />
        </Field>
        <FormError error={e.root?.message} />
        <Button type="submit" variant="secondary" loading={formState.isSubmitting}>
          Update password
        </Button>
      </form>
    </Card>
  );
}
