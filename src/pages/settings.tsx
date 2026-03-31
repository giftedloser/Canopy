import { useState, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";
import { useCredentialStore } from "@/stores/credential-store";
import { useOuScopeStore } from "@/stores/ou-scope-store";
import {
  disableLaunchAtStartup,
  enableLaunchAtStartup,
  isLaunchAtStartupEnabled,
} from "@/lib/autostart";
import {
  getOuTree,
  getPreferredElevationUsername,
  setPreferredElevationUsername,
} from "@/lib/tauri-ad";
import { buildOuTree, type OuTreeNode } from "@/lib/ou-tree";
import { parseAdJsonArray } from "@/lib/utils";
import { toast } from "sonner";
import {
  WifiOff,
  Loader2,
  ChevronRight,
  FolderTree,
  Check,
  Minus,
  Info,
  Power,
  ShieldAlert,
  User,
  Save,
} from "lucide-react";

export default function SettingsPage() {
  const isConnected = useCredentialStore((s) => s.isConnected);

  return (
    <div className="p-6 max-w-[800px] mx-auto space-y-6 animate-[fade-in_0.35s_ease-out]">
      <div>
        <h1 className="text-2xl font-bold tracking-tight leading-none mb-2">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Configure startup behavior and directory visibility for the application
        </p>
      </div>

      <LaunchAtStartupSection />
      <ElevationDefaultsSection />
      {isConnected ? <OuScopeSection /> : <DisconnectedSettingsNotice />}
    </div>
  );
}

function LaunchAtStartupSection() {
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const current = await isLaunchAtStartupEnabled();
        if (!cancelled) {
          setEnabled(current);
        }
      } catch (err: any) {
        if (!cancelled) {
          toast.error(err?.message || "Failed to load startup setting");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const toggleStartup = useCallback(async () => {
    setSaving(true);
    try {
      if (enabled) {
        await disableLaunchAtStartup();
        setEnabled(false);
        toast.success("Launch at startup disabled");
      } else {
        await enableLaunchAtStartup();
        setEnabled(true);
        toast.success("Launch at startup enabled");
      }
    } catch (err: any) {
      toast.error(err?.message || "Failed to update startup setting");
    } finally {
      setSaving(false);
    }
  }, [enabled]);

  const busy = loading || saving;

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="flex items-center justify-between p-4 border-b border-border">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary/10 shrink-0">
            <Power className="w-4 h-4 text-primary" />
          </div>
          <div>
            <p className="text-[13px] font-semibold">Launch at Startup</p>
            <p className="text-[11px] text-muted-foreground">
              Start Fuzzy Forest automatically when you sign in to Windows
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={toggleStartup}
          disabled={busy}
          className={cn(
            "relative inline-flex h-6 w-11 items-center rounded-full transition-colors disabled:opacity-60",
            enabled ? "bg-primary" : "bg-muted-foreground/20"
          )}
          aria-label="Toggle launch at startup"
          aria-pressed={enabled}
        >
          <span
            className={cn(
              "inline-block h-4 w-4 rounded-full bg-white transition-transform shadow-sm",
              enabled ? "translate-x-6" : "translate-x-1"
            )}
          />
        </button>
      </div>

      <div className="flex items-center justify-between gap-3 px-4 py-3 bg-secondary/20">
        <div className="flex items-start gap-2.5">
          <Info className="w-3.5 h-3.5 text-muted-foreground/60 mt-0.5 shrink-0" />
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            {loading
              ? "Checking current startup registration..."
              : enabled
              ? "Fuzzy Forest is currently registered to launch when Windows starts."
              : "Fuzzy Forest will only open when you launch it manually."}
          </p>
        </div>
        {busy && <Loader2 className="w-4 h-4 animate-spin text-primary shrink-0" />}
      </div>
    </div>
  );
}

function ElevationDefaultsSection() {
  const [username, setUsername] = useState("");

  useEffect(() => {
    setUsername(getPreferredElevationUsername());
  }, []);

  const handleSave = () => {
    setPreferredElevationUsername(username);
    toast.success(
      username.trim()
        ? "Elevation username saved"
        : "Elevation username cleared"
    );
  };

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="flex items-center gap-3 p-4 border-b border-border">
        <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-warning/10 shrink-0">
          <ShieldAlert className="w-4 h-4 text-warning" />
        </div>
        <div>
          <p className="text-[13px] font-semibold">Elevation Defaults</p>
          <p className="text-[11px] text-muted-foreground">
            Pre-fill the privileged username used for write operations
          </p>
        </div>
      </div>

      <div className="p-4 space-y-3">
        <div className="space-y-1.5">
          <label className="text-[10px] font-bold uppercase tracking-[0.07em] text-muted-foreground/60">
            Admin Username
          </label>
          <div className="relative max-w-sm">
            <User className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/40" />
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="administrator"
              autoComplete="off"
              name="preferred-elevation-username"
              spellCheck={false}
              autoCorrect="off"
              autoCapitalize="none"
              data-lpignore="true"
              data-1p-ignore="true"
              data-form-type="other"
              className="input-base w-full pl-9"
            />
          </div>
        </div>

        <div className="flex items-start justify-between gap-3">
          <p className="text-[11px] text-muted-foreground leading-relaxed max-w-[520px]">
            This only changes the username pre-filled in the elevation prompt. Passwords are never stored.
          </p>
          <button
            type="button"
            onClick={handleSave}
            className="inline-flex h-8 items-center gap-1.5 px-3 rounded-md bg-primary text-primary-foreground text-[12px] font-semibold hover:opacity-90 transition-opacity"
          >
            <Save className="w-3.5 h-3.5" />
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

function DisconnectedSettingsNotice() {
  return (
    <div className="rounded-xl border border-border bg-card p-8 flex items-center justify-center gap-4">
      <div className="flex items-center justify-center w-12 h-12 rounded-2xl bg-secondary border border-border shrink-0">
        <WifiOff className="w-5 h-5 text-muted-foreground/40" />
      </div>
      <div>
        <p className="text-sm font-semibold text-foreground">Directory settings unavailable</p>
        <p className="text-xs text-muted-foreground mt-1">
          Connect to Active Directory to configure OU scope filtering.
        </p>
      </div>
    </div>
  );
}

/* ─── OU Scope Configuration Section ─────────────────────────── */
function OuScopeSection() {
  const [tree, setTree] = useState<OuTreeNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const { enabledOus, scopeActive, setEnabledOus, setScopeActive } = useOuScopeStore();
  const [localEnabled, setLocalEnabled] = useState<Set<string>>(new Set(enabledOus));
  const [localActive, setLocalActive] = useState(scopeActive);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const raw = await getOuTree();
        const flat = parseAdJsonArray(raw);
        const built = buildOuTree(flat);
        setTree(built);
      } catch (err: any) {
        setError(err?.message || "Failed to load OU tree");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const toggleOu = useCallback((dn: string) => {
    setLocalEnabled((prev) => {
      const next = new Set(prev);
      if (next.has(dn)) {
        next.delete(dn);
      } else {
        next.add(dn);
      }
      return next;
    });
    setDirty(true);
  }, []);

  const toggleScopeActive = useCallback(() => {
    setLocalActive((prev) => !prev);
    setDirty(true);
  }, []);

  const handleSave = () => {
    setEnabledOus(localEnabled);
    setScopeActive(localActive);
    setDirty(false);
    toast.success("OU scope settings saved");
  };

  const handleReset = () => {
    setLocalEnabled(new Set(enabledOus));
    setLocalActive(scopeActive);
    setDirty(false);
  };

  // Count all OUs in tree
  const countOus = (nodes: OuTreeNode[]): number =>
    nodes.reduce((acc, n) => acc + 1 + countOus(n.children), 0);
  const totalOus = countOus(tree);

  if (loading) {
    return (
      <div className="rounded-xl border border-border bg-card p-8 flex items-center justify-center gap-3">
        <Loader2 className="w-4 h-4 animate-spin text-primary" />
        <span className="text-sm text-muted-foreground">Loading organizational units...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-4">
        <p className="text-sm font-semibold text-destructive">Failed to load OU tree</p>
        <p className="text-xs text-muted-foreground mt-1">{error}</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary/10 shrink-0">
            <FolderTree className="w-4 h-4 text-primary" />
          </div>
          <div>
            <p className="text-[13px] font-semibold">OU Scope</p>
            <p className="text-[11px] text-muted-foreground">
              Restrict the interface to specific organizational units
            </p>
          </div>
        </div>

        {/* Enable/disable toggle */}
        <button
          onClick={toggleScopeActive}
          className={cn(
            "relative inline-flex h-6 w-11 items-center rounded-full transition-colors",
            localActive ? "bg-primary" : "bg-muted-foreground/20"
          )}
        >
          <span
            className={cn(
              "inline-block h-4 w-4 rounded-full bg-white transition-transform shadow-sm",
              localActive ? "translate-x-6" : "translate-x-1"
            )}
          />
        </button>
      </div>

      {/* Info banner */}
      {!localActive && (
        <div className="flex items-start gap-2.5 px-4 py-3 bg-secondary/30 border-b border-border">
          <Info className="w-3.5 h-3.5 text-muted-foreground/60 mt-0.5 shrink-0" />
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            Scope filtering is disabled. All organizational units are visible. Enable the toggle above to restrict visibility.
          </p>
        </div>
      )}

      {/* Tree */}
      <div
        className={cn(
          "p-3 max-h-[480px] overflow-auto transition-opacity",
          !localActive && "opacity-40 pointer-events-none"
        )}
      >
        {tree.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            No organizational units found
          </p>
        ) : (
          <div className="space-y-0.5">
            {tree.map((node) => (
              <OuTreeItem
                key={node.dn}
                node={node}
                enabled={localEnabled}
                onToggle={toggleOu}
                depth={0}
              />
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-4 py-3 border-t border-border bg-secondary/20">
        <p className="text-[11px] text-muted-foreground font-mono">
          {localEnabled.size} of {totalOus} OUs selected
        </p>
        <div className="flex items-center gap-2">
          {dirty && (
            <button
              onClick={handleReset}
              className="h-7 px-3 rounded-md text-[12px] font-medium text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
            >
              Discard
            </button>
          )}
          <button
            onClick={handleSave}
            disabled={!dirty}
            className="h-7 px-4 rounded-md bg-primary text-primary-foreground text-[12px] font-semibold hover:opacity-90 disabled:opacity-40 transition-opacity"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── OU Tree Item (recursive) ───────────────────────────────── */
function OuTreeItem({
  node,
  enabled,
  onToggle,
  depth,
}: {
  node: OuTreeNode;
  enabled: Set<string>;
  onToggle: (dn: string) => void;
  depth: number;
}) {
  const [expanded, setExpanded] = useState(depth < 1);
  const hasChildren = node.children.length > 0;
  const isChecked = enabled.has(node.dn);

  // Determine partial state: some descendants checked but not this node
  const getCheckState = (): "checked" | "partial" | "unchecked" => {
    if (isChecked) return "checked";
    if (hasChildren && hasCheckedDescendant(node, enabled)) return "partial";
    return "unchecked";
  };
  const checkState = getCheckState();

  return (
    <div>
      <div
        className={cn(
          "flex items-center gap-1.5 h-8 rounded-md px-1.5 hover:bg-secondary/60 transition-colors group",
        )}
        style={{ paddingLeft: depth * 20 + 6 }}
      >
        {/* Expand/collapse arrow */}
        <button
          onClick={() => hasChildren && setExpanded(!expanded)}
          className={cn(
            "flex items-center justify-center w-5 h-5 rounded shrink-0",
            hasChildren
              ? "text-muted-foreground hover:text-foreground"
              : "invisible"
          )}
        >
          <ChevronRight
            className={cn(
              "w-3 h-3 transition-transform duration-150",
              expanded && "rotate-90"
            )}
          />
        </button>

        {/* Checkbox */}
        <button
          onClick={() => onToggle(node.dn)}
          className={cn(
            "flex items-center justify-center w-4 h-4 rounded border shrink-0 transition-colors",
            checkState === "checked"
              ? "bg-primary border-primary text-primary-foreground"
              : checkState === "partial"
                ? "bg-primary/20 border-primary/50 text-primary"
                : "border-border hover:border-primary/50"
          )}
        >
          {checkState === "checked" && <Check className="w-2.5 h-2.5" />}
          {checkState === "partial" && <Minus className="w-2.5 h-2.5" />}
        </button>

        {/* Label */}
        <span
          className="text-[12px] font-medium truncate cursor-default select-none"
          onClick={() => onToggle(node.dn)}
        >
          {node.name}
        </span>
      </div>

      {/* Children */}
      {expanded && hasChildren && (
        <div>
          {node.children.map((child) => (
            <OuTreeItem
              key={child.dn}
              node={child}
              enabled={enabled}
              onToggle={onToggle}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function hasCheckedDescendant(node: OuTreeNode, enabled: Set<string>): boolean {
  for (const child of node.children) {
    if (enabled.has(child.dn)) return true;
    if (hasCheckedDescendant(child, enabled)) return true;
  }
  return false;
}
