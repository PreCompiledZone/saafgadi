import { LABELS, PAYMENT_MODES, SUBSCRIPTION_MONTH_OPTIONS, type PaymentMode } from '@shared/enums';
import { subscriptionEndDate } from '@shared/calendar';
import type { AdminUserDetail, PlanDto, SubscriptionDto, UserDto } from '@shared/types';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../../api/client';
import { useApi, useApiMutation } from '../../api/hooks';
import {
  Button,
  Card,
  CardHeader,
  Checkbox,
  ChoiceGroup,
  cx,
  Field,
  FormError,
  Input,
  PageTitle,
  Select,
  Textarea,
  useToast,
} from '../../components/ui';
import { todayIst } from '../../lib/forms';
import { fullDate, money } from '../../lib/format';
import { UserPicker, WasherSelect } from './parts';

export function Activate() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();
  const today = todayIst();

  const [user, setUser] = useState<UserDto | null>(null);
  const [vehicleId, setVehicleId] = useState<number | null>(
    Number(params.get('vehicleId')) || null,
  );
  const [planId, setPlanId] = useState<number | null>(Number(params.get('planId')) || null);
  const [months, setMonths] = useState<number>(1);
  const [startDate, setStartDate] = useState(today);
  const [washerId, setWasherId] = useState('');
  const [washerTouched, setWasherTouched] = useState(false);
  const [withoutPayment, setWithoutPayment] = useState(false);
  const [reason, setReason] = useState('');
  const [amount, setAmount] = useState('');
  const [amountTouched, setAmountTouched] = useState(false);
  const [mode, setMode] = useState<PaymentMode>('UPI');
  const [reference, setReference] = useState('');
  const [paidOn, setPaidOn] = useState(today);
  const [notes, setNotes] = useState('');

  const presetUserId = Number(params.get('userId')) || null;
  const preset = useApi<AdminUserDetail>(
    ['admin', 'users', presetUserId],
    presetUserId && !user ? `/admin/users/${presetUserId}` : null,
  );
  useEffect(() => {
    if (preset.data && !user) setUser(preset.data.user);
  }, [preset.data, user]);

  const detail = useApi<AdminUserDetail>(
    ['admin', 'users', user?.id],
    user ? `/admin/users/${user.id}` : null,
  );
  const plans = useApi<PlanDto[]>(['admin', 'plans'], '/admin/plans');
  const vehicles = (detail.data?.vehicles ?? []).filter((v) => v.isActive);
  const vehicle = vehicles.find((v) => v.id === vehicleId) ?? null;
  const eligible = (plans.data ?? []).filter(
    (p) => p.isActive && (!vehicle || p.vehicleCategory === vehicle.category),
  );
  const plan = eligible.find((p) => p.id === planId) ?? null;
  const price =
    plan && vehicle
      ? plan.prices.find((p) => p.vehicleType === vehicle.vehicleType && p.isActive)
      : undefined;
  const total = price ? price.monthlyPrice * months : 0;
  const endDate = /^\d{4}-\d{2}-\d{2}$/.test(startDate)
    ? subscriptionEndDate(startDate, months)
    : null;
  const current = useMemo(
    () =>
      (detail.data?.subscriptions ?? []).find(
        (s: SubscriptionDto) =>
          s.vehicleId === vehicleId && s.status === 'ACTIVE' && s.endDate >= today,
      ),
    [detail.data, vehicleId, today],
  );

  // Pre-select the society's default washer until the admin picks one.
  const society = detail.data?.society ?? null;
  useEffect(() => {
    if (!washerTouched)
      setWasherId(society?.defaultWasherId ? String(society.defaultWasherId) : '');
  }, [society, washerTouched]);

  // Auto-select when there's only one option, and keep the amount in step with the price.
  useEffect(() => {
    if (vehicles.length === 1 && !vehicleId) setVehicleId(vehicles[0].id);
  }, [vehicles, vehicleId]);
  useEffect(() => {
    if (eligible.length === 1 && !plan) setPlanId(eligible[0].id);
  }, [eligible, plan]);
  useEffect(() => {
    if (!amountTouched) setAmount(total ? String(total) : '');
  }, [total, amountTouched]);

  const activate = useApiMutation(
    async (body: unknown) => {
      const sub = await api.post<SubscriptionDto>('/admin/subscriptions/activate', body);
      const enquiryId = params.get('enquiryId');
      if (enquiryId)
        await api.put(`/admin/enquiries/${enquiryId}`, {
          status: 'CLOSED',
          adminNotes: `Activated subscription #${sub.id}`,
        });
      return sub;
    },
    [['admin']],
  );

  const ready =
    user &&
    vehicle &&
    plan &&
    price &&
    endDate &&
    (withoutPayment ? reason.trim() : Number(amount) > 0);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !vehicle || !plan) return;
    try {
      const sub = await activate.mutateAsync({
        userId: user.id,
        vehicleId: vehicle.id,
        planId: plan.id,
        months,
        startDate,
        washerId: washerId ? Number(washerId) : null,
        withoutPayment,
        withoutPaymentReason: withoutPayment ? reason : null,
        payment: withoutPayment
          ? null
          : { amount: Number(amount), mode, reference: reference || null, paidOn },
        notes: notes || null,
      });
      toast(`${plan.name} activated for ${sub.registrationNumber}`);
      navigate(`/admin/users/${user.id}`);
    } catch {
      /* shown below */
    }
  }

  return (
    <>
      <PageTitle title="Activate plan" eyebrow="After payment has been collected" />
      <form onSubmit={submit} className="grid gap-4 lg:grid-cols-[1fr_340px] items-start">
        <div className="flex flex-col gap-4 min-w-0">
          <Card>
            <CardHeader title="1. Customer" />
            <UserPicker
              value={user}
              onChange={(u) => {
                setUser(u);
                setWasherTouched(false);
                setVehicleId(null);
              }}
            />
          </Card>

          <Card className={cx(!user && 'opacity-60')}>
            <CardHeader title="2. Vehicle and plan" />
            <div className="flex flex-col gap-4">
              <Field label="Vehicle" htmlFor="vehicle">
                <Select
                  id="vehicle"
                  disabled={!user}
                  value={vehicleId ?? ''}
                  onChange={(e) => {
                    setVehicleId(Number(e.target.value) || null);
                    setPlanId(null);
                  }}
                >
                  <option value="">
                    {user && !vehicles.length
                      ? 'This customer has no vehicles'
                      : 'Choose a vehicle'}
                  </option>
                  {vehicles.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.registrationNumber} — {v.make} {v.model},{' '}
                      {LABELS.vehicleType[v.vehicleType]}
                    </option>
                  ))}
                </Select>
              </Field>
              {current ? (
                <div className="text-sm bg-warn-soft text-warn-ink rounded-xl px-3.5 py-3">
                  Already on {current.planName} until {fullDate(current.endDate)}. Start the new
                  plan after that date, or renew / cancel it from Subscriptions.
                </div>
              ) : null}
              <Field label="Plan" htmlFor="plan">
                <Select
                  id="plan"
                  disabled={!vehicle}
                  value={planId ?? ''}
                  onChange={(e) => setPlanId(Number(e.target.value) || null)}
                >
                  <option value="">Choose a plan</option>
                  {eligible.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </Select>
              </Field>
              {plan && vehicle && !price ? (
                <FormError
                  error={`${plan.name} has no active price for ${LABELS.vehicleType[vehicle.vehicleType]}. Set it in Plans & pricing.`}
                />
              ) : null}
              <ChoiceGroup<number>
                legend="Months"
                columns={4}
                options={SUBSCRIPTION_MONTH_OPTIONS.map((m) => ({ value: m, label: `${m}` }))}
                value={months}
                onChange={setMonths}
              />
              <div className="grid sm:grid-cols-2 gap-4">
                <Field
                  label="Start date"
                  htmlFor="start"
                  hint={endDate ? `Valid till ${fullDate(endDate)}` : undefined}
                >
                  <Input
                    id="start"
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                  />
                </Field>
                <Field
                  label="Washer"
                  htmlFor="washer"
                  hint={
                    society?.defaultWasherId && washerId === String(society.defaultWasherId)
                      ? `Default washer for ${society.name}`
                      : user && !society
                        ? 'Society not onboarded yet — choose a washer'
                        : 'Optional — you can assign later'
                  }
                >
                  <WasherSelect
                    id="washer"
                    value={washerId}
                    onChange={(e) => {
                      setWasherId(e.target.value);
                      setWasherTouched(true);
                    }}
                  />
                </Field>
              </div>
            </div>
          </Card>

          <Card>
            <CardHeader title="3. Payment" />
            <div className="flex flex-col gap-4">
              {!withoutPayment ? (
                <>
                  <div className="grid sm:grid-cols-2 gap-4">
                    <Field label="Amount received (₹)" htmlFor="amount">
                      <Input
                        id="amount"
                        type="number"
                        inputMode="decimal"
                        min={0}
                        step="0.01"
                        value={amount}
                        onChange={(e) => {
                          setAmount(e.target.value);
                          setAmountTouched(true);
                        }}
                      />
                    </Field>
                    <Field label="Paid on" htmlFor="paidOn">
                      <Input
                        id="paidOn"
                        type="date"
                        value={paidOn}
                        onChange={(e) => setPaidOn(e.target.value)}
                      />
                    </Field>
                  </div>
                  <ChoiceGroup<PaymentMode>
                    legend="Mode"
                    columns={4}
                    options={PAYMENT_MODES.map((m) => ({ value: m, label: LABELS.paymentMode[m] }))}
                    value={mode}
                    onChange={setMode}
                  />
                  <Field label="Reference (UPI ref / note)" htmlFor="ref">
                    <Input
                      id="ref"
                      value={reference}
                      onChange={(e) => setReference(e.target.value)}
                    />
                  </Field>
                </>
              ) : (
                <Field
                  label="Why no payment?"
                  htmlFor="reason"
                  hint="Shown as unpaid on the dashboard until a payment is recorded"
                >
                  <Input
                    id="reason"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="Pays at month end"
                  />
                </Field>
              )}
              <Checkbox
                label="Activate without payment"
                hint="Only when payment will be collected later"
                checked={withoutPayment}
                onChange={(e) => setWithoutPayment(e.target.checked)}
              />
              <Field label="Notes (optional)" htmlFor="notes">
                <Textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
              </Field>
            </div>
          </Card>
        </div>

        <Card className="lg:sticky lg:top-6 flex flex-col gap-3">
          <CardHeader title="Summary" />
          <dl className="text-sm flex flex-col gap-2">
            {[
              ['Customer', user?.name],
              ['Vehicle', vehicle?.registrationNumber],
              ['Plan', plan?.name],
              ['Monthly price', price ? money(price.monthlyPrice) : undefined],
              ['Months', String(months)],
              ['Validity', endDate ? `${fullDate(startDate)} – ${fullDate(endDate)}` : undefined],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between gap-3">
                <dt className="text-muted">{k}</dt>
                <dd className="font-semibold text-right">{v ?? '—'}</dd>
              </div>
            ))}
          </dl>
          <div className="dotted-top pt-3 flex justify-between items-baseline">
            <span className="font-semibold">Total</span>
            <span className="font-display text-2xl font-bold">{money(total)}</span>
          </div>
          {!withoutPayment && Number(amount) > 0 && Number(amount) !== total ? (
            <div className="text-[13px] text-warn-ink">Amount received differs from the total.</div>
          ) : null}
          <FormError error={activate.error} />
          <Button
            type="submit"
            variant="cta"
            size="lg"
            disabled={!ready}
            loading={activate.isPending}
          >
            Activate plan
          </Button>
        </Card>
      </form>
    </>
  );
}
