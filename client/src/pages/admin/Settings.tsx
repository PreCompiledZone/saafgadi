import { zodResolver } from '@hookform/resolvers/zod';
import { settingsSchema } from '@shared/schemas';
import { parseSlots, type SlotSetting } from '@shared/enums';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import type { z } from 'zod';
import { api } from '../../api/client';
import { useApi, useApiMutation } from '../../api/hooks';
import {
  Button,
  Card,
  Checkbox,
  CardHeader,
  Field,
  FormError,
  Input,
  PageTitle,
  QueryView,
  Textarea,
  useToast,
} from '../../components/ui';
import { whatsappTo } from '../../lib/contact';
import { applyServerErrors } from '../../lib/forms';

type In = z.input<typeof settingsSchema>;
type Out = z.output<typeof settingsSchema>;

function SettingsForm({ initial }: { initial: Out }) {
  const toast = useToast();
  const save = useApiMutation(
    (v: Out) => api.put<Out>('/admin/settings', v),
    [['admin', 'settings'], ['public']],
  );
  const form = useForm<In, unknown, Out>({
    resolver: zodResolver(settingsSchema),
    defaultValues: initial,
  });
  const { register, handleSubmit, formState, setError, watch, setValue } = form;
  const e = formState.errors;
  const wa = watch('whatsapp_number');
  const [slots, setSlots] = useState<SlotSetting[]>(() => parseSlots(initial.booking_slots));
  useEffect(() => {
    setValue('booking_slots', slots, { shouldDirty: true });
  }, [slots, setValue]);
  const setSlot = (i: number, patch: Partial<SlotSetting>) =>
    setSlots(slots.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  return (
    <form
      noValidate
      className="grid gap-4 lg:grid-cols-2 items-start"
      onSubmit={handleSubmit(async (v) => {
        try {
          await save.mutateAsync(v);
          toast('Settings saved');
        } catch (err) {
          if (!applyServerErrors(err, setError, Object.keys(initial)))
            setError('root', { message: (err as Error).message });
        }
      })}
    >
      <Card className="flex flex-col gap-4">
        <CardHeader
          title="Contact details"
          sub="Customers see WhatsApp and Call buttons only for numbers you set here."
        />
        <Field
          label="WhatsApp number"
          htmlFor="wa"
          error={e.whatsapp_number?.message}
          hint={
            wa ? (
              <a href={whatsappTo(wa)} target="_blank" rel="noopener noreferrer">
                Test this number
              </a>
            ) : (
              '10-digit Indian number, or with country code'
            )
          }
        >
          <Input
            id="wa"
            type="tel"
            placeholder="98765 43210"
            {...register('whatsapp_number')}
            invalid={!!e.whatsapp_number}
          />
        </Field>
        <Field label="Call number" htmlFor="call" error={e.call_number?.message}>
          <Input
            id="call"
            type="tel"
            placeholder="98765 43210"
            {...register('call_number')}
            invalid={!!e.call_number}
          />
        </Field>
        <Field
          label="Default WhatsApp message"
          htmlFor="msg"
          error={e.whatsapp_default_message?.message}
          hint="Prefilled when a customer taps WhatsApp"
        >
          <Textarea id="msg" {...register('whatsapp_default_message')} />
        </Field>
        <Field
          label="Contact email"
          htmlFor="semail"
          error={e.support_email?.message}
          hint="Shown in the website footer"
        >
          <Input
            id="semail"
            type="email"
            placeholder="hello@saafgadi.in"
            {...register('support_email')}
            invalid={!!e.support_email}
          />
        </Field>
      </Card>
      <Card className="flex flex-col gap-4">
        <CardHeader title="Business" />
        <Field label="Business name" htmlFor="bname" error={e.business_name?.message}>
          <Input id="bname" {...register('business_name')} invalid={!!e.business_name} />
        </Field>
        <Field label="Service area / address" htmlFor="baddr" error={e.business_address?.message}>
          <Input id="baddr" placeholder="Pune" {...register('business_address')} />
        </Field>
        <Field label="Support hours" htmlFor="hours" error={e.support_hours?.message}>
          <Input id="hours" placeholder="8 am – 8 pm, Mon–Sat" {...register('support_hours')} />
        </Field>
        <Checkbox
          label="Show washer contact to customers"
          hint="Customers see Call and WhatsApp buttons for their assigned washer"
          checked={
            watch('show_washer_contact') !== 'false' && watch('show_washer_contact') !== false
          }
          onChange={(ev) =>
            setValue('show_washer_contact', ev.target.checked, { shouldDirty: true })
          }
        />
      </Card>
      <Card className="flex flex-col gap-4 lg:col-span-2">
        <CardHeader
          title="One-time wash slots"
          sub="Time slots customers can pick when booking a one-time wash"
        />
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {slots.map((s, i) => (
            <div key={s.key} className="bg-canvas rounded-[14px] p-3 flex flex-col gap-2.5">
              <Field label="Name" htmlFor={`sl-${s.key}`}>
                <Input
                  id={`sl-${s.key}`}
                  value={s.label}
                  onChange={(ev) => setSlot(i, { label: ev.target.value })}
                />
              </Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label="From" htmlFor={`ss-${s.key}`}>
                  <Input
                    id={`ss-${s.key}`}
                    type="time"
                    value={s.start}
                    onChange={(ev) => setSlot(i, { start: ev.target.value })}
                  />
                </Field>
                <Field label="To" htmlFor={`se-${s.key}`}>
                  <Input
                    id={`se-${s.key}`}
                    type="time"
                    value={s.end}
                    onChange={(ev) => setSlot(i, { end: ev.target.value })}
                  />
                </Field>
              </div>
              <Checkbox
                label="Offered"
                checked={s.enabled}
                onChange={(ev) => setSlot(i, { enabled: ev.target.checked })}
              />
            </div>
          ))}
        </div>
        {e.booking_slots ? (
          <span role="alert" className="text-[13px] font-medium text-danger">
            {e.booking_slots.message ?? 'Check the slot times: each must end after it starts'}
          </span>
        ) : null}
        <Checkbox
          label="Allow same-day bookings"
          hint="Off: the earliest a customer can book is tomorrow"
          checked={
            watch('booking_allow_same_day') === 'true' || watch('booking_allow_same_day') === true
          }
          onChange={(ev) =>
            setValue('booking_allow_same_day', ev.target.checked, { shouldDirty: true })
          }
        />
        <FormError error={e.root?.message} />
        <Button
          type="submit"
          variant="cta"
          size="lg"
          className="self-start"
          loading={formState.isSubmitting}
        >
          Save settings
        </Button>
      </Card>
    </form>
  );
}

export function AdminSettings() {
  const q = useApi<Out>(['admin', 'settings'], '/admin/settings');
  return (
    <>
      <PageTitle title="Settings" />
      <QueryView query={q}>{(s) => <SettingsForm initial={s} />}</QueryView>
    </>
  );
}
