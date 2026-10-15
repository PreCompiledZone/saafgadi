import type { SessionUser } from '@shared/types';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError } from '../api/client';
import { CodeInput } from './CodeInput';
import { ContactButtons } from './contact';
import { Button, FormError } from './ui';

const CODE_LENGTH = 6;

/** Seconds left on a resend countdown, from a 429's retryAfterSeconds or the default. */
export function useCountdown() {
  const [left, setLeft] = useState(0);
  useEffect(() => {
    if (left <= 0) return;
    const t = setTimeout(() => setLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [left]);
  return [left, setLeft] as const;
}

export function retryAfter(err: unknown): number | null {
  if (err instanceof ApiError && err.status === 429) {
    const d = err.details as { retryAfterSeconds?: number } | undefined;
    return d?.retryAfterSeconds ?? 60;
  }
  return null;
}

/** Shows WhatsApp / Call when the code could not be sent. */
export function SendError({ error }: { error: unknown }) {
  if (!error) return null;
  return (
    <div className="flex flex-col gap-2.5">
      <FormError error={error as Error} />
      {error instanceof ApiError && error.code === 'SEND_FAILED' ? (
        <ContactButtons message="Hi, I’m not receiving the code for my SaafGadi account." />
      ) : null}
    </div>
  );
}

/**
 * Sends a code to `email` (once on mount when `autoSend`) and checks what the
 * customer types. Calls `onVerified` with the updated user.
 */
export function EmailVerify({
  email,
  autoSend,
  onVerified,
}: {
  email: string;
  autoSend?: boolean;
  onVerified: (user: SessionUser) => void;
}) {
  const [code, setCode] = useState('');
  const [left, setLeft] = useCountdown();
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [sendError, setSendError] = useState<unknown>(null);
  const [verifyError, setVerifyError] = useState<unknown>(null);
  const [verifying, setVerifying] = useState(false);

  const send = useCallback(async () => {
    setSending(true);
    setSendError(null);
    try {
      await api.post('/auth/otp/send', { email, purpose: 'VERIFY_EMAIL' });
      setSent(true);
      setLeft(60);
    } catch (err) {
      const wait = retryAfter(err);
      if (wait) {
        // A code was sent moments ago and is still valid: let them type it.
        setLeft(wait);
        setSent(true);
      }
      setSendError(err);
    } finally {
      setSending(false);
    }
  }, [email, setLeft]);

  const once = useRef(false);
  useEffect(() => {
    if (autoSend && !once.current) {
      once.current = true;
      void send();
    }
  }, [autoSend, send]);

  async function verify(value = code) {
    if (value.length !== CODE_LENGTH) return;
    setVerifying(true);
    setVerifyError(null);
    try {
      const { user } = await api.post<{ user: SessionUser }>('/auth/otp/verify-email', {
        code: value,
      });
      onVerified(user);
    } catch (err) {
      setVerifyError(err);
      setCode('');
    } finally {
      setVerifying(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {sent || !autoSend ? (
        <p className="text-[15px] text-muted">
          {sent ? (
            <>
              We sent a {CODE_LENGTH}-digit code to <b className="text-ink">{email}</b>.
            </>
          ) : (
            <>
              We’ll send a {CODE_LENGTH}-digit code to <b className="text-ink">{email}</b>.
            </>
          )}
        </p>
      ) : null}
      {sent ? (
        <>
          <CodeInput
            value={code}
            length={CODE_LENGTH}
            invalid={!!verifyError}
            autoFocus
            onChange={(v) => {
              setCode(v);
              setVerifyError(null);
              if (v.length === CODE_LENGTH) void verify(v);
            }}
          />
          <FormError error={verifyError as Error | null} />
          <Button
            variant="cta"
            size="lg"
            block
            loading={verifying}
            disabled={code.length !== CODE_LENGTH}
            onClick={() => verify()}
          >
            Verify email
          </Button>
        </>
      ) : null}
      <SendError error={sendError} />
      <Button
        variant={sent ? 'ghost' : 'cta'}
        size={sent ? 'md' : 'lg'}
        block
        loading={sending}
        disabled={left > 0}
        onClick={send}
      >
        {left > 0 ? `Resend code in ${left}s` : sent ? 'Resend code' : 'Send code'}
      </Button>
      {sent ? (
        <p className="text-[13px] text-muted text-center">Didn’t get it? Check spam.</p>
      ) : null}
    </div>
  );
}
