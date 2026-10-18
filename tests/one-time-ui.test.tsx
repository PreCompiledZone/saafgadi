// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { DEFAULT_BOOKING_SLOTS } from '@shared/enums';
import type {
  BookingDto,
  BookingOptions,
  ContactInfo,
  MyWashes as Washes,
  OneTimeServiceDto,
} from '@shared/types';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import { Landing } from '../client/src/pages/public/Landing';
import { BookOneTime } from '../client/src/pages/user/BookOneTime';
import { MyWashes } from '../client/src/pages/user/MyWashes';

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

const service: OneTimeServiceDto = {
  id: 7,
  name: 'Exterior foam wash',
  description: 'Foam wash at your parking spot.',
  includes: ['Foam wash', 'Tyre wipe'],
  appliesTo: ['HATCHBACK', 'SEDAN', 'SUV', 'BIKE'],
  durationMinutes: 20,
  isActive: true,
  sortOrder: 1,
  prices: [
    { vehicleType: 'HATCHBACK', price: 299 },
    { vehicleType: 'SEDAN', price: 349 },
    { vehicleType: 'SUV', price: 399 },
    { vehicleType: 'BIKE', price: 149 },
  ],
  fromPrice: 149,
};

function renderWith(ui: ReactNode, data: [unknown[], unknown][], path = '/') {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  qc.setQueryData(['public', 'contact'], contact);
  qc.setQueryData(['auth', 'me'], { user: null });
  for (const [key, value] of data) qc.setQueryData(key, value);
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[path]}>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}

afterEach(cleanup);

describe('one-time wash screens', () => {
  it('welcome page toggles between monthly plans and one-time washes', () => {
    renderWith(<Landing />, [
      [['public', 'plans'], []],
      [['public', 'one-time-services'], [service]],
    ]);
    const monthly = screen.getByRole('button', { name: 'Monthly plans' });
    const oneTime = screen.getByRole('button', { name: 'One-time wash' });
    expect(monthly.getAttribute('aria-pressed')).toBe('true');
    expect(screen.queryByRole('heading', { name: 'Exterior foam wash' })).toBeNull();

    fireEvent.click(oneTime);
    expect(oneTime.getAttribute('aria-pressed')).toBe('true');
    const card = screen.getByRole('heading', { name: 'Exterior foam wash' }).closest('article')!;
    expect(within(card).getByText('₹149')).toBeTruthy();
    expect(within(card).getByRole('link', { name: 'Book now' }).getAttribute('href')).toBe(
      '/app/book?service=7',
    );
  });

  it('booking form shows the live price for the chosen vehicle type', () => {
    const options: BookingOptions = {
      today: '2026-10-10',
      minDate: '2026-10-11',
      maxDate: '2026-10-24',
      slots: DEFAULT_BOOKING_SLOTS,
      full: [{ date: '2026-10-11', slot: 'EVENING' }],
      openCount: 0,
      maxOpen: 3,
      cancelCutoffHours: 12,
    };
    renderWith(
      <BookOneTime />,
      [
        [['public', 'one-time-services'], [service]],
        [['me', 'vehicles'], []],
        [['me', 'profile'], { societyOrBuilding: 'Pebble Park', area: 'Hadapsar' }],
        [['me', 'booking-options'], options],
      ],
      '/app/book?service=7',
    );
    expect(
      screen.getByRole('button', { name: /Exterior foam wash/ }).getAttribute('aria-pressed'),
    ).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'SUV' }));
    expect(screen.getAllByText('₹399').length).toBeGreaterThan(0);
    // Full slots can't be picked; address came from the profile.
    expect((screen.getByRole('button', { name: /Evening/ }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    expect((screen.getByLabelText('Society / building') as HTMLInputElement).value).toBe(
      'Pebble Park',
    );
    expect(screen.getByText('Pay by cash or UPI after confirmation.')).toBeTruthy();
  });

  it('"My washes" shows a one-time booking with its timeline and cancel button', () => {
    const booking = {
      id: 12,
      ref: 'SG-B-000012',
      serviceName: 'Exterior foam wash',
      registrationNumber: 'MH 12 AB 1234',
      vehicleType: 'SEDAN',
      price: 349,
      status: 'CONFIRMED',
      date: '2026-10-11',
      slot: 'MORNING',
      scheduledDate: '2026-10-11',
      assignedWasherName: 'Ravi',
      paymentStatus: 'UNPAID',
      canCancel: true,
      events: [
        { fromStatus: null, toStatus: 'REQUESTED', createdAt: '2026-10-10T03:00:00Z' },
        { fromStatus: 'REQUESTED', toStatus: 'CONFIRMED', createdAt: '2026-10-10T04:00:00Z' },
      ],
    } as unknown as BookingDto;
    const data: Washes = {
      items: [
        {
          kind: 'ONE_TIME',
          date: booking.date,
          registrationNumber: booking.registrationNumber,
          booking,
        },
      ],
      total: 1,
      page: 1,
      pageSize: 20,
      registrations: ['MH 12 AB 1234'],
      slots: DEFAULT_BOOKING_SLOTS,
    };
    // range=any: no date bounds, so the query key is predictable.
    renderWith(
      <MyWashes />,
      [[['me', 'washes', 'one_time', '', '', '', '', 1], data]],
      '/app/history?type=one_time&range=any',
    );
    return screen.findByText('SG-B-000012', { exact: false }).then(() => {
      expect(screen.getByRole('button', { name: 'One-time' }).getAttribute('aria-pressed')).toBe(
        'true',
      );
      const progress = screen.getByRole('list', { name: 'Booking progress' });
      expect(within(progress).getByText('Confirmed')).toBeTruthy();
      expect(screen.getByText('Ravi')).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Cancel booking' })).toBeTruthy();
    });
  });
});
