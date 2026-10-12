import type { Paged, SocietyDto, UserDto, WasherDto } from '@shared/types';
import { forwardRef, useEffect, useState, type ReactNode } from 'react';
import { qs } from '../../api/client';
import { useApi } from '../../api/hooks';
import { Search } from '../../components/icons';
import { cx, Input, Select, Spinner } from '../../components/ui';

export function Table({
  head,
  children,
  minWidth = 640,
}: {
  head: ReactNode[];
  children: ReactNode;
  minWidth?: number;
}) {
  return (
    <div className="overflow-x-auto -mx-[18px]">
      <table className="w-full border-collapse text-sm" style={{ minWidth }}>
        <thead>
          <tr className="text-left text-muted text-xs tracking-[0.6px] uppercase">
            {head.map((h, i) => (
              <th
                key={i}
                scope="col"
                className="px-2 py-2 first:pl-[18px] last:pr-[18px] font-semibold whitespace-nowrap"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export function Tr({ children, onClick }: { children: ReactNode; onClick?: () => void }) {
  return (
    <tr
      onClick={onClick}
      className={cx('dotted-top align-middle', onClick && 'cursor-pointer hover:bg-canvas/60')}
    >
      {children}
    </tr>
  );
}

export function Td({ children, className }: { children?: ReactNode; className?: string }) {
  return <td className={cx('px-2 py-3 first:pl-[18px] last:pr-[18px]', className)}>{children}</td>;
}

export function SearchBox({
  value,
  onChange,
  placeholder = 'Search',
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
}) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  useEffect(() => {
    const t = setTimeout(() => {
      if (text !== value) onChange(text);
    }, 300);
    return () => clearTimeout(t);
  }, [text, value, onChange]);
  return (
    <div className={cx('relative min-w-0', className)}>
      <Search
        size={18}
        className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted pointer-events-none"
      />
      <Input
        type="search"
        aria-label={placeholder}
        placeholder={placeholder}
        value={text}
        onChange={(e) => setText(e.target.value)}
        className="pl-10 h-12"
      />
    </div>
  );
}

/** Customer search-and-pick, used by activation and payments. */
export function UserPicker({
  value,
  onChange,
}: {
  value: UserDto | null;
  onChange: (u: UserDto | null) => void;
}) {
  const [search, setSearch] = useState('');
  const q = useApi<Paged<UserDto>>(
    ['admin', 'users', 'picker', search],
    search.length >= 2 ? `/admin/users${qs({ search, pageSize: 8 })}` : null,
  );
  if (value) {
    return (
      <div className="flex items-center justify-between gap-3 bg-white border border-line rounded-[14px] px-3.5 py-3">
        <div className="min-w-0">
          <div className="font-semibold truncate">{value.name}</div>
          <div className="text-[13px] text-muted">
            {value.mobile}
            {value.societyOrBuilding ? ` · ${value.societyOrBuilding}` : ''}
          </div>
        </div>
        <button
          type="button"
          className="font-semibold text-accent-ink text-sm"
          onClick={() => onChange(null)}
        >
          Change
        </button>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      <SearchBox value={search} onChange={setSearch} placeholder="Name, mobile or vehicle number" />
      {q.isFetching ? (
        <div className="text-accent px-2">
          <Spinner size={18} />
        </div>
      ) : null}
      {q.data?.items.length ? (
        <ul className="bg-white rounded-[14px] border border-line divide-y divide-line overflow-hidden">
          {q.data.items.map((u) => (
            <li key={u.id}>
              <button
                type="button"
                className="w-full text-left px-3.5 py-3 hover:bg-canvas"
                onClick={() => onChange(u)}
              >
                <div className="font-semibold">{u.name}</div>
                <div className="text-[13px] text-muted">
                  {u.mobile}
                  {u.societyOrBuilding ? ` · ${u.societyOrBuilding}` : ''}
                </div>
              </button>
            </li>
          ))}
        </ul>
      ) : search.length >= 2 && q.data ? (
        <div className="text-sm text-muted px-1">No customers match “{search}”.</div>
      ) : null}
    </div>
  );
}

export function useWashers() {
  return useApi<WasherDto[]>(['admin', 'washers'], '/admin/washers');
}

export const WasherSelect = forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement> & { emptyLabel?: string }
>(function WasherSelect({ emptyLabel = 'Not assigned', ...rest }, ref) {
  const washers = useWashers();
  return (
    <Select ref={ref} {...rest}>
      <option value="">{emptyLabel}</option>
      {(washers.data ?? [])
        .filter((w) => w.isActive || String(w.id) === String(rest.value))
        .map((w) => (
          <option key={w.id} value={w.id}>
            {w.name} ({w.assignedCount} assigned)
          </option>
        ))}
    </Select>
  );
});

export function FilterTabs<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex gap-1.5 overflow-x-auto pb-1" role="tablist">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={o.value === value}
          onClick={() => onChange(o.value)}
          className={cx(
            'shrink-0 h-10 px-3.5 rounded-xl text-sm font-semibold',
            o.value === value
              ? 'bg-white text-accent-deep shadow-card'
              : 'text-muted hover:text-ink',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** List state (page, search, filters); changing a filter resets to page 1. */
export function useListParams<T extends Record<string, string>>(defaults: T) {
  const [state, setState] = useState<T & { page: string }>({ page: '1', ...defaults });
  const set = (patch: Partial<T & { page: string }>) =>
    setState((s) => ({ ...s, page: 'page' in patch ? String(patch.page) : '1', ...patch }));
  return [state, set] as const;
}

/** Filter dropdown of onboarded societies. */
export function SocietySelect({
  value,
  onChange,
  id = 'societyFilter',
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  id?: string;
  className?: string;
}) {
  const q = useApi<SocietyDto[]>(['admin', 'societies'], '/admin/societies');
  return (
    <Select
      id={id}
      aria-label="Society"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={className}
    >
      <option value="">All societies</option>
      {(q.data ?? []).map((s) => (
        <option key={s.id} value={s.id}>
          {s.name}
        </option>
      ))}
    </Select>
  );
}
