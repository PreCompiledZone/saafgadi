import {
  CAR_TYPES,
  LABELS,
  vehicleTypeOf,
  type BookingSlot,
  type CarType,
  type VehicleCategory,
} from '@shared/enums';
import type { BookingDto, BookingOptions, UserDto, VehicleDto } from '@shared/types';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api, ApiError } from '../../api/client';
import { useApi, useApiMutation } from '../../api/hooks';
import { Bike, Car, Check, ChevronLeft } from '../../components/icons';
import { slotText, useOneTimeServices } from '../../components/oneTime';
import {
  Button,
  Card,
  Checkbox,
  ChoiceGroup,
  cx,
  EmptyState,
  Field,
  FormError,
  FullPageSpinner,
  Input,
  LinkButton,
  Notice,
  Textarea,
} from '../../components/ui';
import { fullDate, money } from '../../lib/format';

type VehicleMode = 'saved' | 'other';

function Section({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="flex items-center gap-2.5 text-[17px] font-semibold">
        <span className="w-7 h-7 rounded-full bg-accent-soft text-accent-deep text-sm font-bold flex items-center justify-center font-sans">
          {n}
        </span>
        {title}
      </h2>
      {children}
    </section>
  );
}

export function BookOneTime() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const services = useOneTimeServices();
  const vehiclesQ = useApi<VehicleDto[]>(['me', 'vehicles'], '/me/vehicles');
  const profile = useApi<UserDto>(['me', 'profile'], '/me/profile');
  const options = useApi<BookingOptions>(['me', 'booking-options'], '/bookings/options');
  const create = useApiMutation(
    (body: unknown) => api.post<BookingDto>('/bookings', body),
    [['me'], ['bookings']],
  );

  const [serviceId, setServiceId] = useState<number | null>(Number(params.get('service')) || null);
  const [mode, setMode] = useState<VehicleMode>('saved');
  // ?vehicle=<id> from "Need an extra wash?" on the dashboard.
  const [vehicleId, setVehicleId] = useState<number | null>(Number(params.get('vehicle')) || null);
  const [category, setCategory] = useState<VehicleCategory>('CAR');
  const [carType, setCarType] = useState<CarType | null>(null);
  const [reg, setReg] = useState('');
  const [color, setColor] = useState('');
  const [make, setMake] = useState('');
  const [model, setModel] = useState('');
  const [saveVehicle, setSaveVehicle] = useState(false);
  const [addr, setAddr] = useState({
    societyOrBuilding: '',
    flatOrHouseNo: '',
    area: '',
    city: '',
    pincode: '',
  });
  const [parkingNotes, setParkingNotes] = useState('');
  const [date, setDate] = useState('');
  const [slot, setSlot] = useState<BookingSlot | null>(null);
  const [notes, setNotes] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [done, setDone] = useState<BookingDto | null>(null);

  // Prefill the address from the profile, once.
  useEffect(() => {
    const u = profile.data;
    if (!u) return;
    setAddr((a) =>
      a.area || a.societyOrBuilding
        ? a
        : {
            societyOrBuilding: u.societyOrBuilding ?? '',
            flatOrHouseNo: u.flatOrHouseNo ?? '',
            area: u.area ?? '',
            city: u.city ?? '',
            pincode: u.pincode ?? '',
          },
    );
  }, [profile.data]);
  useEffect(() => {
    if (options.data && !date) setDate(options.data.minDate);
  }, [options.data, date]);

  if (services.isLoading || vehiclesQ.isLoading || options.isLoading) return <FullPageSpinner />;
  const list = services.data ?? [];
  const service = list.find((s) => s.id === serviceId) ?? null;
  const saved = (vehiclesQ.data ?? []).filter((v) => v.isActive);
  const useSaved = mode === 'saved' && saved.length > 0;
  const opts = options.data!;

  if (!list.length) {
    return (
      <EmptyState
        title="No one-time washes right now"
        action={<LinkButton to="/app/plans">See monthly plans</LinkButton>}
      />
    );
  }

  if (done) {
    return (
      <div className="pt-6 flex flex-col items-center text-center gap-3">
        <span className="w-16 h-16 rounded-2xl bg-accent-soft-2 text-accent-deep flex items-center justify-center">
          <Check size={30} strokeWidth={2.6} />
        </span>
        <h1 className="text-[26px] font-bold">Booking requested</h1>
        <p className="text-[15px] text-muted">
          {done.ref} · {done.serviceName} for {done.registrationNumber} on {fullDate(done.date)}.
          We’ll confirm the time and email you.
        </p>
        <div className="flex flex-col gap-2.5 w-full mt-4">
          <LinkButton to="/app/history?type=one_time" variant="cta" size="lg">
            Track my booking
          </LinkButton>
          <LinkButton to="/app">Back to home</LinkButton>
        </div>
      </div>
    );
  }

  const chosen = useSaved ? saved.find((v) => v.id === vehicleId) : null;
  const vehicleType = chosen
    ? chosen.vehicleType
    : category === 'BIKE'
      ? 'BIKE'
      : carType
        ? vehicleTypeOf('CAR', carType)
        : null;
  const allowed = (t: string) => !service || service.appliesTo.includes(t as never);
  const price =
    service && vehicleType ? service.prices.find((p) => p.vehicleType === vehicleType) : undefined;
  const limitReached = opts.openCount >= opts.maxOpen;
  const isFull = (d: string, s: BookingSlot) => opts.full.some((f) => f.date === d && f.slot === s);

  async function submit() {
    setErrors({});
    const local: Record<string, string> = {};
    if (!service) local.serviceId = 'Choose a service';
    if (useSaved && !chosen) local.vehicleId = 'Pick a vehicle';
    if (!slot) local.preferredSlot = 'Pick a time slot';
    if (vehicleType && !allowed(vehicleType)) local.vehicleId = 'Not available for this vehicle';
    if (Object.keys(local).length) {
      setErrors(local);
      return;
    }
    try {
      const b = await create.mutateAsync({
        serviceId: service!.id,
        ...(useSaved
          ? { vehicleId: chosen!.id }
          : {
              category,
              carType: category === 'CAR' ? carType : null,
              registrationNumber: reg,
              vehicleColor: color,
              vehicleMake: make,
              vehicleModel: model,
              saveVehicle,
            }),
        ...addr,
        parkingNotes,
        preferredDate: date,
        preferredSlot: slot,
        customerNotes: notes,
      });
      setDone(b);
      window.scrollTo({ top: 0 });
    } catch (err) {
      if (err instanceof ApiError) {
        setErrors(Object.fromEntries(Object.entries(err.fieldErrors).map(([k, v]) => [k, v[0]])));
      }
    }
  }

  return (
    <div className="flex flex-col gap-6 pb-4">
      <div>
        <button
          type="button"
          aria-label="Back"
          onClick={() => navigate(-1)}
          className="w-11 h-11 -ml-3 flex items-center justify-center rounded-full hover:bg-white"
        >
          <ChevronLeft size={22} />
        </button>
        <h1 className="text-[27px] font-bold tracking-[-0.5px]">Book a one-time wash</h1>
        <p className="text-[15px] text-muted mt-1">No plan needed. Pay after we confirm.</p>
      </div>

      {limitReached ? (
        <Notice>
          You have {opts.openCount} open bookings, the most you can have at once.{' '}
          <Link to="/app/history?type=one_time&status=upcoming">See them</Link>
        </Notice>
      ) : null}

      <Section n={1} title="Service">
        <div className="flex flex-col gap-2" role="group" aria-label="Service">
          {list.map((s) => {
            const on = s.id === serviceId;
            return (
              <button
                key={s.id}
                type="button"
                aria-pressed={on}
                onClick={() => setServiceId(s.id)}
                className={cx(
                  'flex items-center gap-3 rounded-2xl bg-white px-4 py-3 text-left',
                  on ? 'border-2 border-accent' : 'border border-line',
                )}
              >
                <span className="flex-1 min-w-0">
                  <span className="block font-semibold">{s.name}</span>
                  <span className="block text-[13px] text-muted">
                    About {s.durationMinutes} min · {s.includes.join(', ')}
                  </span>
                </span>
                <span className="text-sm font-bold shrink-0">from {money(s.fromPrice)}</span>
              </button>
            );
          })}
        </div>
        <FormError error={errors.serviceId} />
      </Section>

      <Section n={2} title="Vehicle">
        {saved.length ? (
          <ChoiceGroup<VehicleMode>
            legend="Which vehicle?"
            columns={2}
            options={[
              { value: 'saved', label: 'A saved vehicle' },
              { value: 'other', label: 'Another vehicle' },
            ]}
            value={mode}
            onChange={setMode}
          />
        ) : null}
        {useSaved ? (
          <div className="flex flex-col gap-2" role="group" aria-label="Saved vehicles">
            {saved.map((v) => {
              const ok = allowed(v.vehicleType);
              const on = v.id === vehicleId;
              return (
                <button
                  key={v.id}
                  type="button"
                  aria-pressed={on}
                  disabled={!ok}
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
                      {v.make} {v.model} · {LABELS.vehicleType[v.vehicleType]} · {v.color}
                      {ok ? '' : ' · not for this service'}
                    </span>
                  </span>
                </button>
              );
            })}
            <FormError error={errors.vehicleId} />
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <ChoiceGroup<VehicleCategory>
              legend="Car or bike"
              columns={2}
              options={(['CAR', 'BIKE'] as const)
                .filter((c) => (c === 'BIKE' ? allowed('BIKE') : CAR_TYPES.some(allowed)))
                .map((c) => ({ value: c, label: LABELS.category[c] }))}
              value={category}
              onChange={(c) => {
                setCategory(c);
                if (c === 'BIKE') setCarType(null);
              }}
              error={errors.category}
            />
            {category === 'CAR' ? (
              <ChoiceGroup<CarType>
                legend="Car type"
                options={CAR_TYPES.filter(allowed).map((t) => ({
                  value: t,
                  label: LABELS.carType[t],
                }))}
                value={carType}
                onChange={setCarType}
                error={errors.carType}
              />
            ) : null}
            <Field
              label="Registration number"
              htmlFor="breg"
              error={errors.registrationNumber}
              hint="As on your number plate, e.g. MH 14 AB 1234"
            >
              <Input
                id="breg"
                value={reg}
                onChange={(e) => setReg(e.target.value)}
                autoCapitalize="characters"
                autoComplete="off"
                spellCheck={false}
                placeholder="MH 14 AB 1234"
                className="uppercase font-bold tracking-[1.5px]"
                invalid={!!errors.registrationNumber}
              />
            </Field>
            <Field
              label="Colour"
              htmlFor="bcolor"
              error={errors.vehicleColor}
              hint="So the washer can find it"
            >
              <Input
                id="bcolor"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                placeholder="White"
                invalid={!!errors.vehicleColor}
              />
            </Field>
            <div className="grid grid-cols-2 gap-2.5">
              <Field
                label={saveVehicle ? 'Make' : 'Make (optional)'}
                htmlFor="bmake"
                error={errors.vehicleMake}
              >
                <Input
                  id="bmake"
                  value={make}
                  onChange={(e) => setMake(e.target.value)}
                  placeholder="Honda"
                  invalid={!!errors.vehicleMake}
                />
              </Field>
              <Field
                label={saveVehicle ? 'Model' : 'Model (optional)'}
                htmlFor="bmodel"
                error={errors.vehicleModel}
              >
                <Input
                  id="bmodel"
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  placeholder="City"
                  invalid={!!errors.vehicleModel}
                />
              </Field>
            </div>
            <Checkbox
              label="Save this vehicle to my account"
              hint="Handy if you book again or take a monthly plan later"
              checked={saveVehicle}
              onChange={(e) => setSaveVehicle(e.target.checked)}
            />
          </div>
        )}
        {service && vehicleType ? (
          <div className="flex justify-between items-baseline bg-white rounded-2xl px-4 py-3 border border-line">
            <span className="text-[15px]">
              {service.name} · {LABELS.vehicleType[vehicleType]}
            </span>
            <span className="font-display font-bold text-xl">
              {price ? money(price.price) : '—'}
            </span>
          </div>
        ) : null}
      </Section>

      <Section n={3} title="Where">
        <div className="grid grid-cols-2 gap-2.5">
          <Field label="Flat / house no." htmlFor="bflat" error={errors.flatOrHouseNo}>
            <Input
              id="bflat"
              value={addr.flatOrHouseNo}
              onChange={(e) => setAddr({ ...addr, flatOrHouseNo: e.target.value })}
              invalid={!!errors.flatOrHouseNo}
            />
          </Field>
          <Field label="Society / building" htmlFor="bsoc" error={errors.societyOrBuilding}>
            <Input
              id="bsoc"
              value={addr.societyOrBuilding}
              onChange={(e) => setAddr({ ...addr, societyOrBuilding: e.target.value })}
              invalid={!!errors.societyOrBuilding}
            />
          </Field>
          <Field label="Area" htmlFor="barea" error={errors.area}>
            <Input
              id="barea"
              value={addr.area}
              onChange={(e) => setAddr({ ...addr, area: e.target.value })}
              invalid={!!errors.area}
            />
          </Field>
          <Field label="City" htmlFor="bcity" error={errors.city}>
            <Input
              id="bcity"
              value={addr.city}
              onChange={(e) => setAddr({ ...addr, city: e.target.value })}
              invalid={!!errors.city}
            />
          </Field>
          <Field label="Pincode" htmlFor="bpin" error={errors.pincode}>
            <Input
              id="bpin"
              inputMode="numeric"
              maxLength={6}
              value={addr.pincode}
              onChange={(e) => setAddr({ ...addr, pincode: e.target.value })}
              invalid={!!errors.pincode}
            />
          </Field>
        </div>
        <Field
          label="Parking spot"
          htmlFor="bpark"
          error={errors.parkingNotes}
          hint={useSaved ? 'Leave empty to use the one saved with the vehicle' : undefined}
        >
          <Input
            id="bpark"
            value={parkingNotes}
            onChange={(e) => setParkingNotes(e.target.value)}
            placeholder="B-wing basement, slot 42"
          />
        </Field>
      </Section>

      <Section n={4} title="When">
        <Field
          label="Preferred date"
          htmlFor="bdate"
          error={errors.preferredDate}
          hint={`${fullDate(opts.minDate)} to ${fullDate(opts.maxDate)}`}
        >
          <Input
            id="bdate"
            type="date"
            min={opts.minDate}
            max={opts.maxDate}
            value={date}
            onChange={(e) => setDate(e.target.value)}
            invalid={!!errors.preferredDate}
          />
        </Field>
        <fieldset className="border-0 m-0 p-0 min-w-0">
          <legend className="font-semibold text-sm p-0 mb-2.5">Preferred time</legend>
          <div className="grid grid-cols-2 gap-2">
            {opts.slots.map((s) => {
              const full = isFull(date, s.key);
              const on = slot === s.key;
              return (
                <button
                  key={s.key}
                  type="button"
                  aria-pressed={on}
                  disabled={full}
                  onClick={() => setSlot(s.key)}
                  className={cx(
                    'min-h-14 rounded-xl px-3 py-2 text-left disabled:opacity-45 disabled:cursor-not-allowed',
                    on
                      ? 'border-2 border-accent bg-accent-soft text-accent-deep'
                      : 'border border-line bg-white',
                  )}
                >
                  <span className="block font-semibold text-[15px]">{s.label}</span>
                  <span className="block text-[13px] text-muted">
                    {full ? 'Full' : `${s.start}–${s.end}`}
                  </span>
                </button>
              );
            })}
          </div>
          {errors.preferredSlot ? (
            <span role="alert" className="block mt-2 text-[13px] font-medium text-danger">
              {errors.preferredSlot}
            </span>
          ) : null}
        </fieldset>
      </Section>

      <Section n={5} title="Notes (optional)">
        <Textarea
          aria-label="Notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Anything the washer should know"
          className="min-h-20"
        />
      </Section>

      <Card className="flex flex-col gap-2 text-[15px]">
        <h2 className="text-[17px] font-semibold mb-1">Summary</h2>
        {[
          ['Service', service?.name ?? '—'],
          [
            'Vehicle',
            chosen
              ? chosen.registrationNumber
              : reg
                ? `${reg.toUpperCase()}${vehicleType ? ` · ${LABELS.vehicleType[vehicleType]}` : ''}`
                : '—',
          ],
          [
            'Where',
            [addr.flatOrHouseNo, addr.societyOrBuilding, addr.area].filter(Boolean).join(', ') ||
              '—',
          ],
          ['When', date && slot ? `${fullDate(date)} · ${slotText(slot, opts.slots)}` : '—'],
          ['Price', price ? money(price.price) : '—'],
        ].map(([k, v]) => (
          <div key={k} className="flex justify-between gap-4">
            <span className="text-muted">{k}</span>
            <span className="font-semibold text-right">{v}</span>
          </div>
        ))}
        <p className="dotted-top pt-3 mt-1 text-[13px] text-muted">
          Pay by cash or UPI after confirmation.
        </p>
      </Card>

      <FormError error={create.error && !Object.keys(errors).length ? create.error : null} />
      <Button
        variant="cta"
        size="lg"
        loading={create.isPending}
        disabled={limitReached}
        onClick={submit}
      >
        Request booking
      </Button>
    </div>
  );
}
