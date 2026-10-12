import { zodResolver } from '@hookform/resolvers/zod';
import { settingsSchema } from '@shared/schemas';
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
          title="Contact numbers"
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
        <FormError error={e.root?.message} />
        <Button type="submit" variant="cta" size="lg" loading={formState.isSubmitting}>
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
