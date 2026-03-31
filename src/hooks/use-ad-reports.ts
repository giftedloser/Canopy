import { useQuery } from "@tanstack/react-query";
import * as ad from "@/lib/tauri-ad";
import { useCredentialStore } from "@/stores/credential-store";
import { useOuScopeStore } from "@/stores/ou-scope-store";
import { parseAdJson, parseAdJsonArray } from "@/lib/utils";

export function useComputerOsBreakdown() {
  const isConnected = useCredentialStore((s) => s.isConnected);
  const scopeActive = useOuScopeStore((s) => s.scopeActive);
  const enabledOus = useOuScopeStore((s) => s.enabledOus);
  const ouScopes = scopeActive && enabledOus.size > 0
    ? Array.from(enabledOus).sort((a, b) => a.localeCompare(b))
    : undefined;

  return useQuery({
    queryKey: ["computer-os-breakdown", ouScopes ?? null],
    queryFn: async () => {
      const raw = await ad.getComputerOsBreakdown(ouScopes);
      try {
        return parseAdJsonArray(raw);
      } catch {
        return [];
      }
    },
    enabled: isConnected,
    placeholderData: (previousData) => previousData,
  });
}

export function useReport(reportType: string | null) {
  const isConnected = useCredentialStore((s) => s.isConnected);
  const scopeActive = useOuScopeStore((s) => s.scopeActive);
  const enabledOus = useOuScopeStore((s) => s.enabledOus);
  const ouScopes = scopeActive && enabledOus.size > 0
    ? Array.from(enabledOus).sort((a, b) => a.localeCompare(b))
    : undefined;

  return useQuery({
    queryKey: ["report", reportType, ouScopes ?? null],
    queryFn: async () => {
      if (!reportType) return [];
      const raw = await ad.runReport(reportType, ouScopes);
      return parseAdJsonArray(raw);
    },
    enabled: isConnected && !!reportType,
  });
}

export function useDashboardStats() {
  const isConnected = useCredentialStore((s) => s.isConnected);
  const scopeActive = useOuScopeStore((s) => s.scopeActive);
  const enabledOus = useOuScopeStore((s) => s.enabledOus);
  const ouScopes = scopeActive && enabledOus.size > 0
    ? Array.from(enabledOus).sort((a, b) => a.localeCompare(b))
    : undefined;

  return useQuery({
    queryKey: ["dashboard-stats", ouScopes ?? null],
    queryFn: async () => {
      const raw = await ad.getDashboardStats(ouScopes);
      return parseAdJson(raw);
    },
    enabled: isConnected,
    placeholderData: (previousData) => previousData,
  });
}
