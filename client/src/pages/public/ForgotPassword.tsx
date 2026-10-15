import { zodResolver } from '@hookform/resolvers/zod';
import { passwordSchema, requiredEmail } from '@shared/schemas';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router-dom';
import { z } from 'zod';
import { api } from '../../api/client';
import { Logo } from '../../components/brand';
import { CodeInput } from '../../components/CodeInput';
import { ContactButtons } from '../../components/contact';
import { retryAfter, SendError, useCountdown } from '../../components/EmailVerify';
import { CheckCircle } from '../../components/icons';
import { Button, Field, FormError, Input, LinkButton } from '../../components/ui';
import { applyServerErrors } from '../../lib/forms';

const emailForm = z.object({ email: requiredEmail });

const resetForm = z
  .object({
    code: z.string().regex(/^\d{6}$/, 'Enter the 6-digit code'),
    newPassword: passwordSchema,
    confirm: z.string(),
  })
  .refine((v) => v.newPassword === v.confirm, {
    path: ['confirm'],
    message: 'Passwords don’t match',
  });

/** Forgot password: email → code + new password → done. */
export function ForgotPassword() {
  const [email, setEmail] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [left, setLeft] = useCountdown();
  const [sendError, setSendError] = useState<unknown>(null);
  const [sending, setSending] = useState(false);

  async function send(to: string) {
    setSending(true);
    setSendError(null);
    try {
      await api.post('/auth/otp/send', { email: to, purpose: 'RESET_PASSWORD' });
      setEmail(to);
      setLeft(60);
    } catch (err) {
      const wait = retryAfter(err);
      if (wait) {
        setLeft(wait);
        setEmail(to); // a recent code is still valid
      }
      setSendError(err);
    } finally {
      setSending(false);
    }
  }

  const first = useForm<z.input<typeof emailForm>, unknown, z.output<typeof emailForm>>({
    resolver: zodResolver(emailForm),
    defaultValues: { email: '' },
  });
  const second = useForm<z.input<typeof resetForm>, unknown, z.output<typeof resetForm>>({
    resolver: zodResolver(resetForm),
    defaultValues: { code: '', newPassword: '', confirm: '' },
  });

  const reset = second.handleSubmit(async (v) => {
    try {
      await api.post('/auth/password/reset', {
        email,
        code: v.code,
        newPassword: v.newPassword,
      });
      setDone(true);
    } catch (err) {
      if (!applyServerErrors(err as never, second.setError, ['code', 'newPassword'])) {
        second.setError('root', { message: (err as Error).message });
      }
      second.setValue('code', '');
    }
  });

  return (
    <div className="mx-auto max-w-md px-5 pb-10">
      <header className="py-[18px]">
        <Logo size="lg" />
      </header>

      {done ? (
        <div className="pt-6 flex flex-col items-center text-center gap-3">
          <span className="w-16 h-16 rounded-2xl bg-accent-soft-2 text-accent-deep flex items-center justify-center">
            <CheckCircle size={30} />
          </span>
          <h1 className="text-[27px] font-bold tracking-[-0.5px]">Password changed</h1>
          <p className="text-[15px] text-muted">
            Log in with your new password. You’ve been signed out on other devices.
          </p>
          <LinkButton to="/login" variant="cta" size="lg" className="w-full mt-4">
            Log in
          </LinkButton>
        </div>
      ) : !email ? (
        <>
          <h1 className="text-[27px] font-bold tracking-[-0.5px] mt-4">Forgot password?</h1>
          <p className="text-[15px] text-muted mt-1.5">
            Enter the email on your account and we’ll send you a code to set a new password.
          </p>
          <form
            noValidate
            className="flex flex-col gap-5 mt-7"
            onSubmit={first.handleSubmit((v) => send(v.email))}
          >
            <Field label="Email" htmlFor="email" error={first.formState.errors.email?.message}>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                {...first.register('email')}
                invalid={!!first.formState.errors.email}
              />
            </Field>
            <SendError error={sendError} />
            <Button
              type="submit"
              variant="cta"
              size="lg"
              block
              loading={sending}
              disabled={left > 0}
            >
              {left > 0 ? `Send code in ${left}s` : 'Send code'}
            </Button>
          </form>
          <div className="mt-8 bg-white rounded-[18px] p-5 shadow-card">
            <div className="font-semibold">No email on your account?</div>
            <p className="text-sm text-muted mt-1 mb-3.5">Contact us and we’ll reset it for you.</p>
            <ContactButtons message="Hi, I forgot my password. Please help me reset it." />
          </div>
        </>
      ) : (
        <>
          <h1 className="text-[27px] font-bold tracking-[-0.5px] mt-4">Check your email</h1>
          <p className="text-[15px] text-muted mt-1.5">
            If <b className="text-ink">{email}</b> has an account, we’ve sent it a 6-digit code.
            It’s valid for 10 minutes. Didn’t get it? Check spam.
          </p>
          <form noValidate onSubmit={reset} className="flex flex-col gap-5 mt-7">
            <Field label="Code" htmlFor="code" error={second.formState.errors.code?.message}>
              <CodeInput
                value={second.watch('code')}
                invalid={!!second.formState.errors.code}
                autoFocus
                onChange={(v) => second.setValue('code', v, { shouldValidate: v.length === 6 })}
              />
            </Field>
            <Field
              label="New password"
              htmlFor="newPassword"
              hint="At least 8 characters"
              error={second.formState.errors.newPassword?.message}
            >
              <Input
                id="newPassword"
                type="password"
                autoComplete="new-password"
                {...second.register('newPassword')}
                invalid={!!second.formState.errors.newPassword}
              />
            </Field>
            <Field
              label="Confirm new password"
              htmlFor="confirm"
              error={second.formState.errors.confirm?.message}
            >
              <Input
                id="confirm"
                type="password"
                autoComplete="new-password"
                {...second.register('confirm')}
                invalid={!!second.formState.errors.confirm}
              />
            </Field>
            <FormError error={second.formState.errors.root?.message} />
            <Button
              type="submit"
              variant="cta"
              size="lg"
              block
              loading={second.formState.isSubmitting}
            >
              Set new password
            </Button>
          </form>
          <SendError error={sendError} />
          <div className="flex flex-col items-center gap-1 mt-4">
            <button
              type="button"
              className="p-2 text-[15px] font-semibold text-accent-ink disabled:text-muted"
              disabled={left > 0 || sending}
              onClick={() => send(email)}
            >
              {left > 0 ? `Resend code in ${left}s` : 'Resend code'}
            </button>
            <button
              type="button"
              className="p-2 text-sm text-muted"
              onClick={() => {
                setEmail(null);
                setSendError(null);
              }}
            >
              Use a different email
            </button>
          </div>
        </>
      )}

      <p className="text-center text-[15px] text-muted mt-8">
        Remembered it?{' '}
        <Link to="/login" className="font-semibold">
          Log in
        </Link>
      </p>
    </div>
  );
}
