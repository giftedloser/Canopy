import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      gcTime: 12 * 60 * 60 * 1000, // Keep in-memory cache warm through the workday
    },
  },
});
