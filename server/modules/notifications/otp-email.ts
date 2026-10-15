// The one-time code email: subject, plain text and HTML, in the brand colours.
import type { OtpPurpose } from '../../../shared/enums';

const PURPLE = '#8B3FC7';
const INK = '#1E1B22';
const BG = '#F4F1EE';

const WHAT: Record<OtpPurpose, string> = {
  SIGNUP: 'to create your account',
  VERIFY_EMAIL: 'to verify your email',
  RESET_PASSWORD: 'to reset your password',
};

const escape = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );

export function otpEmail(args: {
  appName: string;
  appUrl: string;
  code: string;
  purpose: OtpPurpose;
  ttlMinutes: number;
}) {
  const { appName, code, purpose, ttlMinutes } = args;
  const logo = `${args.appUrl.replace(/\/$/, '')}/brand/saafgadi-logo.png`;
  const subject = `Your ${appName} code: ${code}`;
  const text = [
    `Your ${appName} code ${WHAT[purpose]} is: ${code}`,
    '',
    `Valid for ${ttlMinutes} minutes.`,
    '',
    "If you didn't ask for this, you can ignore this email.",
  ].join('\n');
  const name = escape(appName);
  const html = `<!doctype html>
<html><body style="margin:0;padding:0;background:${BG};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BG};padding:32px 16px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:440px;background:#ffffff;border-radius:18px;padding:32px 28px;font-family:Arial,Helvetica,sans-serif;color:${INK};">
<tr><td align="center" style="padding-bottom:20px;"><img src="${escape(logo)}" width="64" height="64" alt="${name}" style="display:block;border:0;border-radius:14px;"></td></tr>
<tr><td align="center" style="font-size:16px;line-height:1.5;padding-bottom:20px;">Here is your ${name} code ${WHAT[purpose]}:</td></tr>
<tr><td align="center" style="padding-bottom:20px;"><div style="display:inline-block;font-size:34px;font-weight:bold;letter-spacing:10px;color:${PURPLE};background:${BG};border-radius:12px;padding:14px 18px 14px 28px;font-family:'Courier New',Courier,monospace;">${escape(code)}</div></td></tr>
<tr><td align="center" style="font-size:14px;color:${INK};padding-bottom:24px;">Valid for ${ttlMinutes} minutes.</td></tr>
<tr><td align="center" style="font-size:13px;line-height:1.5;color:#6f6875;border-top:1px dashed #e2ddd8;padding-top:18px;">If you didn't ask for this, you can ignore this email.</td></tr>
</table>
</td></tr>
</table>
</body></html>`;
  return { subject, text, html };
}

/** Sent instead of a sign-up code when the email already has an account. */
export function accountExistsEmail(args: { appName: string; appUrl: string }) {
  const base = args.appUrl.replace(/\/$/, '');
  const name = escape(args.appName);
  const subject = `You already have a ${args.appName} account`;
  const text = [
    `Someone (hopefully you) tried to sign up to ${args.appName} with this email, but it already has an account.`,
    '',
    `Log in: ${base}/login`,
    `Forgot your password? Reset it: ${base}/forgot-password`,
    '',
    "If this wasn't you, you can ignore this email.",
  ].join('\n');
  const button = (href: string, label: string, filled: boolean) =>
    `<a href="${escape(href)}" style="display:inline-block;margin:4px;padding:12px 20px;border-radius:12px;font-weight:bold;font-size:15px;text-decoration:none;${filled ? `background:${PURPLE};color:#ffffff;` : `background:${BG};color:${INK};`}">${label}</a>`;
  const html = `<!doctype html>
<html><body style="margin:0;padding:0;background:${BG};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BG};padding:32px 16px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:440px;background:#ffffff;border-radius:18px;padding:32px 28px;font-family:Arial,Helvetica,sans-serif;color:${INK};">
<tr><td align="center" style="padding-bottom:20px;"><img src="${escape(`${base}/brand/saafgadi-logo.png`)}" width="64" height="64" alt="${name}" style="display:block;border:0;border-radius:14px;"></td></tr>
<tr><td align="center" style="font-size:20px;font-weight:bold;padding-bottom:12px;">You already have a ${name} account</td></tr>
<tr><td align="center" style="font-size:15px;line-height:1.5;padding-bottom:22px;">Someone tried to sign up with this email, but it already has an account. Log in, or reset your password if you’ve forgotten it.</td></tr>
<tr><td align="center" style="padding-bottom:24px;">${button(`${base}/login`, 'Log in', true)}${button(`${base}/forgot-password`, 'Reset password', false)}</td></tr>
<tr><td align="center" style="font-size:13px;line-height:1.5;color:#6f6875;border-top:1px dashed #e2ddd8;padding-top:18px;">If this wasn't you, you can ignore this email.</td></tr>
</table>
</td></tr>
</table>
</body></html>`;
  return { subject, text, html };
}
