import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as ad from "@/lib/tauri-ad";
import { QUERY_STALE_TIMES } from "@/lib/query-client";
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

function getUserDetailPlaceholder(qc: ReturnType<typeof useQueryClient>, sam: string | null) {
  if (!sam) return null;
  const normalizedSam = sam.trim().toLowerCase();
  if (!normalizedSam) return null;

  const pages = qc.getQueriesData<PagedResult<CsvRow>>({
    queryKey: ["users-snapshot"],
  });

  for (const [, page] of pages) {
    const items = page?.items ?? [];
    const match = items.find((item) => {
      const candidate = item?.SamAccountName;
      return typeof candidate === "string" && candidate.trim().toLowerCase() === normalizedSam;
    });
    if (match) {
      return { user: match, groups: [] };
    }
  }

  return null;
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
  const normalizedSearch = search?.trim() || undefined;
  const scopeActive = useOuScopeStore((s) => s.scopeActive);
  const enabledOus = useOuScopeStore((s) => s.enabledOus);
  const ouScopes = scopeActive && enabledOus.size > 0
    ? Array.from(enabledOus).sort((a, b) => a.localeCompare(b))
    : undefined;

  return useQuery<PagedResult<CsvRow>>({
    queryKey: ["users-snapshot", normalizedSearch ?? null, status, page, pageSize, sortBy, sortDir, ouScopes ?? null],
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
        search: normalizedSearch,
        filter,
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

export function useUserDetail(sam: string | null) {
  const isConnected = useCredentialStore((s) => s.isConnected);
  const qc = useQueryClient();
  return useQuery({
    queryKey: ["user-detail", sam],
    queryFn: async () => {
      if (!sam) return null;
      const raw = await ad.getUserDetail(sam);
      return parseAdJson(raw);
    },
    enabled: isConnected && !!sam,
    staleTime: QUERY_STALE_TIMES.detail,
    placeholderData: () => getUserDetailPlaceholder(qc, sam),
  });
}

export function useUserGroups(sam: string | null, enabled = true) {
  const isConnected = useCredentialStore((s) => s.isConnected);
  return useQuery({
    queryKey: ["user-groups", sam],
    queryFn: async () => {
      if (!sam) return [];
      const raw = await ad.getUserGroups(sam);
      const parsed = parseAdJson(raw);
      if (Array.isArray(parsed)) return parsed;
      return parsed ? [parsed] : [];
    },
    enabled: isConnected && !!sam && enabled,
    staleTime: QUERY_STALE_TIMES.detail,
  });
}

export function useResetPassword() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params: {
      samAccountName: string;
      newPassword: string;
      changePasswordAtLogon?: boolean;
    }) =>
      ad.resetUserPassword(
        params.samAccountName,
        params.newPassword,
        params.changePasswordAtLogon ?? false
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["users-snapshot"] });
      qc.invalidateQueries({ queryKey: ["user-detail"] });
      qc.invalidateQueries({ queryKey: ["user-groups"] });
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
      qc.invalidateQueries({ queryKey: ["user-groups"] });
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
      qc.invalidateQueries({ queryKey: ["user-groups"] });
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

export function useAddUserToGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params: { sam: string; groupName: string }) =>
      ad.addGroupMember(params.groupName, params.sam),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["users-snapshot"] });
      qc.invalidateQueries({ queryKey: ["user-detail"] });
      qc.invalidateQueries({ queryKey: ["user-groups"] });
      qc.invalidateQueries({ queryKey: ["groups"] });
      qc.invalidateQueries({ queryKey: ["group-members"] });
      qc.invalidateQueries({ queryKey: ["group-member-counts"] });
    },
  });
}

export function useMoveUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params: { sam: string; targetOu: string }) =>
      ad.moveUser(params.sam, params.targetOu),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["users-snapshot"] });
      qc.invalidateQueries({ queryKey: ["user-detail"] });
      qc.invalidateQueries({ queryKey: ["user-groups"] });
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
      qc.invalidateQueries({ queryKey: ["ou-contents"] });
    },
  });
}
