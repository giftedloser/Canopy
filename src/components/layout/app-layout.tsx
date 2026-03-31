import { useState, useEffect, useRef } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import { getStoredLastActiveServer, useCredentialStore } from "@/stores/credential-store";
import { Sidebar } from "./sidebar";
import { CredentialDialog } from "@/components/credentials/credential-dialog";
import { ElevationDialog } from "@/components/credentials/elevation-dialog";
import { SearchCommand } from "@/components/shared/search-command";
import { testConnection } from "@/lib/tauri-ad";
import { normalizeConnectionPayload } from "@/lib/connection-response";
import {
  Search,
  Sun,
  Moon,
  Star,
  TreePine,
  WifiOff,
  Loader2,
  Command,
  ChevronRight,
  RefreshCw,
} from "lucide-react";
import { Toaster, toast } from "sonner";
import { queryClient } from "@/lib/query-client";

const routeLabels: Record<string, string> = {
  "/":          "Dashboard",
  "/users":     "Users",
  "/computers": "Computers",
  "/groups":    "Groups",
  "/reports":   "Reports",
  "/directory": "Directory",
  "/settings":  "Settings",
};

const routeRefreshKeys: Record<string, string[]> = {
  "/": ["dashboard-stats", "computer-os-breakdown", "group-members"],
  "/users": ["users-snapshot", "user-detail"],
  "/computers": ["computers-snapshot", "computer-detail"],
  "/groups": ["groups", "group-members"],
  "/reports": ["report"],
  "/directory": ["ou-tree", "ou-contents"],
  "/settings": [],
};

export function AppLayout() {
  const [collapsed, setCollapsed]       = useState(false);
  const [showCredentials, setShowCredentials] = useState(false);
  const [showSearch, setShowSearch]     = useState(false);
  const [autoConnecting, setAutoConnecting] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const location = useLocation();

  const {
    isConnected,
    connectionInfo,
    theme,
    toggleTheme,
    disconnect,
    connectIntegratedSuccess,
    setServerOverride,
  } = useCredentialStore();

  const pageLabel = routeLabels[location.pathname] ?? "";

  // Auto-connect on startup — silently try integrated auth before showing any dialog
  const hasAttemptedAutoConnect = useRef(false);
  useEffect(() => {
    if (hasAttemptedAutoConnect.current || isConnected) {
      setAutoConnecting(false);
      return;
    }
    hasAttemptedAutoConnect.current = true;

    (async () => {
      try {
        const lastServer = getStoredLastActiveServer();
        const result = lastServer
          ? await testConnection(lastServer).catch(() => testConnection())
          : await testConnection();
        const normalized = normalizeConnectionPayload(result, lastServer || undefined);
        connectIntegratedSuccess(normalized);
        setServerOverride("");
      } catch {
        // Auto-connect failed — show the manual dialog so the user can specify a DC
        setShowCredentials(true);
      } finally {
        setAutoConnecting(false);
      }
    })();
  }, [connectIntegratedSuccess, isConnected, setServerOverride]);

  // Cmd+K global shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setShowSearch(true);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  return (
    <div className="flex h-screen w-screen overflow-hidden">
      <Sidebar collapsed={collapsed} onToggle={() => setCollapsed(!collapsed)} />

      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header
          className="flex items-center justify-between h-[52px] px-4 border-b border-border bg-background/90 backdrop-blur-md shrink-0"
          data-tauri-drag-region
        >
          {/* Left: breadcrumb */}
          <div className="flex items-center gap-2 select-none" data-tauri-drag-region>
            {/* Search button */}
            <button
              onClick={() => setShowSearch(true)}
              className="group flex items-center gap-2 h-8 px-3 rounded-md border border-border bg-secondary/60 hover:bg-secondary hover:border-primary/30 text-muted-foreground text-[12px] transition-all"
            >
              <Search className="w-3.5 h-3.5 text-muted-foreground/60 group-hover:text-primary transition-colors" />
              <span className="hidden sm:inline">Search...</span>
              <span className="hidden sm:flex items-center gap-0.5 ml-2 opacity-60">
                <Command className="w-2.5 h-2.5" />
                <span className="font-mono text-[10px]">K</span>
              </span>
            </button>

            {/* Page breadcrumb */}
            {pageLabel && (
              <>
                <ChevronRight className="w-3 h-3 text-border" />
                <span className="text-[12px] font-medium text-muted-foreground">{pageLabel}</span>
              </>
            )}
          </div>

          {/* Right: status + theme */}
          <div className="flex items-center gap-1.5">
            {/* Refresh button */}
            {isConnected && (
              <button
                onClick={async () => {
                  setIsRefreshing(true);
                  try {
                    const queryKeys = routeRefreshKeys[location.pathname] ?? [];

                    if (queryKeys.length === 0) {
                      return;
                    }

                    await Promise.all(
                      queryKeys.map((queryKey) =>
                        queryClient.refetchQueries({
                          queryKey: [queryKey],
                          type: "active",
                        })
                      )
                    );
                    toast.success("Page refreshed");
                  } catch (error: unknown) {
                    toast.error(
                      error instanceof Error ? error.message : "Refresh failed"
                    );
                  } finally {
                    setIsRefreshing(false);
                  }
                }}
                disabled={isRefreshing}
                className="flex items-center justify-center w-8 h-8 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                title="Refresh this page"
              >
                <RefreshCw className={cn("w-3.5 h-3.5", isRefreshing && "animate-spin")} />
              </button>
            )}

            {/* Connection button */}
            <button
              onClick={() => {
                if (autoConnecting) return;
                if (isConnected) {
                  disconnect();
                  setShowCredentials(true);
                } else {
                  setShowCredentials(true);
                }
              }}
              disabled={autoConnecting}
              className={cn(
                "group flex items-center gap-2 h-8 px-3 rounded-md text-[12px] font-medium transition-all",
                autoConnecting
                  ? "text-muted-foreground"
                  : isConnected
                    ? "text-muted-foreground hover:bg-secondary hover:text-foreground"
                    : "text-destructive hover:bg-destructive/10"
              )}
            >
              {autoConnecting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
                  <span>Connecting...</span>
                </>
              ) : isConnected ? (
                <>
                  {/* Animated pulse dot */}
                  <span className="relative flex h-2 w-2 shrink-0">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-60" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-success" />
                  </span>
                  <span className="font-mono text-[11px] max-w-[120px] truncate">
                    {connectionInfo?.connectedAs || "Connected"}
                  </span>
                </>
              ) : (
                <>
                  <WifiOff className="w-3.5 h-3.5" />
                  <span>Connect</span>
                </>
              )}
            </button>

            <div className="w-px h-4 bg-border" />

            {/* Theme toggle */}
            <button
              onClick={toggleTheme}
              className="flex items-center justify-center w-8 h-8 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
              title={
                theme === "light" ? "Switch to dark" :
                theme === "dark" ? "Switch to midnight" :
                theme === "midnight" ? "Switch to forest" :
                "Switch to light"
              }
            >
              {theme === "light" ? <Moon className="w-3.5 h-3.5" /> :
               theme === "dark" ? <Star className="w-3.5 h-3.5" /> :
               theme === "midnight" ? <TreePine className="w-3.5 h-3.5" /> :
               <Sun className="w-3.5 h-3.5" />}
            </button>
          </div>
        </header>

        {/* Main content */}
        <main className="flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>

      {/* Modals */}
      <CredentialDialog open={showCredentials && !autoConnecting} onOpenChange={setShowCredentials} />
      <ElevationDialog />
      <SearchCommand open={showSearch} onOpenChange={setShowSearch} />
      <Toaster
        theme={theme === "light" ? "light" : "dark"}
        position="bottom-right"
        toastOptions={{ className: "font-sans text-sm" }}
      />
    </div>
  );
}
