import { useRef } from 'react';
import { cx } from './ui';

/**
 * One box per digit. Typing moves on, Backspace moves back, and pasting (or
 * the phone's one-time-code autofill) fills every box at once.
 */
export function CodeInput({
  value,
  onChange,
  length = 6,
  invalid,
  autoFocus,
  label = 'Code',
}: {
  value: string;
  onChange: (v: string) => void;
  length?: number;
  invalid?: boolean;
  autoFocus?: boolean;
  label?: string;
}) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const digits = Array.from({ length }, (_, i) => value[i] ?? '');

  function fill(from: number, typed: string) {
    const clean = typed.replace(/\D/g, '');
    if (!clean) return;
    const next = (value.slice(0, from) + clean).slice(0, length);
    onChange(next);
    refs.current[Math.min(next.length, length - 1)]?.focus();
  }

  return (
    <div role="group" aria-label={label} className="flex gap-2 justify-between">
      {digits.map((d, i) => (
        <input
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          aria-label={`${label} digit ${i + 1}`}
          inputMode="numeric"
          autoComplete={i === 0 ? 'one-time-code' : 'off'}
          pattern="[0-9]*"
          autoFocus={autoFocus && i === 0}
          value={d}
          maxLength={i === 0 ? length : 1}
          onFocus={(e) => e.target.select()}
          onChange={(e) => {
            const v = e.target.value;
            if (!v) {
              onChange(value.slice(0, i) + value.slice(i + 1));
              return;
            }
            fill(i, v);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Backspace' && !d && i > 0) {
              e.preventDefault();
              onChange(value.slice(0, i - 1));
              refs.current[i - 1]?.focus();
            } else if (e.key === 'ArrowLeft' && i > 0) refs.current[i - 1]?.focus();
            else if (e.key === 'ArrowRight' && i < length - 1) refs.current[i + 1]?.focus();
          }}
          onPaste={(e) => {
            e.preventDefault();
            fill(0, e.clipboardData.getData('text'));
          }}
          className={cx(
            'w-full min-w-0 h-14 rounded-[14px] border bg-white text-center text-2xl font-bold font-display focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft',
            invalid ? 'border-danger' : 'border-line-strong',
          )}
        />
      ))}
    </div>
  );
}
