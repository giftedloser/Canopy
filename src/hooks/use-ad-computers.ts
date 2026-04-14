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

function getComputerDetailPlaceholder(qc: ReturnType<typeof useQueryClient>, name: string | null) {
  if (!name) return null;
  const normalizedName = name.trim().toLowerCase();
  if (!normalizedName) return null;

  const pages = qc.getQueriesData<PagedResult<CsvRow>>({
    queryKey: ["computers-snapshot"],
  });

  for (const [, page] of pages) {
    const items = page?.items ?? [];
    const match = items.find((item) => {
      const candidate = item?.Name;
      return typeof candidate === "string" && candidate.trim().toLowerCase() === normalizedName;
    });
    if (match) {
      return { computer: match, groups: [] };
    }
  }

  return null;
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
  const qc = useQueryClient();
  return useQuery({
    queryKey: ["computer-detail", name],
    queryFn: async () => {
      if (!name) return null;
      const raw = await ad.getComputerDetail(name);
      return parseAdJson(raw);
    },
    enabled: isConnected && !!name,
    staleTime: QUERY_STALE_TIMES.detail,
    placeholderData: () => getComputerDetailPlaceholder(qc, name),
  });
}

export function useComputerGroups(name: string | null, enabled = true) {
  const isConnected = useCredentialStore((s) => s.isConnected);
  return useQuery({
    queryKey: ["computer-groups", name],
    queryFn: async () => {
      if (!name) return [];
      const raw = await ad.getComputerGroups(name);
      const parsed = parseAdJson(raw);
      if (Array.isArray(parsed)) return parsed;
      return parsed ? [parsed] : [];
    },
    enabled: isConnected && !!name && enabled,
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
      qc.invalidateQueries({ queryKey: ["computer-groups"] });
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
      qc.invalidateQueries({ queryKey: ["computer-groups"] });
      qc.invalidateQueries({ queryKey: ["computer-os-breakdown"] });
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
      qc.invalidateQueries({ queryKey: ["ou-contents"] });
    },
  });
}
