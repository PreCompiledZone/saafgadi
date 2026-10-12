import { useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { useAppName } from '../components/brand';
import { Clock, Today, User } from '../components/icons';
import { BottomNav } from './BottomNav';

export function WasherLayout() {
  const name = useAppName();
  useEffect(() => {
    document.title = `${name} · Washer`;
  }, [name]);
  return (
    <div className="min-h-dvh bg-canvas">
      <main className="mx-auto max-w-lg pb-32">
        <Outlet />
      </main>
      <BottomNav
        items={[
          { to: '/washer', label: 'Today', icon: <Today size={22} />, end: true },
          { to: '/washer/history', label: 'History', icon: <Clock size={22} /> },
          { to: '/washer/profile', label: 'Profile', icon: <User size={22} /> },
        ]}
      />
    </div>
  );
}
