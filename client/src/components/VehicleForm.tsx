import { zodResolver } from '@hookform/resolvers/zod';
import { CAR_TYPES, LABELS, type CarType, type VehicleCategory } from '@shared/enums';
import { formatRegistration } from '@shared/registration';
import { vehicleInputSchema, type VehicleInput } from '@shared/schemas';
import type { z } from 'zod';
import { Controller, useForm } from 'react-hook-form';
import { applyServerErrors } from '../lib/forms';
import { Bike, Car, Check, MapPin } from './icons';
import { Button, ChoiceGroup, cx, Field, FormError, Input } from './ui';

export type VehicleFormValues = z.output<typeof vehicleInputSchema>;

const FIELDS = [
  'category',
  'carType',
  'registrationNumber',
  'make',
  'model',
  'color',
  'parkingNotes',
];

/** Vehicle details, laid out like the "Add your vehicle" sample. */
export function VehicleForm({
  defaultValues,
  onSubmit,
  submitLabel,
  submitIcon,
  lockIdentity,
  secondary,
}: {
  defaultValues?: Partial<VehicleInput>;
  onSubmit: (v: VehicleFormValues) => Promise<unknown>;
  submitLabel: string;
  submitIcon?: React.ReactNode;
  /** Registration number and category can't be changed once a plan exists. */
  lockIdentity?: boolean;
  secondary?: React.ReactNode;
}) {
  const form = useForm<VehicleInput, unknown, VehicleFormValues>({
    resolver: zodResolver(vehicleInputSchema),
    defaultValues: {
      category: 'CAR',
      carType: null,
      registrationNumber: '',
      make: '',
      model: '',
      color: '',
      parkingNotes: '',
      ...defaultValues,
      ...(defaultValues?.registrationNumber
        ? { registrationNumber: formatRegistration(defaultValues.registrationNumber) }
        : {}),
    },
  });
  const { register, control, handleSubmit, watch, setValue, formState, setError } = form;
  const category = watch('category');
  const errors = formState.errors;

  const submit = handleSubmit(async (values) => {
    try {
      await onSubmit(values);
    } catch (err) {
      if (!applyServerErrors(err, setError, FIELDS)) {
        setError('root', { message: (err as Error).message });
      }
    }
  });

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-5">
      <fieldset className="border-0 m-0 p-0" disabled={lockIdentity}>
        <legend className="font-semibold text-sm p-0 mb-2.5">Select vehicle</legend>
        <div className="grid grid-cols-2 gap-2.5">
          {(['CAR', 'BIKE'] as VehicleCategory[]).map((c) => {
            const on = category === c;
            return (
              <button
                key={c}
                type="button"
                aria-pressed={on}
                onClick={() => {
                  setValue('category', c, { shouldDirty: true });
                  if (c === 'BIKE') setValue('carType', null);
                }}
                className={cx(
                  'relative flex flex-col items-start gap-2 p-3.5 rounded-2xl bg-white text-left disabled:opacity-60',
                  on ? 'border-2 border-accent' : 'border border-line',
                )}
              >
                <span
                  className={cx(
                    'w-[38px] h-[38px] rounded-[10px] flex items-center justify-center text-accent-ink',
                    on ? 'bg-accent-soft' : 'bg-canvas',
                  )}
                >
                  {c === 'CAR' ? <Car size={22} /> : <Bike size={22} />}
                </span>
                <span className="font-semibold">{LABELS.category[c]}</span>
                {on ? (
                  <span className="absolute top-3 right-3 w-[22px] h-[22px] rounded-full bg-accent text-white flex items-center justify-center">
                    <Check size={12} strokeWidth={3.4} />
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </fieldset>

      {category === 'CAR' ? (
        <Controller
          control={control}
          name="carType"
          render={({ field }) => (
            <ChoiceGroup<CarType>
              legend="Car type"
              options={CAR_TYPES.map((t) => ({ value: t, label: LABELS.carType[t] }))}
              value={field.value ?? null}
              onChange={field.onChange}
              error={errors.carType?.message}
            />
          )}
        />
      ) : null}

      <Field
        label="Registration number"
        htmlFor="reg"
        error={errors.registrationNumber?.message}
        hint={
          lockIdentity
            ? 'Locked because this vehicle has a plan. Ask us to change it.'
            : 'As on your number plate, e.g. MH 14 AB 1234 or 22 BH 1234 AA'
        }
      >
        <div
          className={cx(
            'flex items-stretch h-14 rounded-[14px] border-[1.5px] bg-white overflow-hidden focus-within:ring-2 focus-within:ring-accent/25',
            errors.registrationNumber ? 'border-danger' : 'border-ink',
            lockIdentity && 'opacity-70',
          )}
        >
          <span
            className="w-10 bg-plate-blue text-white text-[11px] font-bold flex items-end justify-center pb-2"
            aria-hidden="true"
          >
            IND
          </span>
          <input
            id="reg"
            {...register('registrationNumber')}
            disabled={lockIdentity}
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
            placeholder="MH 14 AB 1234"
            aria-invalid={!!errors.registrationNumber || undefined}
            className="flex-1 min-w-0 border-0 px-3.5 text-[22px] font-bold tracking-[2px] uppercase bg-transparent focus:outline-none placeholder:text-[#c4bdb6] placeholder:font-semibold"
          />
        </div>
      </Field>

      <div className="grid grid-cols-2 gap-2.5">
        <Field label="Make" htmlFor="make" error={errors.make?.message}>
          <Input
            id="make"
            placeholder={category === 'BIKE' ? 'Honda' : 'Honda'}
            {...register('make')}
            invalid={!!errors.make}
          />
        </Field>
        <Field label="Model" htmlFor="model" error={errors.model?.message}>
          <Input
            id="model"
            placeholder={category === 'BIKE' ? 'Activa' : 'City'}
            {...register('model')}
            invalid={!!errors.model}
          />
        </Field>
      </div>

      <Field label="Colour" htmlFor="colour" error={errors.color?.message}>
        <Input id="colour" placeholder="White" {...register('color')} invalid={!!errors.color} />
      </Field>

      <Field
        label="Parking spot"
        htmlFor="parking"
        error={errors.parkingNotes?.message}
        hint="Helps your washer find it"
      >
        <div className="flex items-center gap-2.5 h-[52px] rounded-[14px] border border-line bg-white px-3.5 focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/20">
          <MapPin size={18} className="text-muted shrink-0" />
          <input
            id="parking"
            placeholder="B-wing basement, slot 42"
            {...register('parkingNotes')}
            className="flex-1 min-w-0 border-0 bg-transparent text-base focus:outline-none placeholder:text-[#9a939f]"
          />
        </div>
      </Field>

      <FormError error={errors.root?.message} />

      <div className="flex flex-col gap-2.5 mt-1">
        <Button type="submit" variant="cta" size="lg" loading={formState.isSubmitting} block>
          {submitLabel}
          {submitIcon}
        </Button>
        {secondary}
      </div>
    </form>
  );
}
