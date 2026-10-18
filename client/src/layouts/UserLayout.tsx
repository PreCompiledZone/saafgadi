import { useEffect } from 'react';
import { Link, Outlet } from 'react-router-dom';
import { Logo, useAppName } from '../components/brand';
import { Car, Clock, Home, List } from '../components/icons';
import { initials } from '../lib/format';
import { useSession } from '../lib/auth';
import { BottomNav } from './BottomNav';
import { VerifyEmailGate } from '../components/VerifyEmailGate';

export function UserLayout() {
  const { user } = useSession();
  const name = useAppName();
  useEffect(() => {
    document.title = name;
  }, [name]);
  return (
    <div className="min-h-dvh bg-canvas">
      <header className="mx-auto max-w-lg flex items-center justify-between px-5 py-4">
        <Logo to="/app" />
        <Link
          to="/app/profile"
          aria-label="Profile"
          className="w-10 h-10 rounded-full bg-accent-soft-2 text-accent-deep font-bold flex items-center justify-center no-underline"
        >
          {user ? initials(user.name) : ''}
        </Link>
      </header>
      <main className="mx-auto max-w-lg px-5 pb-32">
        {user?.mustVerifyEmail ? <VerifyEmailGate key={user.id} user={user} /> : <Outlet />}
      </main>
      <BottomNav
        items={[
          { to: '/app', label: 'Home', icon: <Home size={22} />, end: true },
          { to: '/app/history', label: 'History', icon: <Clock size={22} /> },
          { to: '/app/vehicles', label: 'Vehicles', icon: <Car size={22} /> },
          { to: '/app/plans', label: 'Plans', icon: <List size={22} /> },
        ]}
      />
    </div>
  );
}
