import { useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as ad from "@/lib/tauri-ad";
import { useCredentialStore } from "@/stores/credential-store";
import { useOuScopeStore } from "@/stores/ou-scope-store";
import { normalizePagedResult, parseAdJson, type CsvRow, type PagedResult } from "@/lib/utils";

const DEFAULT_PAGE_SIZE = 100;

interface UseUsersParams {
  search?: string;
  status?: "all" | "enabled" | "disabled" | "locked";
  page: number;
  pageSize?: number;
  sortBy: string;
  sortDir: "asc" | "desc";
}

function getUserSortString(value: unknown) {
  return typeof value === "string" ? value.trim().toLocaleLowerCase() : "";
}

function getUserDateValue(value: unknown) {
  if (typeof value !== "string" || !value) return Number.NEGATIVE_INFINITY;
  const psMatch = value.match(/^\/Date\((-?\d+)\)\/$/);
  if (psMatch) {
    return Number.parseInt(psMatch[1], 10);
  }
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? Number.NEGATIVE_INFINITY : parsed;
}

function sortUsersSnapshot(items: CsvRow[], sortBy: string, sortDir: "asc" | "desc") {
  const direction = sortDir === "desc" ? -1 : 1;
  const sorted = [...items];
  sorted.sort((left, right) => {
    let result = 0;

    switch (sortBy) {
      case "SamAccountName":
        result = getUserSortString(left.SamAccountName).localeCompare(getUserSortString(right.SamAccountName), undefined, { numeric: true });
        break;
      case "Description":
        result = getUserSortString(left.Description).localeCompare(getUserSortString(right.Description), undefined, { numeric: true });
        break;
      case "Department":
        result = getUserSortString(left.Department).localeCompare(getUserSortString(right.Department), undefined, { numeric: true });
        break;
      case "Enabled":
        result = Number(Boolean(left.Enabled)) - Number(Boolean(right.Enabled));
        break;
      case "LastLogonDate":
        result = getUserDateValue(left.LastLogonDate) - getUserDateValue(right.LastLogonDate);
        break;
      default: {
        const leftName = getUserSortString(left.DisplayName) || getUserSortString(left.Name);
        const rightName = getUserSortString(right.DisplayName) || getUserSortString(right.Name);
        result = leftName.localeCompare(rightName, undefined, { numeric: true });
        break;
      }
    }

    if (result !== 0) {
      return result * direction;
    }

    return getUserSortString(left.Name).localeCompare(getUserSortString(right.Name), undefined, { numeric: true });
  });

  return sorted;
}

export function useUsers({
  search,
  status = "all",
  page,
  pageSize = DEFAULT_PAGE_SIZE,
  sortBy,
  sortDir,
}: UseUsersParams) {
  const isConnected = useCredentialStore((s) => s.isConnected);
  const scopeActive = useOuScopeStore((s) => s.scopeActive);
  const enabledOus = useOuScopeStore((s) => s.enabledOus);
  const ouScopes = scopeActive && enabledOus.size > 0
    ? Array.from(enabledOus).sort((a, b) => a.localeCompare(b))
    : undefined;

  const snapshotQuery = useQuery({
    queryKey: ["users-snapshot", search ?? null, status, ouScopes ?? null],
    queryFn: async () => {
      const filter =
        status === "enabled"
          ? "enabled"
          : status === "disabled"
          ? "disabled"
          : status === "locked"
          ? "locked"
          : undefined;
      const raw = await ad.getUsersPage({
        search,
        filter,
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

    const sortedItems = sortUsersSnapshot(snapshotQuery.data, sortBy, sortDir);
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

export function useUserDetail(sam: string | null) {
  const isConnected = useCredentialStore((s) => s.isConnected);
  return useQuery({
    queryKey: ["user-detail", sam],
    queryFn: async () => {
      if (!sam) return null;
      const raw = await ad.getUserDetail(sam);
      return parseAdJson(raw);
    },
    enabled: isConnected && !!sam,
  });
}

export function useResetPassword() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params: {
      samAccountName: string;
      newPassword: string;
    }) =>
      ad.resetUserPassword(
        params.samAccountName,
        params.newPassword
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["users-snapshot"] });
      qc.invalidateQueries({ queryKey: ["user-detail"] });
    },
  });
}

export function useUnlockUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (sam: string) => ad.unlockUser(sam),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["users-snapshot"] });
      qc.invalidateQueries({ queryKey: ["user-detail"] });
    },
  });
}

export function useToggleUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params: { sam: string; enable: boolean }) =>
      ad.toggleUser(params.sam, params.enable),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["users-snapshot"] });
      qc.invalidateQueries({ queryKey: ["user-detail"] });
    },
  });
}

export function useCreateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ad.createUser,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["users-snapshot"] }),
  });
}
