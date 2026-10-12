import { useQueryClient } from '@tanstack/react-query';
import type { Role } from '@shared/enums';
import type { SessionUser } from '@shared/types';
import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { api } from '../api/client';
import { useMe } from '../api/hooks';
import { FullPageSpinner } from '../components/ui';

export const HOME_FOR: Record<Role, string> = { ADMIN: '/admin', WASHER: '/washer', USER: '/app' };

export function useSession(): { user: SessionUser | null; loading: boolean } {
  const me = useMe();
  return { user: me.data?.user ?? null, loading: me.isLoading };
}

export function useAuthActions() {
  const qc = useQueryClient();
  return {
    /** Store the logged-in user and drop any cached data from a previous session. */
    async signedIn(user: SessionUser) {
      qc.removeQueries({ predicate: (q) => q.queryKey[0] !== 'public' });
      qc.setQueryData(['auth', 'me'], { user });
    },
    async logout() {
      await api.post('/auth/logout');
      qc.clear();
      qc.setQueryData(['auth', 'me'], { user: null });
    },
  };
}

/** Client-side guard only — the server checks every request. */
export function RequireRole({ role, children }: { role: Role; children: ReactNode }) {
  const { user, loading } = useSession();
  const location = useLocation();
  if (loading) return <FullPageSpinner />;
  if (!user) {
    return (
      <Navigate
        to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`}
        replace
      />
    );
  }
  if (user.role !== role) return <Navigate to={HOME_FOR[user.role]} replace />;
  return <>{children}</>;
}
