import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as ad from "@/lib/tauri-ad";
import { QUERY_STALE_TIMES } from "@/lib/query-client";
import { useCredentialStore } from "@/stores/credential-store";
import { useOuScopeStore } from "@/stores/ou-scope-store";
import { normalizePagedResult, parseAdJson, type CsvRow, type PagedResult } from "@/lib/utils";

const DEFAULT_PAGE_SIZE = 100;

interface UseComputersParams {
  search?: string;
  page: number;
  pageSize?: number;
  sortBy: string;
  sortDir: "asc" | "desc";
}

export function useComputers({
  search,
  page,
  pageSize = DEFAULT_PAGE_SIZE,
  sortBy,
  sortDir,
}: UseComputersParams) {
  const isConnected = useCredentialStore((s) => s.isConnected);
  const normalizedSearch = search?.trim() || undefined;
  const scopeActive = useOuScopeStore((s) => s.scopeActive);
  const enabledOus = useOuScopeStore((s) => s.enabledOus);
  const ouScopes = scopeActive && enabledOus.size > 0
    ? Array.from(enabledOus).sort((a, b) => a.localeCompare(b))
    : undefined;

  return useQuery<PagedResult<CsvRow>>({
    queryKey: ["computers-snapshot", normalizedSearch ?? null, page, pageSize, sortBy, sortDir, ouScopes ?? null],
    queryFn: async () => {
      const raw = await ad.getComputersPage({
        search: normalizedSearch,
        ouScopes,
        page,
        pageSize,
        sortBy,
        sortDir,
      });
      return normalizePagedResult<CsvRow>(parseAdJson(raw), pageSize);
    },
    enabled: isConnected,
    staleTime: QUERY_STALE_TIMES.default,
    placeholderData: (previousData) => previousData,
  });
}

export function useComputerDetail(name: string | null) {
  const isConnected = useCredentialStore((s) => s.isConnected);
  return useQuery({
    queryKey: ["computer-detail", name],
    queryFn: async () => {
      if (!name) return null;
      const raw = await ad.getComputerDetail(name);
      return parseAdJson(raw);
    },
    enabled: isConnected && !!name,
    staleTime: QUERY_STALE_TIMES.detail,
  });
}

export function useToggleComputer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params: { name: string; enable: boolean }) =>
      ad.toggleComputer(params.name, params.enable),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["computers-snapshot"] });
      qc.invalidateQueries({ queryKey: ["computer-detail"] });
    },
  });
}

export function useMoveComputer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params: { name: string; targetOu: string }) =>
      ad.moveComputer(params.name, params.targetOu),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["computers-snapshot"] });
      qc.invalidateQueries({ queryKey: ["computer-detail"] });
      qc.invalidateQueries({ queryKey: ["computer-os-breakdown"] });
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
      qc.invalidateQueries({ queryKey: ["ou-contents"] });
    },
  });
}
