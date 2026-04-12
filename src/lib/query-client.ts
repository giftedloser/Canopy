import { QueryClient } from "@tanstack/react-query";

export const QUERY_STALE_TIMES = {
  default: 60 * 1000,
  detail: 60 * 1000,
  aggregate: 5 * 60 * 1000,
  reports: 5 * 60 * 1000,
  directoryTree: 30 * 60 * 1000,
  directoryContents: 5 * 60 * 1000,
} as const;

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: QUERY_STALE_TIMES.default,
      gcTime: 12 * 60 * 60 * 1000, // Keep in-memory cache warm through the workday
    },
  },
});
