import { useQuery } from "@tanstack/react-query";
import * as ad from "@/lib/tauri-ad";
import { useCredentialStore } from "@/stores/credential-store";
import { parseAdJsonArray } from "@/lib/utils";

export function useOuTree() {
  const isConnected = useCredentialStore((s) => s.isConnected);
  return useQuery({
    queryKey: ["ou-tree"],
    queryFn: async () => {
      const raw = await ad.getOuTree();
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

export function useOuContents(ouDn: string | null) {
  const isConnected = useCredentialStore((s) => s.isConnected);
  return useQuery({
    queryKey: ["ou-contents", ouDn],
    queryFn: async () => {
      if (!ouDn) return [];
      const raw = await ad.getOuContents(ouDn);
      try {
        return parseAdJsonArray(raw);
      } catch {
        return [];
      }
    },
    enabled: isConnected && !!ouDn,
  });
}
