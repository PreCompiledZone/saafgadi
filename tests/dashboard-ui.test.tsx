// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { DEFAULT_BOOKING_SLOTS } from '@shared/enums';
import type {
  ContactInfo,
  OneTimeServiceDto,
  SubscriptionDto,
  UserDashboard,
  UserVehicleSummary,
} from '@shared/types';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import { Dashboard } from '../client/src/pages/user/Dashboard';

const contact: ContactInfo = {
  appName: 'SaafGadi',
  businessName: 'SaafGadi',
  businessAddress: '',
  supportHours: '',
  whatsappNumber: '919876543210',
  callNumber: '',
  whatsappDefaultMessage: '',
  supportEmail: '',
};

const service = (id: number, name: string, price: number): OneTimeServiceDto => ({
  id,
  name,
  description: null,
  includes: [],
  appliesTo: ['SEDAN'],
  durationMinutes: 20,
  isActive: true,
  sortOrder: id,
  prices: [{ vehicleType: 'SEDAN', price }],
  fromPrice: price,
});

const vehicle = {
  id: 5,
  userId: 1,
  category: 'CAR',
  carType: 'SEDAN',
  vehicleType: 'SEDAN',
  registrationNumber: 'MH 12 XY 4321',
  make: 'Honda',
  model: 'City',
  color: 'Grey',
  parkingNotes: null,
  isActive: true,
  hasSubscription: true,
} as UserVehicleSummary['vehicle'];

const carPlan = {
  id: 1,
  name: 'Car Care Plan',
  vehicleCategory: 'CAR',
  description: null,
  isActive: true,
  sortOrder: 1,
  activities: [
    {
      id: 1,
      name: 'Exterior foam wash',
      description: null,
      quotaPerMonth: 15,
      minGapDays: 2,
      sortOrder: 1,
      isActive: true,
    },
  ],
  prices: [
    { vehicleType: 'HATCHBACK', monthlyPrice: 799, isActive: true },
    { vehicleType: 'SEDAN', monthlyPrice: 999, isActive: true },
  ],
};

const sub = (patch: Partial<SubscriptionDto>) =>
  ({
    id: 41,
    userId: 1,
    vehicleId: 5,
    registrationNumber: 'MH 12 XY 4321',
    planId: 1,
    planName: 'Car Care Plan',
    months: 1,
    totalAmount: 999,
    paidAmount: 0,
    startDate: '2026-10-01',
    endDate: '2026-10-31',
    status: 'ACTIVE',
    displayStatus: 'ACTIVE',
    daysLeft: 22,
    createdAt: '2026-10-08T05:00:00Z',
    ...patch,
  }) as SubscriptionDto;

function base(patch: Partial<UserDashboard>): UserDashboard {
  return {
    today: '2026-10-10',
    name: 'Meera Joshi',
    greeting: 'evening',
    state: 'none',
    defaultTab: 'one-time',
    badges: { monthly: false, oneTime: false },
    vehicles: [],
    upcomingBookings: [],
    oneTimeServices: [],
    lowestOneTimePrice: null,
    lowestMonthlyPrice: 799,
    renewWindowDays: 5,
    slots: DEFAULT_BOOKING_SLOTS,
    ...patch,
  };
}

function show(d: UserDashboard, path = '/app') {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  qc.setQueryData(['me', 'dashboard'], d);
  qc.setQueryData(['public', 'contact'], contact);
  qc.setQueryData(['auth', 'me'], { user: null });
  qc.setQueryData(['public', 'plans'], [carPlan]);
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[path]}>
        <Dashboard />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  sessionStorage.clear();
});

const tab = (name: string) => screen.getByRole('button', { name: new RegExp(`^${name}`) });

const activeVehicle: UserVehicleSummary = {
  vehicle,
  displayStatus: 'EXPIRING',
  subscription: sub({ daysLeft: 4, displayStatus: 'EXPIRING' }),
  upcoming: null,
  progress: [
    {
      activityId: 1,
      name: 'Exterior foam wash',
      quota: 15,
      used: 6,
      remaining: 9,
      minGapDays: 2,
      state: 'COMPLETE',
      behindSchedule: false,
      lastDoneDate: '2026-10-10',
      nextDueDate: '2026-10-12',
      periodStart: null,
      periodEnd: null,
      resetDate: null,
    },
  ],
  recent: [],
  washer: null,
  pending: null,
  todayStatus: {
    kind: 'WASHED',
    at: '2026-10-10T02:15:00Z',
    washerFirstName: 'Ravi',
    activityName: 'Exterior foam wash',
  },
  nextWashDate: '2026-10-12',
  canRenew: true,
};

const planUser = (patch: Partial<UserDashboard> = {}) =>
  base({
    state: 'active',
    defaultTab: 'monthly',
    oneTimeServices: [service(1, 'Exterior foam wash', 299)],
    lowestOneTimePrice: 299,
    vehicles: [activeVehicle],
    ...patch,
  });

describe('customer dashboard', () => {
  it('no plan opens on One-time: hero, tiles that select, sticky bar', () => {
    show(
      base({
        oneTimeServices: [service(1, 'Exterior foam wash', 299), service(2, 'Interior clean', 499)],
        lowestOneTimePrice: 299,
      }),
    );
    expect(screen.getByText('Good evening')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Hi, Meera' })).toBeTruthy();
    expect(tab('One-time').getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('heading', { name: 'Need a quick shine?' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Book a one-time wash' }).getAttribute('href')).toBe(
      '/app/book',
    );
    const interior = screen.getByRole('button', { name: /Interior clean/ });
    fireEvent.click(interior);
    expect(interior.getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByText('Interior clean', { selector: 'b' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Book now' }).getAttribute('href')).toBe(
      '/app/book?service=2',
    );
    expect(screen.getByText('Monthly plans from ₹799/month')).toBeTruthy();
  });

  it('Monthly tab without a plan lists plans with "Request plan" and is never empty', () => {
    show(base({}));
    expect(screen.getByText(/coming soon/)).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Book now' })).toBeNull();
    fireEvent.click(tab('Monthly'));
    expect(screen.getByText('Add your vehicle to book a monthly plan')).toBeTruthy();
    const card = screen.getByRole('heading', { name: 'Car Care Plan' }).closest('article')!;
    expect(within(card).getByText('₹799/month')).toBeTruthy();
    expect(within(card).getByRole('link', { name: 'Request plan' }).getAttribute('href')).toBe(
      '/app/plans/1/book',
    );
    // The choice is kept for this session.
    expect(sessionStorage.getItem('saafgadi.dashboardTab')).toBe('monthly');
  });

  it('pending only opens on Monthly with the request card, WhatsApp and an in-page cancel', () => {
    const pending = sub({ id: 123, status: 'PENDING', displayStatus: 'PENDING', months: 3 });
    show(
      base({
        defaultTab: 'monthly',
        badges: { monthly: true, oneTime: false },
        vehicles: [
          {
            ...activeVehicle,
            displayStatus: 'PENDING',
            subscription: null,
            progress: [],
            pending,
            todayStatus: null,
            nextWashDate: null,
            canRenew: false,
          },
        ],
      }),
    );
    expect(tab('Monthly').getAttribute('aria-pressed')).toBe('true');
    const card = screen.getByRole('region', { name: 'Plan request' });
    expect(within(card).getByText('Plan requested – pending activation')).toBeTruthy();
    expect(within(card).getByText(/SG-S-000123/)).toBeTruthy();
    expect(
      within(card)
        .getByRole('link', { name: /Message us on WhatsApp/ })
        .getAttribute('href'),
    ).toBe(
      'https://wa.me/919876543210?text=' +
        encodeURIComponent('Hi SaafGadi, plan request SG-S-000123 for MH 12 XY 4321'),
    );
    fireEvent.click(within(card).getByRole('button', { name: 'Cancel request' }));
    expect(within(card).getByText('Cancel this request?')).toBeTruthy();
  });

  it('active plan opens on Monthly: plan card and extra-wash card, no hero or sticky bar', () => {
    show(planUser({ badges: { monthly: true, oneTime: true } }));
    expect(tab('Monthly').getAttribute('aria-pressed')).toBe('true');
    // Dot on the tab that isn't selected.
    expect(within(tab('One-time')).getByText('(has updates)')).toBeTruthy();
    expect(within(tab('Monthly')).queryByText('(has updates)')).toBeNull();
    const plan = screen.getByRole('region', { name: 'Your plan' });
    expect(within(plan).getByText('Ends soon')).toBeTruthy();
    expect(within(plan).getByText(/Washed today at/)).toBeTruthy();
    expect(within(plan).getByText(/by Ravi/)).toBeTruthy();
    expect(within(plan).getByText('6')).toBeTruthy();
    expect(within(plan).getByRole('link', { name: 'Renew plan' }).getAttribute('href')).toBe(
      '/app/plans/1/book?renew=41',
    );
    expect(screen.queryByText('No subscription needed')).toBeNull();
    expect(screen.queryByRole('link', { name: 'Book now' })).toBeNull();

    // "Book" on the extra-wash card switches to One-time with this vehicle.
    fireEvent.click(screen.getByRole('button', { name: 'Book' }));
    expect(tab('One-time').getAttribute('aria-pressed')).toBe('true');
    expect(
      screen.getByRole('heading', { name: 'Book a wash for another vehicle or an extra wash' }),
    ).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Book now' }).getAttribute('href')).toBe(
      '/app/book?service=1&vehicle=5',
    );
  });

  it('?tab=one-time overrides the default', () => {
    show(planUser(), '/app?tab=one-time');
    expect(tab('One-time').getAttribute('aria-pressed')).toBe('true');
    expect(screen.queryByRole('region', { name: 'Your plan' })).toBeNull();
  });
});
