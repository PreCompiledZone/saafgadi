// Sends one-time codes. Each channel is a small sender behind `sendOtp`, so an
// SMS provider can be added later as another channel without touching the flow.
import nodemailer, { type Transporter } from 'nodemailer';
import type { OtpChannel, OtpPurpose } from '../../../shared/enums';
import { getConfig } from '../../config';
import { AppError } from '../../lib/errors';
import { logger } from '../../lib/logger';
import { otpEmail } from './otp-email';

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

const emailSender: Sender = async (msg) => {
  const config = getConfig();
  const mail = otpEmail({
    appName: config.appName,
    appUrl: config.appUrl,
    code: msg.code,
    purpose: msg.purpose,
    ttlMinutes: config.otp.ttlMinutes,
  });
  if (!config.mail.enabled) {
    if (config.isProduction) throw new Error('MAIL_ENABLED=false');
    // Local development only: there is no mailbox, so show the code here.
    logger.warn(
      `[dev] Email would be sent to ${msg.destination} (${msg.purpose}). Code: ${msg.code}`,
    );
    return;
  }
  await smtp().sendMail({
    from: config.mail.from,
    replyTo: config.mail.replyTo,
    to: msg.destination,
    subject: mail.subject,
    text: mail.text,
    html: mail.html,
  });
};

const SENDERS: Record<OtpChannel, Sender> = { EMAIL: emailSender };

// ------------------------------------------------------------ tests

/** Codes "sent" while NODE_ENV=test, newest last. */
export const testOutbox: OtpMessage[] = [];
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
