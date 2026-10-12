import type { ContactInfo } from '@shared/types';

/** `https://wa.me/<digits>?text=<message>`; null when no number is set. */
export function whatsappLink(contact: ContactInfo | undefined, message?: string): string | null {
  if (!contact?.whatsappNumber) return null;
  const text = message ?? contact.whatsappDefaultMessage;
  return `https://wa.me/${contact.whatsappNumber}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
}

/** `tel:+91XXXXXXXXXX`; null when no number is set. */
export function callLink(contact: ContactInfo | undefined): string | null {
  if (!contact?.callNumber) return null;
  return `tel:+${contact.callNumber}`;
}

/** WhatsApp link to a customer (admin side). */
export function whatsappTo(mobile: string, message = ''): string {
  const digits = mobile.replace(/\D/g, '');
  const intl = digits.length === 10 ? `91${digits}` : digits;
  return `https://wa.me/${intl}${message ? `?text=${encodeURIComponent(message)}` : ''}`;
}

export function telTo(mobile: string): string {
  const digits = mobile.replace(/\D/g, '');
  return `tel:+${digits.length === 10 ? `91${digits}` : digits}`;
}

/** Prefilled booking / change-plan message with the customer's details. */
export function bookingMessage(args: {
  contact: ContactInfo | undefined;
  intro?: string;
  name?: string;
  mobile?: string;
  registration?: string;
  vehicle?: string;
  plan?: string;
  start?: string;
}): string {
  const details = [
    args.plan && `Plan: ${args.plan}`,
    args.registration && `Vehicle: ${args.registration}${args.vehicle ? ` (${args.vehicle})` : ''}`,
    args.start && `Start: ${args.start}`,
    args.name && `Name: ${args.name}`,
    args.mobile && `Mobile: ${args.mobile}`,
  ].filter((l): l is string => Boolean(l));
  const intro = (args.intro ?? args.contact?.whatsappDefaultMessage ?? 'Hi!').trim();
  return details.length ? `${intro}\n\n${details.join('\n')}` : intro;
}

/** `Hi SaafGadi` (or just `Hi` before contact info has loaded). */
export function greeting(contact: ContactInfo | undefined): string {
  return contact?.businessName ? `Hi ${contact.businessName}` : 'Hi';
}
