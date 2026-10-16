import { useEffect, useId, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useContact } from '../api/hooks';
import { callLink, displayPhone, visitorHelpMessage, whatsappLink } from '../lib/contact';
import { useSession } from '../lib/auth';
import { HelpCircle, Phone, WhatsApp } from './icons';
import { buttonClass } from './ui';

const pill =
  'inline-flex items-center gap-1.5 h-10 rounded-full bg-white border border-line shadow-card ' +
  'text-[15px] font-semibold text-accent-ink transition hover:border-accent-line hover:bg-accent-soft';

const row =
  'flex items-center gap-3 rounded-xl px-2 py-2 no-underline text-ink hover:bg-canvas hover:text-ink';

/**
 * Header "Help" button with a small popover: sign up first, or WhatsApp / call us.
 * Below `sm` the popover is positioned against the nearest positioned ancestor
 * (the header actions), so it lines up with the page gutter instead of overflowing.
 */
export function HelpMenu() {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const firstRef = useRef<HTMLAnchorElement>(null);
  const popoverId = useId();
  const { pathname } = useLocation();
  const { user } = useSession();
  const contact = useContact().data;
  const wa = whatsappLink(contact, visitorHelpMessage(contact));
  const tel = callLink(contact);

  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    if (!open) return;
    firstRef.current?.focus();
    const onPointer = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const signup = !user;
  if (!signup && !wa && !tel) return null;

  return (
    <div ref={rootRef} className="sm:relative">
      <button
        ref={buttonRef}
        type="button"
        className={`${pill} px-2.5 min-[360px]:pl-3 min-[360px]:pr-4`}
        aria-haspopup="true"
        aria-expanded={open}
        aria-controls={popoverId}
        onClick={() => setOpen((o) => !o)}
      >
        <HelpCircle size={18} strokeWidth={2.2} />
        <span className="sr-only min-[360px]:not-sr-only">Help</span>
      </button>
      {open ? (
        <div
          id={popoverId}
          className="absolute right-0 top-full mt-2 z-40 w-[min(300px,calc(100vw-32px))] rounded-[18px] bg-white border border-line shadow-float p-3 flex flex-col gap-3 text-left motion-safe:animate-popover-in"
        >
          {signup ? (
            <>
              <p className="text-sm text-muted px-1 pt-1">
                New here? Sign up first so we can activate your plan faster.
              </p>
              <Link ref={firstRef} to="/signup" className={buttonClass('cta', 'md', 'w-full')}>
                Sign up
              </Link>
            </>
          ) : null}
          {signup && (wa || tel) ? <div className="dotted-top" role="separator" /> : null}
          {wa || tel ? (
            <div className="flex flex-col">
              {wa ? (
                <a
                  ref={signup ? undefined : firstRef}
                  href={wa}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={row}
                >
                  <RowIcon>
                    <WhatsApp size={18} />
                  </RowIcon>
                  <RowText title="WhatsApp us" sub={displayPhone(contact!.whatsappNumber)} />
                </a>
              ) : null}
              {tel ? (
                <a ref={signup || wa ? undefined : firstRef} href={tel} className={row}>
                  <RowIcon>
                    <Phone size={18} />
                  </RowIcon>
                  <RowText title="Call us" sub={displayPhone(contact!.callNumber)} />
                </a>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function RowIcon({ children }: { children: React.ReactNode }) {
  return (
    <span className="w-9 h-9 shrink-0 rounded-[10px] bg-accent-soft text-accent-ink flex items-center justify-center">
      {children}
    </span>
  );
}

function RowText({ title, sub }: { title: string; sub: string }) {
  return (
    <span className="flex flex-col min-w-0">
      <span className="text-[15px] font-semibold">{title}</span>
      <span className="text-xs text-muted tabular-nums">{sub}</span>
    </span>
  );
}
