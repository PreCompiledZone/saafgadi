import { LABELS, SUBSCRIPTION_MONTH_OPTIONS, subscriptionRef } from '@shared/enums';
import type { SubscriptionDto, VehicleDto } from '@shared/types';
import { useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api, ApiError } from '../../api/client';
import { useApi, useApiMutation, useContact, usePublicPlans } from '../../api/hooks';
import { Bike, Car, Check, ChevronLeft, Plus, WhatsApp } from '../../components/icons';
import { PlanServices, priceText } from '../../components/PlanCard';
import {
  AnchorButton,
  Button,
  Card,
  ChoiceGroup,
  cx,
  EmptyState,
  Field,
  FormError,
  FullPageSpinner,
  Input,
  LinkButton,
} from '../../components/ui';
import { VehicleForm } from '../../components/VehicleForm';
import { greeting, whatsappLink } from '../../lib/contact';
import { addDaysIso, fullDate, money } from '../../lib/format';
import { todayIst } from '../../lib/forms';

const START_MAX_DAYS = 30;

/** Request a monthly plan (PENDING until we activate it), or renew one (?renew=<id>). */
export function BookPlan() {
  const { planId } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const contact = useContact().data;
  const plans = usePublicPlans();
  const vehiclesQ = useApi<VehicleDto[]>(['me', 'vehicles'], '/me/vehicles');
  const subsQ = useApi<SubscriptionDto[]>(['me', 'subscriptions'], '/me/subscriptions');
  const renewId = Number(params.get('renew')) || null;
  const today = todayIst();
  const [vehicleId, setVehicleId] = useState<number | null>(Number(params.get('vehicle')) || null);
  const [adding, setAdding] = useState(false);
  const [months, setMonths] = useState<number>(1);
  const [start, setStart] = useState(addDaysIso(today, 1));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [done, setDone] = useState<SubscriptionDto | null>(null);
  const request = useApiMutation(
    (body: unknown) =>
      renewId
        ? api.post<SubscriptionDto>(`/subscriptions/${renewId}/renew`, body)
        : api.post<SubscriptionDto>('/subscriptions', body),
    [['me']],
  );
  const addVehicle = useApiMutation(
    (body: unknown) => api.post<VehicleDto>('/me/vehicles', body),
    [['me']],
  );

  if (plans.isLoading || vehiclesQ.isLoading || subsQ.isLoading) return <FullPageSpinner />;
  const plan = plans.data?.find((p) => p.id === Number(planId));
  if (!plan) {
    return (
      <EmptyState
        title="Plan not found"
        action={<LinkButton to="/app/plans">See plans</LinkButton>}
      />
    );
  }
  const subs = subsQ.data ?? [];
  const renewing = renewId ? subs.find((s) => s.id === renewId) : undefined;
  const busy = (v: VehicleDto) =>
    subs.some(
      (s) =>
        s.vehicleId === v.id &&
        (s.status === 'PENDING' || (s.status === 'ACTIVE' && s.endDate >= today)),
    );
  const vehicles = (vehiclesQ.data ?? []).filter((v) => v.isActive);
  const vehicle = renewing
    ? vehicles.find((v) => v.id === renewing.vehicleId)
    : vehicles.find((v) => v.id === vehicleId);
  const price = vehicle
    ? plan.prices.find((p) => p.vehicleType === vehicle.vehicleType && p.isActive)
    : undefined;
  const startDate = renewing ? addDaysIso(renewing.endDate, 1) : start;
  const shortName = plan.name.replace(/ plan$/i, '');

  if (done) {
    const ref = subscriptionRef(done.id);
    const wa = whatsappLink(
      contact,
      `${greeting(contact)}, plan request ${ref} for ${done.registrationNumber}`,
    );
    return (
      <div className="pt-6 flex flex-col items-center text-center gap-3">
        <span className="w-16 h-16 rounded-2xl bg-accent-soft-2 text-accent-deep flex items-center justify-center">
          <Check size={30} strokeWidth={2.6} />
        </span>
        <h1 className="text-[26px] font-bold">Plan requested</h1>
        <p className="text-[15px] text-muted">
          {ref} · {done.planName} for {done.registrationNumber}, {done.months}{' '}
          {done.months === 1 ? 'month' : 'months'} from {fullDate(done.startDate)}. Pay by cash or
          UPI and we’ll activate it.
        </p>
        <div className="flex flex-col gap-2.5 w-full mt-4">
          {wa ? (
            <AnchorButton
              href={wa}
              target="_blank"
              rel="noopener noreferrer"
              variant="cta"
              size="lg"
            >
              <WhatsApp size={18} /> Message us on WhatsApp
            </AnchorButton>
          ) : null}
          <LinkButton to="/app">Back to home</LinkButton>
        </div>
      </div>
    );
  }

  async function submit() {
    setErrors({});
    if (!vehicle) {
      setErrors({ vehicleId: 'Choose a vehicle' });
      return;
    }
    try {
      const s = await request.mutateAsync(
        renewing
          ? { months }
          : { vehicleId: vehicle.id, planId: plan!.id, months, preferredStartDate: start },
      );
      setDone(s);
      window.scrollTo({ top: 0 });
    } catch (err) {
      if (err instanceof ApiError) {
        setErrors(Object.fromEntries(Object.entries(err.fieldErrors).map(([k, v]) => [k, v[0]])));
      }
    }
  }

  return (
    <div className="flex flex-col gap-5 pb-4">
      <div>
        <button
          type="button"
          aria-label="Back"
          onClick={() => navigate(-1)}
          className="w-11 h-11 -ml-3 flex items-center justify-center rounded-full hover:bg-white"
        >
          <ChevronLeft size={22} />
        </button>
        <h1 className="text-[27px] font-bold tracking-[-0.5px]">
          {renewing ? `Renew ${shortName}` : `Book ${shortName}`}
        </h1>
      </div>
      <Card>
        <h2 className="text-[15px] font-semibold mb-3">Included every month</h2>
        <PlanServices plan={plan} />
      </Card>

      <section className="flex flex-col gap-2.5">
        <h2 className="text-[17px] font-semibold">Vehicle</h2>
        {renewing ? (
          <Card className="font-semibold">
            <span className="plate">{renewing.registrationNumber}</span>
            <span className="block text-[13px] text-muted font-normal">
              Current plan ends {fullDate(renewing.endDate)}
            </span>
          </Card>
        ) : (
          <>
            <div className="flex flex-col gap-2" role="group" aria-label="Your vehicles">
              {vehicles.map((v) => {
                const wrongType = v.category !== plan.vehicleCategory;
                const taken = busy(v);
                const on = v.id === vehicleId;
                return (
                  <button
                    key={v.id}
                    type="button"
                    aria-pressed={on}
                    disabled={wrongType || taken}
                    onClick={() => setVehicleId(v.id)}
                    className={cx(
                      'flex items-center gap-3 rounded-2xl bg-white px-4 py-3 text-left disabled:opacity-50',
                      on ? 'border-2 border-accent' : 'border border-line',
                    )}
                  >
                    {v.category === 'CAR' ? <Car size={22} /> : <Bike size={22} />}
                    <span className="flex-1 min-w-0">
                      <span className="block font-bold plate">{v.registrationNumber}</span>
                      <span className="block text-[13px] text-muted">
                        {v.make} {v.model} · {LABELS.vehicleType[v.vehicleType]}
                        {wrongType
                          ? ` · ${plan.name} is for ${plan.vehicleCategory === 'CAR' ? 'cars' : 'bikes'}`
                          : taken
                            ? ' · already has a plan or request'
                            : ''}
                      </span>
                    </span>
                    {!wrongType && !taken ? (
                      <span className="text-sm font-bold">
                        {priceText(
                          plan.prices.find((p) => p.vehicleType === v.vehicleType)?.monthlyPrice,
                        )}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
            <FormError error={errors.vehicleId} />
            {adding ? (
              <Card className="flex flex-col gap-3">
                <h3 className="font-semibold">Add a vehicle</h3>
                <VehicleForm
                  defaultValues={{ category: plan.vehicleCategory }}
                  submitLabel="Save vehicle"
                  onSubmit={async (v) => {
                    const saved = await addVehicle.mutateAsync(v);
                    setVehicleId(saved.id);
                    setAdding(false);
                  }}
                  secondary={
                    <Button variant="ghost" onClick={() => setAdding(false)}>
                      Cancel
                    </Button>
                  }
                />
              </Card>
            ) : (
              <Button variant="ghost" className="self-start" onClick={() => setAdding(true)}>
                <Plus size={18} /> Add a new {plan.vehicleCategory === 'CAR' ? 'car' : 'bike'}
              </Button>
            )}
          </>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-[17px] font-semibold">Duration and start</h2>
        <ChoiceGroup<number>
          legend="Months"
          columns={4}
          options={SUBSCRIPTION_MONTH_OPTIONS.map((m) => ({ value: m, label: String(m) }))}
          value={months}
          onChange={setMonths}
        />
        {renewing ? (
          <p className="text-[15px]">
            Starts <b>{fullDate(startDate)}</b>, the day after your current plan ends.
          </p>
        ) : (
          <Field
            label="Preferred start date"
            htmlFor="pstart"
            error={errors.preferredStartDate}
            hint={`Tomorrow up to ${START_MAX_DAYS} days ahead`}
          >
            <Input
              id="pstart"
              type="date"
              min={addDaysIso(today, 1)}
              max={addDaysIso(today, START_MAX_DAYS)}
              value={start}
              onChange={(e) => setStart(e.target.value)}
            />
          </Field>
        )}
      </section>

      <Card className="flex flex-col gap-2 text-[15px]">
        <h2 className="text-[17px] font-semibold mb-1">Summary</h2>
        {[
          ['Plan', plan.name],
          ['Vehicle', vehicle?.registrationNumber ?? '—'],
          ['Months', String(months)],
          ['Monthly price', price ? money(price.monthlyPrice) : '—'],
          ['Starts', fullDate(startDate)],
        ].map(([k, v]) => (
          <div key={k} className="flex justify-between gap-4">
            <span className="text-muted">{k}</span>
            <span className="font-semibold text-right">{v}</span>
          </div>
        ))}
        <div className="flex justify-between gap-4 dotted-top pt-3 mt-1">
          <span className="font-semibold">Total</span>
          <span className="font-display font-bold text-xl">
            {price ? money(price.monthlyPrice * months) : '—'}
          </span>
        </div>
        <p className="text-[13px] text-muted">Pay by cash or UPI. We’ll contact you to activate.</p>
      </Card>

      <FormError error={request.error && !Object.keys(errors).length ? request.error : null} />
      <Button variant="cta" size="lg" loading={request.isPending} onClick={submit}>
        {renewing ? 'Request renewal' : 'Request plan'}
      </Button>
    </div>
  );
}
