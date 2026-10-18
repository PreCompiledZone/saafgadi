// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import type { SessionUser } from '@shared/types';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import { VerifyEmailGate } from '../client/src/components/VerifyEmailGate';

const user = (email: string | null): SessionUser => ({
  id: 3,
  name: 'Rohan Kulkarni',
  mobile: '9820012345',
  email,
  emailVerified: false,
  mustVerifyEmail: true,
  role: 'USER',
});

function show(u: SessionUser) {
  const qc = new QueryClient();
  qc.setQueryData(['public', 'contact'], { whatsappNumber: '', callNumber: '' });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <VerifyEmailGate user={u} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

afterEach(cleanup);

describe('verify email gate', () => {
  it('asks for an email when the account has none, even after the user changes', () => {
    const { rerender } = show(user('old@example.com'));
    expect(screen.queryByLabelText('Email')).toBeNull();
    // Same gate, now for an account without an email (e.g. another customer logged in).
    rerender(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter>
          <VerifyEmailGate user={user(null)} />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    expect(screen.getByLabelText('Email')).toBeTruthy();
    expect(screen.queryByText('Wrong email? Change it')).toBeNull();
  });
});
