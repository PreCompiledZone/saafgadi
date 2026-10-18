import { zodResolver } from '@hookform/resolvers/zod';
import { loginSchema, type LoginInput } from '@shared/schemas';
import type { SessionUser } from '@shared/types';
import { useForm } from 'react-hook-form';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../../api/client';
import { Logo } from '../../components/brand';
import { Button, Field, FormError, Input } from '../../components/ui';
import { HOME_FOR, useAuthActions } from '../../lib/auth';
import { clearDashboardTab } from '../../lib/dashboardTab';

export function Login() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { signedIn } = useAuthActions();
  const form = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { identifier: '', password: '' },
  });
  const { register, handleSubmit, formState, setError } = form;

  const submit = handleSubmit(async (values) => {
    try {
      const { user } = await api.post<{ user: SessionUser }>('/auth/login', values);
      clearDashboardTab();
      await signedIn(user);
      const next = params.get('next');
      const home = HOME_FOR[user.role];
      navigate(next && next.startsWith(home) ? next : home, { replace: true });
    } catch (err) {
      setError('root', { message: (err as Error).message });
    }
  });

  return (
    <div className="mx-auto max-w-md px-5 pb-10">
      <header className="py-[18px]">
        <Logo size="lg" />
      </header>
      <h1 className="text-[27px] font-bold tracking-[-0.5px] mt-4">Welcome back</h1>
      <p className="text-[15px] text-muted mt-1.5">Log in with your mobile number or email.</p>

      <form onSubmit={submit} noValidate className="flex flex-col gap-5 mt-7">
        <Field
          label="Mobile number or email"
          htmlFor="identifier"
          error={formState.errors.identifier?.message}
        >
          <Input
            id="identifier"
            autoComplete="username"
            inputMode="email"
            placeholder="98765 43210"
            {...register('identifier')}
            invalid={!!formState.errors.identifier}
          />
        </Field>
        <Field label="Password" htmlFor="password" error={formState.errors.password?.message}>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            {...register('password')}
            invalid={!!formState.errors.password}
          />
        </Field>
        <FormError error={formState.errors.root?.message} />
        <Button type="submit" variant="cta" size="lg" loading={formState.isSubmitting} block>
          Log in
        </Button>
      </form>

      <Link
        to="/forgot-password"
        className="block text-center mt-5 p-2 text-[15px] font-semibold no-underline"
      >
        Forgot password?
      </Link>

      <p className="text-center text-[15px] text-muted mt-8">
        New here?{' '}
        <Link
          to={
            params.get('next')
              ? `/signup?next=${encodeURIComponent(params.get('next')!)}`
              : '/signup'
          }
          className="font-semibold"
        >
          Create an account
        </Link>
      </p>
    </div>
  );
}
