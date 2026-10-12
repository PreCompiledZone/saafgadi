import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import type { Paged, EnquiryDto } from '@shared/types';
import { useApi } from '../api/hooks';
import { Logo, useAppName } from '../components/brand';
import { Logout, Menu, X } from '../components/icons';
import { cx } from '../components/ui';
import { useAuthActions, useSession } from '../lib/auth';

const NAV = [
  { to: '/admin', label: 'Dashboard', end: true },
  { to: '/admin/subscriptions', label: 'Subscriptions' },
  { to: '/admin/users', label: 'Users' },
  { to: '/admin/societies', label: 'Societies' },
  { to: '/admin/washers', label: 'Washers' },
  { to: '/admin/vehicles', label: 'Vehicles' },
  { to: '/admin/plans', label: 'Plans & pricing' },
  { to: '/admin/payments', label: 'Payments' },
  { to: '/admin/wash-logs', label: 'Wash logs' },
  { to: '/admin/enquiries', label: 'Enquiries', badge: true },
  { to: '/admin/settings', label: 'Settings' },
  { to: '/admin/admins', label: 'Admins' },
];

function SideNav({ onNavigate }: { onNavigate?: () => void }) {
  const open = useApi<Paged<EnquiryDto>>(
    ['admin', 'enquiries', 'open-count'],
    '/admin/enquiries?status=OPEN&pageSize=1',
    {
      refetchInterval: 60_000,
    },
  );
  const { user } = useSession();
  const { logout } = useAuthActions();
  const navigate = useNavigate();
  return (
    <nav aria-label="Admin" className="flex flex-col gap-1 h-full">
      <div className="px-2.5 pb-5 pt-1">
        <Logo to="/admin" badge="Admin" />
      </div>
      {NAV.map((n) => (
        <NavLink
          key={n.to}
          to={n.to}
          end={n.end}
          onClick={onNavigate}
          className={({ isActive }) =>
            cx(
              'flex justify-between items-center px-3 py-[11px] rounded-xl no-underline',
              isActive
                ? 'bg-white text-accent-deep font-semibold shadow-card'
                : 'text-ink hover:bg-white/60',
            )
          }
        >
          {n.label}
          {n.badge && open.data && open.data.total > 0 ? (
            <span className="bg-accent text-white text-xs font-bold rounded-full px-2 py-px">
              {open.data.total}
            </span>
          ) : null}
        </NavLink>
      ))}
      <div className="mt-auto pt-6 px-3 text-sm text-muted">
        <div className="font-semibold text-ink truncate">{user?.name}</div>
        <div className="flex gap-3 mt-1">
          <NavLink to="/admin/profile" onClick={onNavigate} className="font-semibold">
            Password
          </NavLink>
          <button
            type="button"
            className="inline-flex items-center gap-1 font-semibold text-accent-ink"
            onClick={async () => {
              await logout();
              navigate('/login');
            }}
          >
            <Logout size={15} /> Log out
          </button>
        </div>
      </div>
    </nav>
  );
}

export function AdminLayout() {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const name = useAppName();
  useEffect(() => setOpen(false), [location.pathname]);
  useEffect(() => {
    document.title = `${name} · Admin`;
  }, [name]);
  return (
    <div className="min-h-dvh bg-canvas lg:flex">
      <aside className="hidden lg:block w-[236px] shrink-0 px-3.5 py-5 sticky top-0 h-dvh overflow-y-auto">
        <SideNav />
      </aside>

      <header className="lg:hidden sticky top-0 z-30 bg-canvas/95 backdrop-blur flex items-center justify-between px-4 py-3 border-b border-line">
        <Logo to="/admin" badge="Admin" />
        <button
          type="button"
          aria-label="Open menu"
          aria-expanded={open}
          onClick={() => setOpen(true)}
          className="w-11 h-11 rounded-xl flex items-center justify-center hover:bg-white"
        >
          <Menu size={22} />
        </button>
      </header>
      {open ? (
        <div className="lg:hidden fixed inset-0 z-50">
          <div
            className="absolute inset-0 bg-ink/40"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />
          <div className="absolute inset-y-0 left-0 w-[270px] max-w-[85vw] bg-canvas px-3.5 py-5 overflow-y-auto">
            <button
              type="button"
              aria-label="Close menu"
              onClick={() => setOpen(false)}
              className="absolute right-2 top-3 w-11 h-11 rounded-xl flex items-center justify-center"
            >
              <X size={20} />
            </button>
            <SideNav onNavigate={() => setOpen(false)} />
          </div>
        </div>
      ) : null}

      <main className="flex-1 min-w-0 px-4 py-6 md:px-8 md:py-7 pb-16">
        <div className="mx-auto max-w-[1180px] flex flex-col gap-5">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
