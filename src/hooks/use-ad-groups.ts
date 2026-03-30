import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as ad from "@/lib/tauri-ad";
import { useCredentialStore } from "@/stores/credential-store";
import { useOuScopeStore } from "@/stores/ou-scope-store";
import { normalizePagedResult, parseAdJson, parseAdJsonArray, type CsvRow } from "@/lib/utils";

const DEFAULT_PAGE_SIZE = 100;

interface UseGroupsParams {
  search?: string;
  page: number;
  pageSize?: number;
  sortBy: string;
  sortDir: "asc" | "desc";
}

export function useGroups({
  search,
  page,
  pageSize = DEFAULT_PAGE_SIZE,
  sortBy,
  sortDir,
}: UseGroupsParams) {
  const isConnected = useCredentialStore((s) => s.isConnected);
  const scopeActive = useOuScopeStore((s) => s.scopeActive);
  const enabledOus = useOuScopeStore((s) => s.enabledOus);
  const ouScopes = scopeActive && enabledOus.size > 0
    ? Array.from(enabledOus).sort((a, b) => a.localeCompare(b))
    : undefined;

  return useQuery({
    queryKey: ["groups", search ?? null, page, pageSize, sortBy, sortDir, ouScopes ?? null],
    queryFn: async () => {
      const raw = await ad.getGroupsPage({
        search,
        ouScopes,
        page,
        pageSize,
        sortBy,
        sortDir,
      });
      return normalizePagedResult<CsvRow>(parseAdJson(raw), pageSize);
    },
    enabled: isConnected,
    placeholderData: (previousData) => previousData,
  });
}

export function useGroupMembers(groupName: string | null, options?: { enabled?: boolean }) {
  const isConnected = useCredentialStore((s) => s.isConnected);
  return useQuery({
    queryKey: ["group-members", groupName],
    queryFn: async () => {
      if (!groupName) return [];
      const raw = await ad.getGroupMembers(groupName);
      return parseAdJsonArray(raw);
    },
    enabled: isConnected && !!groupName && options?.enabled !== false,
  });
}

export function useAddGroupMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params: { groupName: string; memberSam: string }) =>
      ad.addGroupMember(params.groupName, params.memberSam),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["group-members"] });
      qc.invalidateQueries({ queryKey: ["groups"] });
    },
  });
}

export function useRemoveGroupMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params: { groupName: string; memberSam: string }) =>
      ad.removeGroupMember(params.groupName, params.memberSam),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["group-members"] });
      qc.invalidateQueries({ queryKey: ["groups"] });
    },
  });
}

export function useCreateGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ad.createGroup,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["groups"] }),
  });
}
