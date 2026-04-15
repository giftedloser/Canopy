import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as ad from "@/lib/tauri-ad";
import { QUERY_STALE_TIMES } from "@/lib/query-client";
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
  includeMemberCounts?: boolean;
}

export function useGroups({
  search,
  page,
  pageSize = DEFAULT_PAGE_SIZE,
  sortBy,
  sortDir,
  includeMemberCounts = true,
}: UseGroupsParams) {
  const isConnected = useCredentialStore((s) => s.isConnected);
  const normalizedSearch = search?.trim() || undefined;
  const scopeActive = useOuScopeStore((s) => s.scopeActive);
  const enabledOus = useOuScopeStore((s) => s.enabledOus);
  const ouScopes = scopeActive && enabledOus.size > 0
    ? Array.from(enabledOus).sort((a, b) => a.localeCompare(b))
    : undefined;

  return useQuery({
    queryKey: ["groups", normalizedSearch ?? null, page, pageSize, sortBy, sortDir, includeMemberCounts, ouScopes ?? null],
    queryFn: async () => {
      const raw = await ad.getGroupsPage({
        search: normalizedSearch,
        ouScopes,
        page,
        pageSize,
        sortBy,
        sortDir,
        includeMemberCounts,
      });
      return normalizePagedResult<CsvRow>(parseAdJson(raw), pageSize);
    },
    enabled: isConnected,
    staleTime: QUERY_STALE_TIMES.default,
    placeholderData: (previousData) => previousData,
  });
}

export function useGroupLookup(search: string, enabled = true) {
  const isConnected = useCredentialStore((s) => s.isConnected);
  const normalizedSearch = search.trim() || undefined;
  const scopeActive = useOuScopeStore((s) => s.scopeActive);
  const enabledOus = useOuScopeStore((s) => s.enabledOus);
  const ouScopes = scopeActive && enabledOus.size > 0
    ? Array.from(enabledOus).sort((a, b) => a.localeCompare(b))
    : undefined;

  return useQuery({
    queryKey: ["groups-lookup", normalizedSearch ?? null, ouScopes ?? null],
    queryFn: async () => {
      const raw = await ad.getGroupsPage({
        search: normalizedSearch,
        ouScopes,
        page: 1,
        pageSize: 20,
        sortBy: "Name",
        sortDir: "asc",
        includeMemberCounts: false,
        lookupMode: true,
      });
      return normalizePagedResult<CsvRow>(parseAdJson(raw), 20).items;
    },
    enabled: isConnected && enabled && !!normalizedSearch && normalizedSearch.length >= 2,
    staleTime: QUERY_STALE_TIMES.default,
    placeholderData: (previousData) => previousData,
  });
}

export function useGroupMemberCounts(groupDns: string[], enabled = true) {
  const isConnected = useCredentialStore((s) => s.isConnected);
  const normalizedGroupDns = [...groupDns]
    .map((dn) => dn.trim())
    .filter(Boolean)
    .sort((left, right) => left.localeCompare(right));

  return useQuery({
    queryKey: ["group-member-counts", normalizedGroupDns],
    queryFn: async () => {
      if (normalizedGroupDns.length === 0) {
        return {} as Record<string, number>;
      }

      const raw = await ad.getGroupMemberCounts(normalizedGroupDns);
      return parseAdJsonArray(raw).reduce<Record<string, number>>((counts, item) => {
        const dn = typeof item?.DistinguishedName === "string" ? item.DistinguishedName.trim() : "";
        const memberCount = typeof item?.MemberCount === "number" ? item.MemberCount : Number(item?.MemberCount ?? NaN);
        if (dn && Number.isFinite(memberCount)) {
          counts[dn] = memberCount;
        }
        return counts;
      }, {});
    },
    enabled: isConnected && enabled && normalizedGroupDns.length > 0,
    staleTime: QUERY_STALE_TIMES.detail,
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
    staleTime: QUERY_STALE_TIMES.detail,
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
      qc.invalidateQueries({ queryKey: ["group-member-counts"] });
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
      qc.invalidateQueries({ queryKey: ["group-member-counts"] });
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
