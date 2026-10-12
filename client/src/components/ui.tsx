import {
  createContext,
  forwardRef,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { Link, type LinkProps } from 'react-router-dom';
import type { ApiError } from '../api/client';
import { Alert, CheckCircle, X } from './icons';

export function cx(...c: (string | false | null | undefined)[]): string {
  return c.filter(Boolean).join(' ');
}

// ---------------------------------------------------------------- buttons

type Variant = 'cta' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'accent';
type Size = 'lg' | 'md' | 'sm';

const variants: Record<Variant, string> = {
  cta: 'bg-cta border border-cta-line text-ink hover:brightness-[0.97] active:brightness-95',
  secondary: 'bg-white border border-line text-ink hover:bg-[#faf8f6] active:bg-sand/60',
  outline: 'bg-transparent border-[1.5px] border-accent-ink text-accent-ink hover:bg-accent-soft',
  ghost: 'bg-transparent text-accent-ink hover:bg-accent-soft',
  danger: 'bg-white border border-[#efc7b5] text-danger hover:bg-danger-soft',
  accent: 'bg-accent border border-accent text-white hover:bg-accent-ink',
};
const sizes: Record<Size, string> = {
  lg: 'h-14 px-5 text-base rounded-[14px]',
  md: 'h-[50px] px-4 text-[15px] rounded-[14px]',
  sm: 'h-10 px-3.5 text-sm rounded-xl',
};

export function buttonClass(variant: Variant = 'secondary', size: Size = 'md', extra?: string) {
  return cx(
    'inline-flex items-center justify-center gap-2 font-semibold select-none transition',
    'disabled:opacity-50 disabled:cursor-not-allowed no-underline',
    variants[variant],
    sizes[size],
    extra,
  );
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  block?: boolean;
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'secondary',
    size = 'md',
    loading,
    block,
    className,
    children,
    disabled,
    type = 'button',
    ...rest
  },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={buttonClass(variant, size, cx(block && 'w-full', className))}
      {...rest}
    >
      {loading ? <Spinner size={18} /> : null}
      {children}
    </button>
  );
});

export function LinkButton({
  variant = 'secondary',
  size = 'md',
  block,
  className,
  ...rest
}: LinkProps & { variant?: Variant; size?: Size; block?: boolean }) {
  return (
    <Link className={buttonClass(variant, size, cx(block && 'w-full', className))} {...rest} />
  );
}

/** External link (WhatsApp, tel:) styled as a button. */
export function AnchorButton({
  variant = 'secondary',
  size = 'md',
  block,
  className,
  ...rest
}: React.AnchorHTMLAttributes<HTMLAnchorElement> & {
  variant?: Variant;
  size?: Size;
  block?: boolean;
}) {
  return <a className={buttonClass(variant, size, cx(block && 'w-full', className))} {...rest} />;
}

// ------------------------------------------------------------ containers

export function Card({
  children,
  className,
  as: Tag = 'section',
  ...rest
}: {
  children: ReactNode;
  className?: string;
  as?: 'section' | 'div' | 'article';
} & React.HTMLAttributes<HTMLElement>) {
  return (
    <Tag className={cx('bg-white rounded-[18px] p-[18px] shadow-card', className)} {...rest}>
      {children}
    </Tag>
  );
}

export function CardHeader({
  title,
  action,
  sub,
}: {
  title: ReactNode;
  action?: ReactNode;
  sub?: ReactNode;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 mb-3">
      <div className="min-w-0">
        <h2 className="text-[17px] font-semibold leading-tight">{title}</h2>
        {sub ? <div className="text-[13px] text-muted mt-0.5">{sub}</div> : null}
      </div>
      {action}
    </div>
  );
}

export function PageTitle({
  title,
  eyebrow,
  actions,
}: {
  title: ReactNode;
  eyebrow?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        {eyebrow ? <div className="text-sm text-muted">{eyebrow}</div> : null}
        <h1 className="mt-0.5 text-[27px] md:text-[30px] font-bold tracking-[-0.5px] leading-tight">
          {title}
        </h1>
      </div>
      {actions ? <div className="flex flex-wrap gap-2.5">{actions}</div> : null}
    </div>
  );
}

// ----------------------------------------------------------- data bits

export function Plate({
  children,
  size = 'md',
  className,
}: {
  children: ReactNode;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const s = {
    sm: 'text-[13px] px-2 py-0.5 border-[1.5px] rounded-md',
    md: 'text-lg px-2.5 py-1 border-2 rounded-lg',
    lg: 'text-xl px-3.5 py-1.5 border-2 rounded-lg',
  }[size];
  return (
    <span
      className={cx(
        'inline-block border-ink font-bold plate whitespace-nowrap leading-tight',
        s,
        className,
      )}
    >
      {children}
    </span>
  );
}

type Tone = 'active' | 'accent' | 'warn' | 'danger' | 'neutral' | 'muted';
const tones: Record<Tone, string> = {
  active: 'bg-cta border border-cta-line text-ink',
  accent: 'bg-accent-soft text-accent-deep',
  warn: 'bg-warn-soft text-warn-ink',
  danger: 'bg-danger-soft text-danger',
  neutral: 'bg-canvas text-ink border border-line',
  muted: 'bg-canvas text-muted',
};

export function Badge({
  tone = 'neutral',
  children,
  className,
  dot,
}: {
  tone?: Tone;
  children: ReactNode;
  className?: string;
  dot?: boolean;
}) {
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1 whitespace-nowrap text-xs font-bold px-2.5 py-1 rounded-full leading-none',
        tones[tone],
        className,
      )}
    >
      {dot ? <span aria-hidden="true">●</span> : null}
      {children}
    </span>
  );
}

export function Tag({ tone = 'accent', children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span
      className={cx(
        'inline-block text-xs font-semibold px-2 py-0.5 rounded-md align-middle',
        tones[tone],
      )}
    >
      {children}
    </span>
  );
}

export function Progress({
  value,
  max,
  label,
  tone = 'accent',
  height = 10,
}: {
  value: number;
  max: number;
  label: string;
  tone?: 'accent' | 'warn';
  height?: number;
}) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={max}
      className="rounded-full bg-track overflow-hidden"
      style={{ height }}
    >
      <div
        className={cx(
          'h-full rounded-full transition-[width]',
          tone === 'warn' ? 'bg-amber' : 'bg-accent',
        )}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

export function Stat({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: 'danger' | 'accent';
}) {
  return (
    <div className="bg-white rounded-[18px] p-[18px] shadow-card min-w-0">
      <div className="text-[13px] text-muted">{label}</div>
      <div
        className={cx(
          'font-display text-[28px] md:text-[32px] font-bold mt-1 leading-tight truncate',
          tone === 'danger' && 'text-danger',
          tone === 'accent' && 'text-accent-ink',
        )}
      >
        {value}
      </div>
      {sub ? <div className="text-[13px] text-muted">{sub}</div> : null}
    </div>
  );
}

/** Vertical timeline row (dot + connector), as on the samples. */
export function TimelineItem({
  marker,
  last,
  children,
}: {
  marker: ReactNode;
  last?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="flex gap-3.5">
      <div className="flex flex-col items-center">
        {marker}
        {!last ? <span className="w-0.5 flex-1 min-h-5 bg-accent-line" /> : null}
      </div>
      <div className={cx('min-w-0 flex-1', !last && 'pb-3.5')}>{children}</div>
    </div>
  );
}

export function Dot({
  tone = 'accent',
  children,
}: {
  tone?: 'accent' | 'warn' | 'empty' | 'ring';
  children?: ReactNode;
}) {
  const t = {
    accent: 'bg-accent text-white',
    warn: 'bg-warn-soft text-warn-ink',
    empty: 'bg-white border-2 border-dots',
    ring: 'bg-accent-soft border-2 border-accent',
  }[tone];
  return (
    <span
      className={cx('w-6 h-6 shrink-0 rounded-full flex items-center justify-center box-border', t)}
    >
      {children}
    </span>
  );
}

// --------------------------------------------------------------- forms

export function Field({
  label,
  error,
  hint,
  children,
  htmlFor,
  className,
}: {
  label?: ReactNode;
  error?: string;
  hint?: ReactNode;
  children: ReactNode;
  htmlFor?: string;
  className?: string;
}) {
  return (
    <div className={cx('flex flex-col gap-2 min-w-0', className)}>
      {label ? (
        <label htmlFor={htmlFor} className="font-semibold text-sm">
          {label}
        </label>
      ) : null}
      {children}
      {error ? (
        <span role="alert" className="text-[13px] font-medium text-danger">
          {error}
        </span>
      ) : hint ? (
        <span className="text-[13px] text-muted">{hint}</span>
      ) : null}
    </div>
  );
}

const control =
  'w-full min-w-0 h-[52px] rounded-[14px] border bg-white px-3.5 text-base text-ink placeholder:text-[#9a939f] ' +
  'focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/20 disabled:bg-canvas disabled:text-muted';

export const Input = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }
>(function Input({ className, invalid, ...rest }, ref) {
  return (
    <input
      ref={ref}
      aria-invalid={invalid || undefined}
      className={cx(control, invalid ? 'border-danger' : 'border-line', className)}
      {...rest}
    />
  );
});

export const Select = forwardRef<
  HTMLSelectElement,
  SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean }
>(function Select({ className, invalid, children, ...rest }, ref) {
  return (
    <select
      ref={ref}
      aria-invalid={invalid || undefined}
      className={cx(
        control,
        'appearance-none bg-no-repeat pr-10',
        invalid ? 'border-danger' : 'border-line',
        className,
      )}
      style={{
        backgroundImage:
          "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='20' height='20' viewBox='0 0 24 24' fill='none' stroke='%235F5966' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E\")",
        backgroundPosition: 'right 14px center',
      }}
      {...rest}
    >
      {children}
    </select>
  );
});

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }
>(function Textarea({ className, invalid, ...rest }, ref) {
  return (
    <textarea
      ref={ref}
      aria-invalid={invalid || undefined}
      className={cx(
        control,
        'h-auto min-h-24 py-3',
        invalid ? 'border-danger' : 'border-line',
        className,
      )}
      {...rest}
    />
  );
});

export function Checkbox({
  label,
  hint,
  ...rest
}: InputHTMLAttributes<HTMLInputElement> & { label: ReactNode; hint?: ReactNode }) {
  const id = useId();
  return (
    <div className="flex gap-3 items-start">
      <input
        id={id}
        type="checkbox"
        className="mt-0.5 w-5 h-5 accent-[#8b3fc7] shrink-0"
        {...rest}
      />
      <label htmlFor={id} className="text-[15px]">
        <span className="font-semibold">{label}</span>
        {hint ? <span className="block text-[13px] text-muted">{hint}</span> : null}
      </label>
    </div>
  );
}

/** Pill buttons that act as a single-choice group (aria-pressed). */
export function ChoiceGroup<T extends string | number>({
  legend,
  options,
  value,
  onChange,
  columns = 3,
  error,
}: {
  legend: string;
  options: { value: T; label: ReactNode }[];
  value: T | null | undefined;
  onChange: (v: T) => void;
  columns?: number;
  error?: string;
}) {
  return (
    <fieldset className="border-0 m-0 p-0 min-w-0">
      <legend className="font-semibold text-sm p-0 mb-2.5">{legend}</legend>
      <div
        className="grid gap-2"
        style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
      >
        {options.map((o) => {
          const on = o.value === value;
          return (
            <button
              key={String(o.value)}
              type="button"
              aria-pressed={on}
              onClick={() => onChange(o.value)}
              className={cx(
                'h-11 rounded-xl px-2 text-[15px] transition',
                on
                  ? 'border-2 border-accent bg-accent-soft font-semibold text-accent-deep'
                  : 'border border-line bg-white text-ink hover:border-line-strong',
              )}
            >
              {o.label}
            </button>
          );
        })}
      </div>
      {error ? (
        <span role="alert" className="block mt-2 text-[13px] font-medium text-danger">
          {error}
        </span>
      ) : null}
    </fieldset>
  );
}

export function Switch({
  checked,
  onChange,
  label,
  id,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  id?: string;
}) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cx(
        'shrink-0 w-[52px] h-8 rounded-full p-[3px] flex transition-colors',
        checked ? 'bg-accent justify-end' : 'bg-line-strong justify-start',
      )}
    >
      <span className="w-[26px] h-[26px] rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,.2)]" />
    </button>
  );
}

export function FormError({ error }: { error?: ApiError | Error | null | string }) {
  if (!error) return null;
  const message = typeof error === 'string' ? error : error.message;
  return (
    <div
      role="alert"
      className="flex gap-2.5 items-start rounded-xl bg-danger-soft text-danger px-3.5 py-3 text-sm font-medium"
    >
      <Alert size={18} className="shrink-0 mt-px" />
      <span>{message}</span>
    </div>
  );
}

export function Notice({
  children,
  tone = 'accent',
  icon,
}: {
  children: ReactNode;
  tone?: 'accent' | 'warn';
  icon?: ReactNode;
}) {
  return (
    <div
      className={cx(
        'flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm',
        tone === 'accent' ? 'bg-accent-soft text-accent-deep' : 'bg-warn-soft text-warn-ink',
      )}
    >
      {icon}
      <span className="min-w-0">{children}</span>
    </div>
  );
}

// ------------------------------------------------------------- states

export function Spinner({ size = 22, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={cx('animate-spin', className)}
      aria-hidden="true"
    >
      <circle
        cx="12"
        cy="12"
        r="9"
        fill="none"
        stroke="currentColor"
        strokeOpacity="0.2"
        strokeWidth="3"
      />
      <path
        d="M21 12a9 9 0 0 0-9-9"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function FullPageSpinner() {
  return (
    <div
      className="min-h-[60vh] flex items-center justify-center text-accent"
      role="status"
      aria-label="Loading"
    >
      <Spinner size={30} />
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  children,
  action,
}: {
  icon?: ReactNode;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center text-center gap-2 py-10 px-6">
      {icon ? (
        <span className="w-12 h-12 rounded-2xl bg-accent-soft text-accent-ink flex items-center justify-center mb-1">
          {icon}
        </span>
      ) : null}
      <div className="font-display font-semibold text-[17px]">{title}</div>
      {children ? <div className="text-[15px] text-muted max-w-sm">{children}</div> : null}
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: Error | null; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center text-center gap-2 py-10 px-6" role="alert">
      <span className="w-12 h-12 rounded-2xl bg-danger-soft text-danger flex items-center justify-center mb-1">
        <Alert size={22} />
      </span>
      <div className="font-display font-semibold text-[17px]">Couldn’t load this</div>
      <div className="text-[15px] text-muted max-w-sm">
        {error?.message ?? 'Something went wrong.'}
      </div>
      {onRetry ? (
        <Button className="mt-3" size="sm" onClick={onRetry}>
          Try again
        </Button>
      ) : null}
    </div>
  );
}

/** Renders loading / error / content for a query. */
export function QueryView<T>({
  query,
  children,
  loading,
}: {
  query: { data: T | undefined; isLoading: boolean; error: Error | null; refetch: () => unknown };
  children: (data: T) => ReactNode;
  loading?: ReactNode;
}) {
  if (query.isLoading) return <>{loading ?? <FullPageSpinner />}</>;
  if (query.error || query.data === undefined) {
    return <ErrorState error={query.error} onRetry={() => query.refetch()} />;
  }
  return <>{children(query.data)}</>;
}

// ------------------------------------------------------------- dialog

export function Sheet({
  open,
  onClose,
  title,
  children,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    requestAnimationFrame(() => {
      const first = ref.current?.querySelector<HTMLElement>(
        'input, select, textarea, button:not([data-close])',
      );
      (first ?? ref.current)?.focus();
    });
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
      previous?.focus?.();
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-ink/40" onClick={onClose} aria-hidden="true" />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={cx(
          'relative w-full bg-canvas rounded-t-[24px] sm:rounded-[24px] max-h-[92vh] overflow-y-auto shadow-float',
          wide ? 'sm:max-w-2xl' : 'sm:max-w-md',
        )}
      >
        <div className="sticky top-0 z-10 bg-canvas flex items-center justify-between gap-3 px-5 pt-5 pb-3">
          <h2 id={titleId} className="text-lg font-semibold">
            {title}
          </h2>
          <button
            type="button"
            data-close
            onClick={onClose}
            aria-label="Close"
            className="w-11 h-11 -mr-2 rounded-full flex items-center justify-center text-muted hover:bg-sand"
          >
            <X size={20} />
          </button>
        </div>
        <div className="px-5 pb-6 safe-bottom">{children}</div>
      </div>
    </div>
  );
}

// -------------------------------------------------------------- toasts

const ToastContext = createContext<(message: string) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<{ id: number; message: string }[]>([]);
  const push = useCallback((message: string) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, message }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3200);
  }, []);
  return (
    <ToastContext.Provider value={push}>
      {children}
      <div
        aria-live="polite"
        className="fixed z-[60] bottom-24 sm:bottom-6 left-1/2 -translate-x-1/2 flex flex-col gap-2 items-center w-[calc(100%-32px)] max-w-sm pointer-events-none"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            className="pointer-events-auto flex items-center gap-2 bg-ink text-white text-sm font-medium px-4 py-3 rounded-2xl shadow-float"
          >
            <CheckCircle size={18} className="text-cta shrink-0" />
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
