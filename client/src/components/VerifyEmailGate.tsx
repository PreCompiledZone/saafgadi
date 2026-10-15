import { zodResolver } from '@hookform/resolvers/zod';
import { requiredEmail } from '@shared/schemas';
import type { SessionUser } from '@shared/types';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { api } from '../api/client';
import { useAuthActions } from '../lib/auth';
import { applyServerErrors } from '../lib/forms';
import { EmailVerify } from './EmailVerify';
import { Mail } from './icons';
import { Button, Field, FormError, Input } from './ui';

const emailForm = z.object({ email: requiredEmail });

/** Add or change the email before verifying it. */
function EmailForm({
  initial,
  onSaved,
  onCancel,
}: {
  initial: string;
  onSaved: (user: SessionUser) => void;
  onCancel?: () => void;
}) {
  const form = useForm<z.input<typeof emailForm>, unknown, z.output<typeof emailForm>>({
    resolver: zodResolver(emailForm),
    defaultValues: { email: initial },
  });
  const submit = form.handleSubmit(async (v) => {
    try {
      const { user } = await api.put<{ user: SessionUser }>('/auth/email', v);
      onSaved(user);
    } catch (err) {
      if (!applyServerErrors(err as never, form.setError, ['email'])) {
        form.setError('root', { message: (err as Error).message });
      }
    }
  });
  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-4">
      <Field label="Email" htmlFor="gate-email" error={form.formState.errors.email?.message}>
        <Input
          id="gate-email"
          type="email"
          autoComplete="email"
          autoFocus
          {...form.register('email')}
          invalid={!!form.formState.errors.email}
        />
      </Field>
      <FormError error={form.formState.errors.root?.message} />
      <Button type="submit" variant="cta" size="lg" block loading={form.formState.isSubmitting}>
        Send code
      </Button>
      {onCancel ? (
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      ) : null}
    </form>
  );
}

/**
 * Shown instead of the customer app until a self-signed-up customer verifies an
 * email: add one if missing, get a code, enter it, continue.
 */
export function VerifyEmailGate({ user }: { user: SessionUser }) {
  const { signedIn, logout } = useAuthActions();
  const navigate = useNavigate();
  const [editing, setEditing] = useState(!user.email);

  return (
    <div className="pt-6 flex flex-col gap-5">
      <div className="flex flex-col items-center text-center gap-3">
        <span className="w-16 h-16 rounded-2xl bg-accent-soft-2 text-accent-deep flex items-center justify-center">
          <Mail size={30} />
        </span>
        <h1 className="text-[27px] font-bold tracking-[-0.5px]">Verify your email to continue</h1>
        <p className="text-[15px] text-muted">
          {user.email
            ? 'We need to check your email before you continue. It’s also how you’ll reset your password.'
            : 'Add your email so we can verify it. It’s also how you’ll reset your password.'}
        </p>
      </div>
      <div className="bg-white rounded-[20px] p-[18px] shadow-card">
        {editing ? (
          <EmailForm
            initial={user.email ?? ''}
            onCancel={user.email ? () => setEditing(false) : undefined}
            onSaved={async (u) => {
              await signedIn(u);
              setEditing(false);
            }}
          />
        ) : (
          <EmailVerify
            key={user.email}
            email={user.email ?? ''}
            autoSend
            onVerified={(u) => signedIn(u)}
          />
        )}
      </div>
      {!editing ? (
        <button
          type="button"
          className="self-center p-2 text-[15px] font-semibold text-accent-ink"
          onClick={() => setEditing(true)}
        >
          Wrong email? Change it
        </button>
      ) : null}
      <button
        type="button"
        className="self-center p-2 text-sm text-muted"
        onClick={async () => {
          await logout();
          navigate('/login', { replace: true });
        }}
      >
        Log out
      </button>
    </div>
  );
}
