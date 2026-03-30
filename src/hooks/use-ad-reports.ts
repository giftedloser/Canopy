import { useQuery } from "@tanstack/react-query";
import * as ad from "@/lib/tauri-ad";
import { useCredentialStore } from "@/stores/credential-store";
import { parseAdJson, parseAdJsonArray } from "@/lib/utils";

export function useComputerOsBreakdown() {
  const isConnected = useCredentialStore((s) => s.isConnected);
  return useQuery({
    queryKey: ["computer-os-breakdown"],
    queryFn: async () => {
      const raw = await ad.getComputerOsBreakdown();
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
  return useQuery({
    queryKey: ["report", reportType],
    queryFn: async () => {
      if (!reportType) return [];
      const raw = await ad.runReport(reportType);
      return parseAdJsonArray(raw);
    },
    enabled: isConnected && !!reportType,
  });
}

export function useDashboardStats() {
  const isConnected = useCredentialStore((s) => s.isConnected);
  return useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: async () => {
      const raw = await ad.getDashboardStats();
      return parseAdJson(raw);
    },
    enabled: isConnected,
    placeholderData: (previousData) => previousData,
  });
}
