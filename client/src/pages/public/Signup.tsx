import { zodResolver } from '@hookform/resolvers/zod';
import { addressSchema, personalSchema } from '@shared/schemas';
import type { SessionUser } from '@shared/types';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import type { z } from 'zod';
import { api, ApiError } from '../../api/client';
import { ChevronLeft, ChevronRight } from '../../components/icons';
import { Button, Field, FormError, Input } from '../../components/ui';
import { SocietyField } from '../../components/SocietyField';
import { VehicleForm, type VehicleFormValues } from '../../components/VehicleForm';
import { useAuthActions } from '../../lib/auth';
import { applyServerErrors } from '../../lib/forms';

type Personal = z.output<typeof personalSchema>;
type Address = z.output<typeof addressSchema>;

const PROGRESS = ['33%', '60%', '82%'];

function StepHeader({ step, onBack }: { step: number; onBack: () => void }) {
  return (
    <>
      <div
        role="progressbar"
        aria-label="Sign-up progress"
        aria-valuenow={step}
        aria-valuemin={1}
        aria-valuemax={3}
        className="h-1 bg-line"
      >
        <div
          className="h-full bg-accent transition-[width]"
          style={{ width: PROGRESS[step - 1] }}
        />
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
        <span className="text-sm text-muted pr-3.5">Step {step} of 3</span>
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
  onNext,
  serverError,
}: {
  initial?: Personal;
  onNext: (v: Personal) => void;
  serverError?: ApiError;
}) {
  const form = useForm<z.input<typeof personalSchema>, unknown, Personal>({
    resolver: zodResolver(personalSchema),
    defaultValues: initial ?? { name: '', mobile: '', email: '', password: '' },
  });
  const { register, handleSubmit, formState, setError } = form;
  useEffect(() => {
    if (serverError && !applyServerErrors(serverError, setError, ['mobile', 'email'])) {
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
      <Field label="Email (optional)" htmlFor="email" error={e.email?.message}>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          {...register('email')}
          invalid={!!e.email}
        />
      </Field>
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

export function Signup() {
  const [step, setStep] = useState(1);
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
      const { user } = await api.post<{ user: SessionUser }>('/auth/signup', {
        ...personal,
        ...address,
        vehicles: v ? [v] : [],
      });
      await signedIn(user);
      const plan = params.get('plan');
      navigate(`/app/welcome${plan ? `?plan=${plan}` : ''}`, {
        replace: true,
        state: { registration: v?.registrationNumber },
      });
    } catch (err) {
      if (err instanceof ApiError && ['MOBILE_TAKEN', 'EMAIL_TAKEN'].includes(err.code)) {
        setPersonalError(err);
        setStep(1);
        return;
      }
      throw err; // VehicleForm shows field / form errors
    }
  }

  const back = () => (step === 1 ? navigate(-1) : setStep(step - 1));

  return (
    <div className="pb-10">
      <StepHeader step={step} onBack={back} />
      <div className="mx-auto max-w-md px-5">
        {step === 1 ? (
          <>
            <Heading
              title="Create your account"
              sub="It takes a minute. We’ll use these to reach you about your washes."
            />
            <PersonalStep
              initial={personal}
              serverError={personalError}
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
