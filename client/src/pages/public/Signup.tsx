import { zodResolver } from '@hookform/resolvers/zod';
import { addressSchema, requiredEmail, signupDetailsSchema } from '@shared/schemas';
import type { SessionUser } from '@shared/types';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { z } from 'zod';
import { api, ApiError } from '../../api/client';
import { Check, ChevronLeft, ChevronRight } from '../../components/icons';
import { CodeInput } from '../../components/CodeInput';
import { retryAfter, SendError, useCountdown } from '../../components/EmailVerify';
import { Button, Field, FormError, Input, Notice } from '../../components/ui';
import { SocietyField } from '../../components/SocietyField';
import { VehicleForm, type VehicleFormValues } from '../../components/VehicleForm';
import { useAuthActions } from '../../lib/auth';
import { applyServerErrors } from '../../lib/forms';

type Personal = z.output<typeof signupDetailsSchema>;
type Address = z.output<typeof addressSchema>;

const PROGRESS = ['12%', '33%', '60%', '82%'];

function StepHeader({ step, onBack }: { step: number; onBack: () => void }) {
  return (
    <>
      <div
        role="progressbar"
        aria-label="Sign-up progress"
        aria-valuenow={step}
        aria-valuemin={0}
        aria-valuemax={3}
        className="h-1 bg-line"
      >
        <div className="h-full bg-accent transition-[width]" style={{ width: PROGRESS[step] }} />
      </div>
      <header className="mx-auto max-w-md flex items-center justify-between px-2 py-1.5">
        <button
          type="button"
          aria-label="Back"
          onClick={onBack}
          className="w-11 h-11 flex items-center justify-center rounded-full hover:bg-white"
        >
          <ChevronLeft size={22} />
        </button>
        <span className="text-sm text-muted pr-3.5">
          {step === 0 ? 'Verify your email' : `Step ${step} of 3`}
        </span>
      </header>
    </>
  );
}

function Heading({ title, sub }: { title: string; sub: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <h1 className="text-[27px] font-bold tracking-[-0.5px]">{title}</h1>
      <p className="text-[15px] leading-normal text-muted">{sub}</p>
    </div>
  );
}

function PersonalStep({
  initial,
  email,
  onNext,
  onChangeEmail,
  onHoneypot,
  serverError,
}: {
  initial?: Personal;
  email: string;
  onNext: (v: Personal) => void;
  onChangeEmail: () => void;
  onHoneypot: (v: string) => void;
  serverError?: ApiError;
}) {
  const form = useForm<z.input<typeof signupDetailsSchema>, unknown, Personal>({
    resolver: zodResolver(signupDetailsSchema),
    defaultValues: initial ?? { name: '', mobile: '', password: '' },
  });
  const { register, handleSubmit, formState, setError } = form;
  useEffect(() => {
    if (serverError && !applyServerErrors(serverError, setError, ['mobile'])) {
      setError('root', { message: serverError.message });
    }
  }, [serverError, setError]);
  const e = formState.errors;
  return (
    <form onSubmit={handleSubmit(onNext)} noValidate className="flex flex-col gap-5 pt-6">
      <Field label="Your name" htmlFor="name" error={e.name?.message}>
        <Input
          id="name"
          autoComplete="name"
          placeholder="Rohan Kulkarni"
          {...register('name')}
          invalid={!!e.name}
        />
      </Field>
      <Field
        label="Mobile number"
        htmlFor="mobile"
        error={e.mobile?.message}
        hint="You’ll log in with this"
      >
        <Input
          id="mobile"
          type="tel"
          inputMode="numeric"
          autoComplete="tel-national"
          placeholder="98765 43210"
          {...register('mobile')}
          invalid={!!e.mobile}
        />
      </Field>
      <div className="flex items-center gap-3 rounded-[14px] border border-line bg-white px-3.5 py-3">
        <div className="flex-1 min-w-0">
          <div className="text-xs text-muted">Email</div>
          <div className="font-semibold truncate">{email}</div>
        </div>
        <span className="inline-flex items-center gap-1 rounded-full bg-accent-soft text-accent-deep text-xs font-semibold px-2.5 py-1">
          <Check size={13} strokeWidth={3} /> Email verified
        </span>
        <button
          type="button"
          onClick={onChangeEmail}
          className="text-sm font-semibold text-accent-ink p-1"
        >
          Change
        </button>
      </div>
      {/* Honeypot: hidden from people, so only bots fill it. */}
      <div aria-hidden="true" className="absolute -left-[9999px] w-px h-px overflow-hidden">
        <label htmlFor="website">Website</label>
        <input
          id="website"
          name="website"
          type="text"
          tabIndex={-1}
          autoComplete="off"
          onChange={(ev) => onHoneypot(ev.target.value)}
        />
      </div>
      <Field
        label="Password"
        htmlFor="password"
        error={e.password?.message}
        hint="At least 8 characters"
      >
        <Input
          id="password"
          type="password"
          autoComplete="new-password"
          {...register('password')}
          invalid={!!e.password}
        />
      </Field>
      <FormError error={e.root?.message} />
      <Button type="submit" variant="cta" size="lg" block className="mt-1">
        Continue <ChevronRight size={18} strokeWidth={2.2} />
      </Button>
      <p className="text-center text-[15px] text-muted">
        Already have an account?{' '}
        <Link to="/login" className="font-semibold">
          Log in
        </Link>
      </p>
    </form>
  );
}

function AddressStep({ initial, onNext }: { initial?: Address; onNext: (v: Address) => void }) {
  const form = useForm<z.input<typeof addressSchema>, unknown, Address>({
    resolver: zodResolver(addressSchema),
    defaultValues: initial ?? {
      societyId: null,
      societyOrBuilding: '',
      flatOrHouseNo: '',
      addressLine: '',
      area: '',
      city: 'Pune',
      pincode: '',
    },
  });
  const { register, handleSubmit, formState } = form;
  const e = formState.errors;
  return (
    <form onSubmit={handleSubmit(onNext)} noValidate className="flex flex-col gap-5 pt-6">
      <SocietyField form={form} />
      <div className="grid grid-cols-2 gap-2.5">
        <Field label="Flat / house no." htmlFor="flat" error={e.flatOrHouseNo?.message}>
          <Input
            id="flat"
            placeholder="B-402"
            {...register('flatOrHouseNo')}
            invalid={!!e.flatOrHouseNo}
          />
        </Field>
        <Field label="Pincode" htmlFor="pincode" error={e.pincode?.message}>
          <Input
            id="pincode"
            inputMode="numeric"
            autoComplete="postal-code"
            placeholder="411028"
            {...register('pincode')}
            invalid={!!e.pincode}
          />
        </Field>
      </div>
      <Field label="Street / landmark (optional)" htmlFor="line" error={e.addressLine?.message}>
        <Input
          id="line"
          autoComplete="address-line1"
          placeholder="Near Magarpatta gate"
          {...register('addressLine')}
        />
      </Field>
      <div className="grid grid-cols-2 gap-2.5">
        <Field label="Area" htmlFor="area" error={e.area?.message}>
          <Input id="area" placeholder="Hadapsar" {...register('area')} invalid={!!e.area} />
        </Field>
        <Field label="City" htmlFor="city" error={e.city?.message}>
          <Input id="city" autoComplete="address-level2" {...register('city')} invalid={!!e.city} />
        </Field>
      </div>
      <Button type="submit" variant="cta" size="lg" block className="mt-1">
        Continue <ChevronRight size={18} strokeWidth={2.2} />
      </Button>
    </form>
  );
}

const emailForm = z.object({ email: requiredEmail });

/** Step 0: verify the email before anything else. No account exists yet. */
function EmailStep({
  initial,
  notice,
  onVerified,
}: {
  initial?: string;
  notice?: string;
  onVerified: (email: string) => void;
}) {
  const [email, setEmail] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [left, setLeft] = useCountdown();
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<unknown>(null);
  const [verifyError, setVerifyError] = useState<unknown>(null);
  const [verifying, setVerifying] = useState(false);
  const form = useForm<z.input<typeof emailForm>, unknown, z.output<typeof emailForm>>({
    resolver: zodResolver(emailForm),
    defaultValues: { email: initial ?? '' },
  });

  async function send(to: string) {
    setSending(true);
    setSendError(null);
    try {
      await api.post('/auth/otp/send', { email: to, purpose: 'SIGNUP' });
      setEmail(to);
      setCode('');
      setLeft(60);
    } catch (err) {
      const wait = retryAfter(err);
      if (wait) {
        setLeft(wait);
        setEmail(to); // a recent code is still valid
      } else if (err instanceof ApiError && err.code === 'DISPOSABLE_EMAIL') {
        form.setError('email', { message: err.message });
        return;
      }
      setSendError(err);
    } finally {
      setSending(false);
    }
  }

  async function verify(value: string) {
    if (!email || value.length !== 6) return;
    setVerifying(true);
    setVerifyError(null);
    try {
      const res = await api.post<{ email: string }>('/auth/otp/verify-signup', {
        email,
        code: value,
      });
      onVerified(res.email);
    } catch (err) {
      setVerifyError(err);
      setCode('');
    } finally {
      setVerifying(false);
    }
  }

  if (!email) {
    return (
      <form
        noValidate
        className="flex flex-col gap-5 pt-6"
        onSubmit={form.handleSubmit((v) => send(v.email))}
      >
        {notice ? <Notice tone="warn">{notice}</Notice> : null}
        <Field
          label="Email"
          htmlFor="email"
          error={form.formState.errors.email?.message}
          hint="We’ll send you a code to check it’s yours"
        >
          <Input
            id="email"
            type="email"
            autoComplete="email"
            autoFocus
            {...form.register('email')}
            invalid={!!form.formState.errors.email}
          />
        </Field>
        <SendError error={sendError} />
        <Button type="submit" variant="cta" size="lg" block loading={sending} disabled={left > 0}>
          {left > 0 ? `Send code in ${left}s` : 'Send code'}{' '}
          <ChevronRight size={18} strokeWidth={2.2} />
        </Button>
        <p className="text-center text-[15px] text-muted">
          Already have an account?{' '}
          <Link to="/login" className="font-semibold">
            Log in
          </Link>
        </p>
      </form>
    );
  }

  return (
    <div className="flex flex-col gap-5 pt-6">
      <p className="text-[15px] text-muted">
        We sent a 6-digit code to <b className="text-ink">{email}</b>. It’s valid for 10 minutes.
      </p>
      <CodeInput
        value={code}
        invalid={!!verifyError}
        autoFocus
        onChange={(v) => {
          setCode(v);
          setVerifyError(null);
          if (v.length === 6) void verify(v);
        }}
      />
      <FormError error={verifyError as Error | null} />
      <Button
        variant="cta"
        size="lg"
        block
        loading={verifying}
        disabled={code.length !== 6}
        onClick={() => verify(code)}
      >
        Verify and continue <ChevronRight size={18} strokeWidth={2.2} />
      </Button>
      <SendError error={sendError} />
      <div className="flex flex-col items-center gap-1">
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
            setVerifyError(null);
          }}
        >
          Wrong email? Change it
        </button>
        <p className="text-[13px] text-muted">Didn’t get it? Check spam.</p>
      </div>
    </div>
  );
}

export function Signup() {
  const [step, setStep] = useState(0);
  const [email, setEmail] = useState<string>();
  const [expired, setExpired] = useState<string>();
  const [website, setWebsite] = useState('');
  const [personal, setPersonal] = useState<Personal>();
  const [address, setAddress] = useState<Address>();
  const [vehicle, setVehicle] = useState<VehicleFormValues>();
  const [personalError, setPersonalError] = useState<ApiError>();
  const [skipError, setSkipError] = useState<string>();
  const [skipping, setSkipping] = useState(false);
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { signedIn } = useAuthActions();

  async function create(v: VehicleFormValues | null) {
    try {
      const res = await api.post<{ user?: SessionUser }>('/auth/signup', {
        ...personal,
        email,
        website,
        ...address,
        vehicles: v ? [v] : [],
      });
      if (!res.user) {
        navigate('/', { replace: true });
        return;
      }
      await signedIn(res.user);
      const plan = params.get('plan');
      navigate(`/app/welcome${plan ? `?plan=${plan}` : ''}`, {
        replace: true,
        state: { registration: v?.registrationNumber },
      });
    } catch (err) {
      if (
        err instanceof ApiError &&
        [
          'SIGNUP_TOKEN_EXPIRED',
          'SIGNUP_TOKEN_REQUIRED',
          'SIGNUP_EMAIL_MISMATCH',
          'EMAIL_TAKEN',
        ].includes(err.code)
      ) {
        // Back to step 0; everything typed so far is kept.
        setExpired(
          err.code === 'EMAIL_TAKEN'
            ? 'This email already has an account. Log in, or use a different email.'
            : 'Your verification expired, please verify your email again.',
        );
        setStep(0);
        return;
      }
      if (err instanceof ApiError && err.code === 'MOBILE_TAKEN') {
        setPersonalError(err);
        setStep(1);
        return;
      }
      throw err; // VehicleForm shows field / form errors
    }
  }

  const back = () => (step <= 1 ? navigate(-1) : setStep(step - 1));

  return (
    <div className="pb-10">
      <StepHeader step={step} onBack={back} />
      <div className="mx-auto max-w-md px-5">
        {step === 0 ? (
          <>
            <Heading
              title="Create your account"
              sub="First, your email. We’ll use it if you ever forget your password."
            />
            <EmailStep
              initial={email}
              notice={expired}
              onVerified={(verified) => {
                setEmail(verified);
                setExpired(undefined);
                setStep(1);
              }}
            />
          </>
        ) : step === 1 ? (
          <>
            <Heading
              title="Your details"
              sub="It takes a minute. We’ll use these to reach you about your washes."
            />
            <PersonalStep
              initial={personal}
              email={email ?? ''}
              serverError={personalError}
              onHoneypot={setWebsite}
              onChangeEmail={() => setStep(0)}
              onNext={(v) => {
                setPersonal(v);
                setStep(2);
              }}
            />
          </>
        ) : step === 2 ? (
          <>
            <Heading title="Where do you live?" sub="Your washer comes to your society parking." />
            <AddressStep
              initial={address}
              onNext={(v) => {
                setAddress(v);
                setStep(3);
              }}
            />
          </>
        ) : (
          <>
            <Heading
              title="Add your vehicle"
              sub="So your washer knows what to clean and where to find it"
            />
            <div className="pt-6">
              <VehicleForm
                defaultValues={vehicle}
                submitLabel="Create account"
                submitIcon={<ChevronRight size={18} strokeWidth={2.2} />}
                onSubmit={async (v) => {
                  setVehicle(v);
                  await create(v);
                }}
                secondary={
                  <>
                    {skipError ? <FormError error={skipError} /> : null}
                    <Button
                      variant="ghost"
                      loading={skipping}
                      onClick={async () => {
                        setSkipping(true);
                        setSkipError(undefined);
                        try {
                          await create(null);
                        } catch (err) {
                          setSkipError((err as Error).message);
                        } finally {
                          setSkipping(false);
                        }
                      }}
                    >
                      Skip — I’ll add it later
                    </Button>
                  </>
                }
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
