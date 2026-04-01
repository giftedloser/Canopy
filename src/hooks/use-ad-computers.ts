import { useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as ad from "@/lib/tauri-ad";
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

function getComputerSortString(value: unknown) {
  return typeof value === "string" ? value.trim().toLocaleLowerCase() : "";
}

function getComputerDateValue(value: unknown) {
  if (typeof value !== "string" || !value) return Number.NEGATIVE_INFINITY;
  const psMatch = value.match(/^\/Date\((-?\d+)\)\/$/);
  if (psMatch) {
    return Number.parseInt(psMatch[1], 10);
  }
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? Number.NEGATIVE_INFINITY : parsed;
}

function sortComputersSnapshot(items: CsvRow[], sortBy: string, sortDir: "asc" | "desc") {
  const direction = sortDir === "desc" ? -1 : 1;
  const sorted = [...items];
  sorted.sort((left, right) => {
    let result = 0;

    switch (sortBy) {
      case "Description":
        result = getComputerSortString(left.Description).localeCompare(getComputerSortString(right.Description), undefined, { numeric: true });
        break;
      case "OperatingSystem":
        result = getComputerSortString(left.OperatingSystem).localeCompare(getComputerSortString(right.OperatingSystem), undefined, { numeric: true });
        break;
      case "LastLogonDate":
        result = getComputerDateValue(left.LastLogonDate) - getComputerDateValue(right.LastLogonDate);
        break;
      case "IPv4Address":
        result = getComputerSortString(left.IPv4Address).localeCompare(getComputerSortString(right.IPv4Address), undefined, { numeric: true });
        break;
      case "Enabled":
        result = Number(Boolean(left.Enabled)) - Number(Boolean(right.Enabled));
        break;
      default:
        result = getComputerSortString(left.Name).localeCompare(getComputerSortString(right.Name), undefined, { numeric: true });
        break;
    }

    if (result !== 0) {
      return result * direction;
    }

    return getComputerSortString(left.Name).localeCompare(getComputerSortString(right.Name), undefined, { numeric: true });
  });

  return sorted;
}

export function useComputers({
  search,
  page,
  pageSize = DEFAULT_PAGE_SIZE,
  sortBy,
  sortDir,
}: UseComputersParams) {
  const isConnected = useCredentialStore((s) => s.isConnected);
  const scopeActive = useOuScopeStore((s) => s.scopeActive);
  const enabledOus = useOuScopeStore((s) => s.enabledOus);
  const ouScopes = scopeActive && enabledOus.size > 0
    ? Array.from(enabledOus).sort((a, b) => a.localeCompare(b))
    : undefined;

  const snapshotQuery = useQuery({
    queryKey: ["computers-snapshot", search ?? null, ouScopes ?? null],
    queryFn: async () => {
      const raw = await ad.getComputersPage({
        search,
        ouScopes,
        fetchAll: true,
      });
      return normalizePagedResult<CsvRow>(parseAdJson(raw), DEFAULT_PAGE_SIZE).items;
    },
    enabled: isConnected,
    placeholderData: (previousData) => previousData,
  });

  const data = useMemo<PagedResult<CsvRow> | undefined>(() => {
    if (!snapshotQuery.data) return undefined;

    const sortedItems = sortComputersSnapshot(snapshotQuery.data, sortBy, sortDir);
    const total = sortedItems.length;
    const pageCount = total === 0 ? 0 : Math.ceil(total / pageSize);
    const safePage = pageCount === 0 ? 1 : Math.min(page, pageCount);
    const start = (safePage - 1) * pageSize;
    const items = sortedItems.slice(start, start + pageSize);

    return {
      items,
      total,
      page: safePage,
      pageSize,
      pageCount,
      hasMore: safePage < pageCount,
    };
  }, [page, pageSize, snapshotQuery.data, sortBy, sortDir]);

  return {
    ...snapshotQuery,
    data,
  };
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
