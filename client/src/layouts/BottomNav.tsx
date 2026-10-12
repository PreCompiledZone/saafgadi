import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { cx } from '../components/ui';

export function BottomNav({
  items,
}: {
  items: { to: string; label: string; icon: ReactNode; end?: boolean }[];
}) {
  return (
    <nav
      aria-label="Main"
      className="fixed bottom-0 inset-x-0 z-40 px-4 pb-[max(16px,env(safe-area-inset-bottom))] pointer-events-none"
    >
      <div
        className="pointer-events-auto mx-auto max-w-lg grid bg-white rounded-[22px] p-1.5 shadow-nav"
        style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}
      >
        {items.map((i) => (
          <NavLink
            key={i.to}
            to={i.to}
            end={i.end}
            className={({ isActive }) =>
              cx(
                'flex flex-col items-center gap-0.5 py-2 rounded-2xl text-xs no-underline transition-colors',
                isActive
                  ? 'bg-accent-soft text-accent-deep font-semibold'
                  : 'text-muted hover:text-ink',
              )
            }
          >
            {i.icon}
            {i.label}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
