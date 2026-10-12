import type { PublicSociety } from '@shared/types';
import { useEffect, useState } from 'react';
import type { FieldValues, UseFormReturn } from 'react-hook-form';
import { useApi } from '../api/hooks';
import { Field, Input, Select } from './ui';

type Shape = {
  societyId?: number | null;
  societyOrBuilding?: string | null;
  area?: string;
  city?: string;
  pincode?: string;
};

const OTHER = 'other';

export function usePublicSocieties() {
  return useApi<PublicSociety[]>(['public', 'societies'], '/public/societies', {
    staleTime: 5 * 60_000,
  });
}

/**
 * Society picker for customer addresses: choose an onboarded society (fills
 * area, city and pincode) or type the name of one that isn't listed yet.
 */
export function SocietyField<T extends FieldValues>({ form: anyForm }: { form: UseFormReturn<T> }) {
  const form = anyForm as unknown as UseFormReturn<Shape>;
  const societies = usePublicSocieties();
  const list = societies.data ?? [];
  const societyId = form.watch('societyId');
  const typed = form.watch('societyOrBuilding');
  const [choice, setChoice] = useState<string>(societyId ? String(societyId) : typed ? OTHER : '');
  const error =
    form.formState.errors.societyOrBuilding?.message ?? form.formState.errors.societyId?.message;

  // No onboarded societies yet → just ask for the name.
  const freeTextOnly = societies.isSuccess && list.length === 0;
  useEffect(() => {
    if (freeTextOnly) setChoice(OTHER);
  }, [freeTextOnly]);

  function pick(value: string) {
    setChoice(value);
    if (value === OTHER || value === '') {
      form.setValue('societyId', null);
      return;
    }
    const s = list.find((x) => String(x.id) === value);
    if (!s) return;
    form.setValue('societyId', s.id, { shouldValidate: true });
    form.setValue('societyOrBuilding', '');
    form.setValue('area', s.area, { shouldValidate: true });
    form.setValue('city', s.city, { shouldValidate: true });
    form.setValue('pincode', s.pincode, { shouldValidate: true });
  }

  return (
    <div className="flex flex-col gap-3">
      {!freeTextOnly ? (
        <Field
          label="Society or building"
          htmlFor="societySelect"
          error={choice === OTHER ? undefined : error}
          hint={choice === OTHER ? undefined : 'We wash in these societies'}
        >
          <Select
            id="societySelect"
            value={choice}
            onChange={(e) => pick(e.target.value)}
            invalid={!!error && choice !== OTHER}
          >
            <option value="">{societies.isLoading ? 'Loading…' : 'Choose your society'}</option>
            {list.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} — {s.area}
              </option>
            ))}
            <option value={OTHER}>My society isn’t listed</option>
          </Select>
        </Field>
      ) : null}
      {choice === OTHER ? (
        <Field
          label={freeTextOnly ? 'Society or building' : 'Society name'}
          htmlFor="society"
          error={error}
          hint="We’ll let you know once we start washing there"
        >
          <Input
            id="society"
            placeholder="Kumar Pebble Park"
            {...form.register('societyOrBuilding')}
            invalid={!!error}
          />
        </Field>
      ) : null}
    </div>
  );
}
