import { create } from "zustand";
import { queryClient } from "@/lib/query-client";
import { hydrateConnectionScopedQueries } from "@/lib/query-persistence";

export const LAST_ACTIVE_SERVER_KEY = "fuzzy-directory.last-active-server";

export function getStoredLastActiveServer(): string {
  try {
    return localStorage.getItem(LAST_ACTIVE_SERVER_KEY)?.trim() ?? "";
  } catch {
    return "";
  }
}

function storeLastActiveServer(server: string) {
  try {
    const trimmed = server.trim();
    if (!trimmed) return;
    localStorage.setItem(LAST_ACTIVE_SERVER_KEY, trimmed);
  } catch {
    // Ignore storage errors and keep running.
  }
}

export interface ConnectionInfo {
  domainName: string;
  forest: string;
  infrastructureMaster: string;
  connectedAs: string;
  resolvedServer: string;
  serverOverride: string;
  activeServer: string;
}

interface CredentialState {
  isConnected: boolean;
  connectionInfo: ConnectionInfo | null;
  theme: "light" | "dark" | "midnight" | "forest";

  connectIntegratedSuccess: (info: {
    domainName: string;
    forest: string;
    infrastructureMaster: string;
    connectedAs: string;
    resolvedServer: string;
  }) => void;
  setServerOverride: (serverOverride: string) => void;
  disconnect: () => void;
  toggleTheme: () => void;
}

export const useCredentialStore = create<CredentialState>((set) => ({
  isConnected: false,
  connectionInfo: null,
  theme: (localStorage.getItem("theme") as "light" | "dark" | "midnight" | "forest") ?? "dark",

  connectIntegratedSuccess: (info) =>
    set(() => {
      const resolvedServer = info.resolvedServer.trim();
      if (!resolvedServer) {
        return {
          isConnected: false,
          connectionInfo: null,
        };
      }

      const connectionInfo = {
        ...info,
        resolvedServer,
        serverOverride: "",
        activeServer: resolvedServer,
      };

      storeLastActiveServer(connectionInfo.activeServer);
      hydrateConnectionScopedQueries(queryClient, connectionInfo);

      return {
        isConnected: true,
        connectionInfo,
      };
    }),

  setServerOverride: (serverOverride) =>
    set((state) => {
      if (!state.connectionInfo) return state;
      const nextOverride = serverOverride.trim();
      const connectionInfo = {
        ...state.connectionInfo,
        serverOverride: nextOverride,
        activeServer: nextOverride || state.connectionInfo.resolvedServer,
      };

      storeLastActiveServer(connectionInfo.activeServer);
      hydrateConnectionScopedQueries(queryClient, connectionInfo);

      return {
        connectionInfo,
      };
    }),

  disconnect: () => {
    queryClient.clear();
    set({
      isConnected: false,
      connectionInfo: null,
    });
  },

  toggleTheme: () =>
    set((state) => {
      const order = ["light", "dark", "midnight", "forest"] as const;
      const idx = order.indexOf(state.theme);
      const next = order[(idx + 1) % order.length];
      localStorage.setItem("theme", next);
      document.documentElement.classList.remove("dark", "midnight", "forest");
      if (next !== "light") document.documentElement.classList.add(next);
      return { theme: next };
    }),
}));
