// Sends one-time codes. Each channel is a small sender behind `sendOtp`, so an
// SMS provider can be added later as another channel without touching the flow.
import nodemailer, { type Transporter } from 'nodemailer';
import type { OtpChannel, OtpPurpose } from '../../../shared/enums';
import { getConfig } from '../../config';
import { AppError } from '../../lib/errors';
import { logger } from '../../lib/logger';
import {
  bookingEmail,
  noticeEmail,
  type BookingEmailData,
  type BookingEmailKind,
} from './booking-email';
import { accountExistsEmail, otpEmail } from './otp-email';

export interface OtpMessage {
  channel: OtpChannel;
  destination: string;
  code: string;
  purpose: OtpPurpose;
}

type Sender = (msg: OtpMessage) => Promise<void>;

let transporter: Transporter | undefined;

function smtp(): Transporter {
  if (!transporter) {
    const m = getConfig().mail;
    transporter = nodemailer.createTransport({
      host: m.host,
      port: m.port,
      secure: m.secure,
      auth: { user: m.user, pass: m.pass },
    });
  }
  return transporter;
}

async function deliverEmail(
  to: string,
  mail: { subject: string; text: string; html: string },
  devNote: string,
) {
  const config = getConfig();
  if (!config.mail.enabled) {
    if (config.isProduction) throw new Error('MAIL_ENABLED=false');
    // Local development only: there is no mailbox, so say what would be sent.
    logger.warn(`[dev] Email would be sent to ${to}: ${devNote}`);
    return;
  }
  await smtp().sendMail({
    from: config.mail.from,
    replyTo: config.mail.replyTo,
    to,
    subject: mail.subject,
    text: mail.text,
    html: mail.html,
  });
}

const emailSender: Sender = async (msg) => {
  const config = getConfig();
  const mail = otpEmail({
    appName: config.appName,
    appUrl: config.appUrl,
    code: msg.code,
    purpose: msg.purpose,
    ttlMinutes: config.otp.ttlMinutes,
  });
  await deliverEmail(msg.destination, mail, `${msg.purpose} code ${msg.code}`);
};

const SENDERS: Record<OtpChannel, Sender> = { EMAIL: emailSender };

// ------------------------------------------------------------ tests

/** Codes "sent" while NODE_ENV=test, newest last. */
export const testOutbox: OtpMessage[] = [];
/** "You already have an account" emails "sent" while NODE_ENV=test. */
export const testNotices: { destination: string; kind: 'ACCOUNT_EXISTS' }[] = [];
let failNext = false;
/** Makes the next send fail, to test the 502 path. */
export function failNextSend() {
  failNext = true;
}

const testSender: Sender = async (msg) => {
  if (failNext) {
    failNext = false;
    throw new Error('Simulated send failure');
  }
  testOutbox.push(msg);
};

/** Sends a code. Throws a 502 when the provider fails; the code is never logged. */
export async function sendOtp(msg: OtpMessage): Promise<void> {
  const sender = getConfig().isTest ? testSender : SENDERS[msg.channel];
  try {
    await sender(msg);
  } catch (err) {
    logger.error(`Could not send ${msg.purpose} code by ${msg.channel}: ${(err as Error).message}`);
    throw new AppError(
      502,
      'SEND_FAILED',
      'We couldn’t send the code. Try again or contact us on WhatsApp.',
    );
  }
}

/** Tells someone signing up that their email already has an account. */
export async function sendAccountExistsNotice(destination: string): Promise<void> {
  const config = getConfig();
  try {
    if (config.isTest) {
      if (failNext) {
        failNext = false;
        throw new Error('Simulated send failure');
      }
      testNotices.push({ destination, kind: 'ACCOUNT_EXISTS' });
      return;
    }
    await deliverEmail(
      destination,
      accountExistsEmail({ appName: config.appName, appUrl: config.appUrl }),
      'you already have an account',
    );
  } catch (err) {
    logger.error(`Could not send account-exists email: ${(err as Error).message}`);
    throw new AppError(
      502,
      'SEND_FAILED',
      'We couldn’t send the code. Try again or contact us on WhatsApp.',
    );
  }
}

// ------------------------------------------------------- booking emails

/** Booking emails "sent" while NODE_ENV=test, newest last. */
export const testMails: { to: string; kind: BookingEmailKind; ref: string }[] = [];

/**
 * Sends a booking email. Never throws: the booking change has already happened,
 * so a mail failure is only logged.
 */
export async function sendBookingEmail(
  to: string | null | undefined,
  kind: BookingEmailKind,
  booking: BookingEmailData,
  path: string,
): Promise<void> {
  if (!to) return;
  const config = getConfig();
  try {
    if (config.isTest) {
      testMails.push({ to, kind, ref: booking.ref });
      return;
    }
    await deliverEmail(
      to,
      bookingEmail({ kind, booking, appName: config.appName, appUrl: config.appUrl, path }),
      `booking ${booking.ref} ${kind}`,
    );
  } catch (err) {
    logger.error(`Could not send ${kind} email for ${booking.ref}: ${(err as Error).message}`);
  }
}

// ---------------------------------------------------------- plan emails

export type PlanEmailKind = 'PLAN_REQUESTED' | 'PLAN_REQUEST_ADMIN' | 'PLAN_ACTIVE';

/** Plan emails "sent" while NODE_ENV=test, newest last. */
export const testPlanMails: { to: string; kind: PlanEmailKind; ref: string }[] = [];

export interface PlanEmailData {
  ref: string;
  customerName: string;
  planName: string;
  registrationNumber: string;
  months: number;
  total: number;
  /** Preferred start (request) or actual start (activation), e.g. "Sat, 18 Oct 2026". */
  start: string;
  end?: string;
}

/** Plan request / activation emails. Never throws. */
export async function sendPlanEmail(
  to: string | null | undefined,
  kind: PlanEmailKind,
  d: PlanEmailData,
): Promise<void> {
  if (!to) return;
  const config = getConfig();
  try {
    if (config.isTest) {
      testPlanMails.push({ to, kind, ref: d.ref });
      return;
    }
    const rows: [string, string][] = [
      ['Request', d.ref],
      ['Plan', d.planName],
      ['Vehicle', d.registrationNumber],
      ['Months', String(d.months)],
      ['Total', `₹${d.total.toLocaleString('en-IN')}`],
      [kind === 'PLAN_ACTIVE' ? 'Starts' : 'Preferred start', d.start],
      ...(d.end ? ([['Ends', d.end]] as [string, string][]) : []),
    ];
    const mail =
      kind === 'PLAN_ACTIVE'
        ? {
            subject: `Your ${config.appName} plan is active from ${d.start}`,
            title: 'Your plan is active',
            intro: `Hi ${d.customerName}, ${d.planName} for ${d.registrationNumber} is active from ${d.start}. Your washer will mark every wash in the app.`,
            path: '/app',
            button: 'Open the app',
          }
        : kind === 'PLAN_REQUEST_ADMIN'
          ? {
              subject: `New plan request ${d.ref}`,
              title: 'New plan request',
              intro: `${d.customerName} asked for ${d.planName}. Collect payment and activate it in the admin app.`,
              path: '/admin/plan-requests',
              button: 'Open plan requests',
            }
          : {
              subject: `Plan request received – ${d.ref}`,
              title: 'Plan request received',
              intro: `Hi ${d.customerName}, thanks! Pay by cash or UPI and we'll activate your plan. We'll contact you shortly.`,
              path: '/app',
              button: 'See your request',
            };
    await deliverEmail(
      to,
      noticeEmail({ appName: config.appName, appUrl: config.appUrl, rows, ...mail }),
      `plan ${d.ref} ${kind}`,
    );
  } catch (err) {
    logger.error(`Could not send ${kind} email for ${d.ref}: ${(err as Error).message}`);
  }
}
