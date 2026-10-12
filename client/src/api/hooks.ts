import { useMutation, useQuery, useQueryClient, type UseQueryOptions } from '@tanstack/react-query';
import type { ContactInfo, PlanDto, SessionUser } from '@shared/types';
import { api, ApiError } from './client';

/** GET `url`, cached under `key`. */
export function useApi<T>(
  key: readonly unknown[],
  url: string | null,
  options: Omit<UseQueryOptions<T, ApiError>, 'queryKey' | 'queryFn'> = {},
) {
  return useQuery<T, ApiError>({
    queryKey: key,
    queryFn: () => api.get<T>(url!),
    enabled: url !== null && (options.enabled ?? true),
    ...options,
  });
}

/**
 * A mutation that refreshes the given query key prefixes on success
 * (e.g. ['admin'] refreshes every admin screen).
 */
export function useApiMutation<TBody, TResult = unknown>(
  fn: (body: TBody) => Promise<TResult>,
  invalidate: readonly unknown[][] = [],
) {
  const qc = useQueryClient();
  return useMutation<TResult, ApiError, TBody>({
    mutationFn: fn,
    onSuccess: async () => {
      await Promise.all(invalidate.map((key) => qc.invalidateQueries({ queryKey: key })));
    },
  });
}

export const useMe = () =>
  useApi<{ user: SessionUser | null }>(['auth', 'me'], '/auth/me', { staleTime: 60_000 });

export const usePublicPlans = () =>
  useApi<PlanDto[]>(['public', 'plans'], '/public/plans', { staleTime: 5 * 60_000 });

export const useContact = () =>
  useApi<ContactInfo>(['public', 'contact'], '/public/contact', { staleTime: 5 * 60_000 });
