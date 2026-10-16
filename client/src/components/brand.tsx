import { Link } from 'react-router-dom';
import { useContact } from '../api/hooks';
import { HOME_FOR, useSession } from '../lib/auth';
import { initials } from '../lib/format';
import { HelpMenu } from './HelpMenu';
import { User } from './icons';
import { LogoMark, splitWordmark, type LogoVariant } from './LogoMark';

/** The app name comes from APP_NAME on the server. */
export function useAppName(): string {
  return useContact().data?.appName ?? 'SaafGadi';
}

export function Logo({
  to = '/',
  size = 'md',
  badge,
  variant = 'purple',
}: {
  to?: string;
  size?: 'md' | 'lg';
  badge?: string;
  /** `lime` for dark backgrounds. */
  variant?: LogoVariant;
}) {
  const name = useAppName();
  const [first, second] = splitWordmark(name);
  const dark = variant === 'lime';
  return (
    <Link to={to} className="flex items-center gap-2 no-underline" aria-label={`${name} home`}>
      <LogoMark size={size === 'lg' ? 38 : 34} variant={variant} />
      <span
        className={`font-display font-bold tracking-[-0.4px] leading-none ${size === 'lg' ? 'text-[23px]' : 'text-[20px]'}`}
      >
        <span className={dark ? 'text-white' : 'text-ink'}>{first}</span>
        {second ? <span className={dark ? 'text-cta' : 'text-accent'}>{second}</span> : null}
      </span>
      {badge ? (
        <span className="ml-1 text-[11px] text-muted border border-dots rounded-md px-1.5 py-0.5">
          {badge}
        </span>
      ) : null}
    </Link>
  );
}

/** Header "Log in" / "Open app" pill for public pages. */
export function AccountButton() {
  const { user } = useSession();
  const base =
    'inline-flex items-center gap-2 h-10 rounded-full bg-white border border-line shadow-card ' +
    'text-[15px] font-semibold text-accent-ink no-underline transition hover:border-accent-line hover:bg-accent-soft';
  if (user) {
    return (
      <Link to={HOME_FOR[user.role]} className={`${base} pl-1 pr-4`}>
        <span className="w-8 h-8 rounded-full bg-accent-soft-2 text-accent-deep text-[13px] font-bold flex items-center justify-center">
          {initials(user.name)}
        </span>
        Open app
      </Link>
    );
  }
  return (
    <Link to="/login" className={`${base} px-4`}>
      <User size={18} strokeWidth={2.2} />
      Log in
    </Link>
  );
}

/** Top-right of public pages: Help menu + Log in. The Help popover is positioned against this. */
export function PublicHeaderActions() {
  return (
    <div className="relative flex items-center gap-2">
      <HelpMenu />
      <AccountButton />
    </div>
  );
}
