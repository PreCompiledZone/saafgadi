// One-time wash emails: received, confirmed, cancelled, washed. Same look as the code emails.
import { BG, escape, INK, PURPLE } from './otp-email';

export type BookingEmailKind = 'RECEIVED' | 'ADMIN_NEW' | 'CONFIRMED' | 'CANCELLED' | 'COMPLETED';

export interface BookingEmailData {
  ref: string;
  customerName: string;
  serviceName: string;
  registrationNumber: string;
  /** e.g. "Sat, 18 Oct · Morning (8:00–10:00)" */
  when: string;
  address: string;
  price: number;
  washerFirstName?: string | null;
  /** "you" or "us" */
  cancelledBy?: 'customer' | 'admin';
  reason?: string | null;
  completedAt?: string | null;
}

function content(kind: BookingEmailKind, b: BookingEmailData, appName: string) {
  const rows: [string, string][] = [
    ['Booking', b.ref],
    ['Service', b.serviceName],
    ['Vehicle', b.registrationNumber],
    ['When', b.when],
    ['Where', b.address],
    ['Price', `₹${b.price.toLocaleString('en-IN')}`],
  ];
  switch (kind) {
    case 'RECEIVED':
      return {
        subject: `We've received your booking ${b.ref}`,
        title: 'Booking received',
        intro: `Hi ${b.customerName}, thanks for booking with ${appName}. We'll confirm the date and time shortly. Pay by cash or UPI after confirmation.`,
        rows,
      };
    case 'ADMIN_NEW':
      return {
        subject: `New one-time booking ${b.ref}`,
        title: 'New booking',
        intro: `${b.customerName} asked for a one-time wash. Confirm it in the admin app.`,
        rows,
      };
    case 'CONFIRMED':
      return {
        subject: `Booking ${b.ref} confirmed`,
        title: 'Booking confirmed',
        intro: `Hi ${b.customerName}, your wash is confirmed${b.washerFirstName ? ` with ${b.washerFirstName}` : ''}.`,
        rows,
      };
    case 'CANCELLED':
      return {
        subject: `Booking ${b.ref} cancelled`,
        title: 'Booking cancelled',
        intro:
          b.cancelledBy === 'customer'
            ? `Hi ${b.customerName}, you cancelled this booking.`
            : `Hi ${b.customerName}, we had to cancel this booking${b.reason ? `: ${b.reason}` : '.'}`,
        rows,
      };
    case 'COMPLETED':
      return {
        subject: `Your vehicle is washed ✓ (${b.ref})`,
        title: 'Your vehicle is washed ✓',
        intro: `Hi ${b.customerName}, ${b.registrationNumber} was washed${b.completedAt ? ` at ${b.completedAt}` : ''}. Thanks for choosing ${appName}!`,
        rows,
      };
  }
}

/** A branded notice: title, intro, a details table and one button. Text and HTML versions. */
export function noticeEmail(args: {
  appName: string;
  appUrl: string;
  subject: string;
  title: string;
  intro: string;
  rows: [string, string][];
  /** Path on the app, e.g. /app */
  path: string;
  button: string;
}) {
  const base = args.appUrl.replace(/\/$/, '');
  const link = `${base}${args.path}`;
  const text = [
    args.intro,
    '',
    ...args.rows.map(([k, v]) => `${k}: ${v}`),
    '',
    `${args.button}: ${link}`,
  ].join('\n');
  const name = escape(args.appName);
  const html = `<!doctype html>
<html><body style="margin:0;padding:0;background:${BG};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BG};padding:32px 16px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:440px;background:#ffffff;border-radius:18px;padding:32px 28px;font-family:Arial,Helvetica,sans-serif;color:${INK};">
<tr><td align="center" style="padding-bottom:20px;"><img src="${escape(`${base}/brand/saafgadi-logo.png`)}" width="64" height="64" alt="${name}" style="display:block;border:0;border-radius:14px;"></td></tr>
<tr><td align="center" style="font-size:20px;font-weight:bold;padding-bottom:12px;">${escape(args.title)}</td></tr>
<tr><td align="center" style="font-size:15px;line-height:1.5;padding-bottom:20px;">${escape(args.intro)}</td></tr>
<tr><td style="padding-bottom:22px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BG};border-radius:12px;padding:12px 16px;font-size:14px;">
${args.rows.map(([k, v]) => `<tr><td style="padding:5px 0;color:#6f6875;width:80px;vertical-align:top;">${escape(k)}</td><td style="padding:5px 0;font-weight:bold;">${escape(v)}</td></tr>`).join('\n')}
</table></td></tr>
<tr><td align="center" style="padding-bottom:8px;"><a href="${escape(link)}" style="display:inline-block;padding:12px 20px;border-radius:12px;font-weight:bold;font-size:15px;text-decoration:none;background:${PURPLE};color:#ffffff;">${escape(args.button)}</a></td></tr>
</table>
</td></tr>
</table>
</body></html>`;
  return { subject: args.subject, text, html };
}

export function bookingEmail(args: {
  kind: BookingEmailKind;
  booking: BookingEmailData;
  appName: string;
  appUrl: string;
  path: string;
}) {
  const c = content(args.kind, args.booking, args.appName);
  return noticeEmail({
    appName: args.appName,
    appUrl: args.appUrl,
    subject: c.subject,
    title: c.title,
    intro: c.intro,
    rows: c.rows,
    path: args.path,
    button: args.kind === 'ADMIN_NEW' ? 'Open booking' : 'Track your booking',
  });
}
