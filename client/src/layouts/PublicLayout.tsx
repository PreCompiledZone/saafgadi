import { useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { useAppName } from '../components/brand';

export function PublicLayout() {
  const name = useAppName();
  useEffect(() => {
    document.title = name;
  }, [name]);
  return (
    <div className="min-h-dvh bg-canvas">
      <Outlet />
    </div>
  );
}
