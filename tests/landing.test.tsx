// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { ContactInfo } from '@shared/types';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import { Landing } from '../client/src/pages/public/Landing';

const contact: ContactInfo = {
  appName: 'SaafGadi',
  businessName: 'SaafGadi',
  businessAddress: 'Pune',
  supportHours: '',
  whatsappNumber: '919876543210',
  callNumber: '919822001122',
  whatsappDefaultMessage: '',
  supportEmail: 'hello@saafgadi.in',
};

/** Landing with the API answers already cached, so nothing is fetched. */
function renderLanding() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  qc.setQueryData(['public', 'contact'], contact);
  qc.setQueryData(['public', 'plans'], []);
  qc.setQueryData(['auth', 'me'], { user: null });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <Landing />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const helpButton = () => screen.getByRole('button', { name: 'Help' });

afterEach(cleanup);

describe('landing page', () => {
  it('hero has a single CTA: Get started → /signup', () => {
    renderLanding();
    const hero = screen.getByRole('heading', { level: 1 }).closest('div')!.parentElement!;
    const links = within(hero).getAllByRole('link');
    expect(links).toHaveLength(1);
    expect(links[0].textContent).toContain('Get started');
    expect(links[0].getAttribute('href')).toBe('/signup');
    expect(within(hero).queryByText(/whatsapp|call us/i)).toBeNull();
  });

  it('Help toggles the popover; Esc and outside click close it', () => {
    renderLanding();
    const button = helpButton();
    expect(button.getAttribute('aria-haspopup')).toBe('true');
    expect(button.getAttribute('aria-expanded')).toBe('false');

    fireEvent.click(button);
    expect(button.getAttribute('aria-expanded')).toBe('true');
    const popover = document.getElementById(button.getAttribute('aria-controls')!)!;
    expect(popover).toBeTruthy();
    // Focus moves to the first link.
    expect(document.activeElement?.textContent).toBe('Sign up');

    fireEvent.click(button);
    expect(button.getAttribute('aria-expanded')).toBe('false');

    fireEvent.click(button);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(button);

    fireEvent.click(button);
    fireEvent.pointerDown(document.body);
    expect(button.getAttribute('aria-expanded')).toBe('false');
  });

  it('popover shows sign-up and the numbers from settings', () => {
    renderLanding();
    fireEvent.click(helpButton());
    const popover = document.getElementById(helpButton().getAttribute('aria-controls')!)!;
    const p = within(popover);
    expect(p.getByText(/Sign up first so we can activate your plan faster/)).toBeTruthy();
    expect(p.getByRole('link', { name: 'Sign up' }).getAttribute('href')).toBe('/signup');

    const wa = p.getByRole('link', { name: /WhatsApp us/ });
    expect(wa.textContent).toContain('+91 98765 43210');
    expect(wa.getAttribute('href')).toBe(
      'https://wa.me/919876543210?text=' +
        encodeURIComponent('Hi SaafGadi, I have a question before signing up.'),
    );
    const call = p.getByRole('link', { name: /Call us/ });
    expect(call.textContent).toContain('+91 98220 01122');
    expect(call.getAttribute('href')).toBe('tel:+919822001122');
  });

  it('footer shows WhatsApp, call and email from settings', () => {
    renderLanding();
    const footer = within(screen.getByRole('contentinfo'));
    expect(footer.getByRole('link', { name: '+91 98765 43210' }).getAttribute('href')).toMatch(
      /^https:\/\/wa\.me\/919876543210\?text=/,
    );
    expect(footer.getByRole('link', { name: '+91 98220 01122' }).getAttribute('href')).toBe(
      'tel:+919822001122',
    );
    expect(footer.getByRole('link', { name: 'hello@saafgadi.in' }).getAttribute('href')).toBe(
      'mailto:hello@saafgadi.in',
    );
  });
});
