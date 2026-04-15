import { useMemo, useState } from "react";
import { Loader2, Search, FolderTree, Users as UsersIcon } from "lucide-react";
import { cn, getOUFromDN } from "@/lib/utils";
import { useGroupLookup } from "@/hooks/use-ad-groups";
import { useOuTree } from "@/hooks/use-ad-directory";
import { formatErrorMessage } from "@/lib/feedback";

function getParentDn(dn?: string | null) {
  if (!dn) return null;
  const idx = dn.indexOf(",");
  return idx === -1 ? null : dn.slice(idx + 1);
}

function ActionDialogShell({
  title,
  subtitle,
  onClose,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
  footer: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-[520px] mx-4 bg-card border border-border rounded-xl shadow-2xl animate-[scale-in_0.18s_cubic-bezier(0.16,1,0.3,1)]">
        <div className="px-5 py-4 border-b border-border flex items-start justify-between gap-4">
          <div>
            <h2 className="text-[14px] font-bold">{title}</h2>
            {subtitle && <p className="text-[11px] text-muted-foreground mt-1">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
          >
            <span className="text-lg leading-none">&times;</span>
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
        <div className="px-5 py-3.5 border-t border-border flex justify-end gap-2">
          {footer}
        </div>
      </div>
    </div>
  );
}

export function MoveToOuDialog({
  objectLabel,
  currentDn,
  loading,
  onClose,
  onConfirm,
}: {
  objectLabel: string;
  currentDn?: string | null;
  loading?: boolean;
  onClose: () => void;
  onConfirm: (targetOu: string) => Promise<void> | void;
}) {
  const [search, setSearch] = useState("");
  const [selectedOu, setSelectedOu] = useState<string | null>(null);
  const { data: ous = [], isLoading, error } = useOuTree();
  const currentParentDn = getParentDn(currentDn);

  const filtered = useMemo(() => {
    const term = search.trim().toLocaleLowerCase();
    if (!term) return ous;
    return ous.filter((ou: any) =>
      String(ou.name ?? "").toLocaleLowerCase().includes(term) ||
      String(ou.dn ?? "").toLocaleLowerCase().includes(term)
    );
  }, [ous, search]);

  const selectedSameAsCurrent = !!selectedOu && !!currentParentDn && selectedOu === currentParentDn;

  return (
    <ActionDialogShell
      title={`Move ${objectLabel}`}
      subtitle={
        currentDn
          ? `Current OU: ${getOUFromDN(currentDn) || "Unknown"}`
          : "Select a destination organizational unit."
      }
      onClose={onClose}
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            className="h-8 px-4 rounded-md text-[12px] font-medium text-muted-foreground hover:bg-secondary transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => selectedOu && onConfirm(selectedOu)}
            disabled={loading || !selectedOu || selectedSameAsCurrent}
            className="h-8 px-4 rounded-md bg-primary text-primary-foreground text-[12px] font-semibold hover:opacity-90 disabled:opacity-40 transition-opacity"
          >
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Move"}
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="relative">
          <Search className="input-leading-icon absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/55" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search OUs..."
            autoComplete="off"
            name="move-ou-search"
            spellCheck={false}
            autoCorrect="off"
            autoCapitalize="none"
            data-lpignore="true"
            data-1p-ignore="true"
            data-form-type="other"
            className="input-base input-with-leading-icon w-full"
          />
        </div>

        <div className="rounded-lg border border-border overflow-hidden">
          <div className="max-h-[280px] overflow-auto">
            {isLoading ? (
              <div className="flex items-center justify-center h-32 text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" />
              </div>
            ) : error ? (
              <div className="px-4 py-6 text-sm text-destructive">
                {formatErrorMessage(error, "Failed to load OUs")}
              </div>
            ) : filtered.length === 0 ? (
              <div className="px-4 py-6 text-sm text-muted-foreground">No matching OUs.</div>
            ) : (
              filtered.map((ou: any) => (
                <button
                  key={ou.dn}
                  type="button"
                  onClick={() => setSelectedOu(ou.dn)}
                  className={cn(
                    "w-full text-left px-3 py-2.5 border-b last:border-b-0 border-border/60 hover:bg-secondary/40 transition-colors",
                    selectedOu === ou.dn && "bg-primary/10"
                  )}
                >
                  <div className="flex items-start gap-2.5">
                    <FolderTree className="w-3.5 h-3.5 text-primary mt-0.5 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-[12px] font-medium truncate">{ou.name}</p>
                      <p className="text-[10px] font-mono text-muted-foreground truncate">{ou.dn}</p>
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {selectedSameAsCurrent && (
          <p className="text-[11px] text-warning">
            This object is already in the selected OU.
          </p>
        )}
      </div>
    </ActionDialogShell>
  );
}

export function GroupPickerDialog({
  memberSam,
  loading,
  onClose,
  onConfirm,
}: {
  memberSam: string;
  loading?: boolean;
  onClose: () => void;
  onConfirm: (groupName: string) => Promise<void> | void;
}) {
  const [search, setSearch] = useState("");
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
  const { data: groups = [], isLoading } = useGroupLookup(search);

  return (
    <ActionDialogShell
      title={`Add ${memberSam} to Group`}
      subtitle="Search for a group and select the destination."
      onClose={onClose}
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            className="h-8 px-4 rounded-md text-[12px] font-medium text-muted-foreground hover:bg-secondary transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => selectedGroup && onConfirm(selectedGroup)}
            disabled={loading || !selectedGroup}
            className="h-8 px-4 rounded-md bg-primary text-primary-foreground text-[12px] font-semibold hover:opacity-90 disabled:opacity-40 transition-opacity"
          >
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Add to Group"}
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="relative">
          <Search className="input-leading-icon absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/55" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search group name or group ID..."
            autoComplete="off"
            name="group-picker-search"
            spellCheck={false}
            autoCorrect="off"
            autoCapitalize="none"
            data-lpignore="true"
            data-1p-ignore="true"
            data-form-type="other"
            className="input-base input-with-leading-icon w-full"
          />
        </div>

        <div className="rounded-lg border border-border overflow-hidden">
          <div className="max-h-[280px] overflow-auto">
            {!search.trim() ? (
              <div className="px-4 py-6 text-sm text-muted-foreground">
                Type at least 2 characters to search by group name or group ID.
              </div>
            ) : isLoading ? (
              <div className="flex items-center justify-center h-32 text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" />
              </div>
            ) : groups.length === 0 ? (
              <div className="px-4 py-6 text-sm text-muted-foreground">No matching groups.</div>
            ) : (
              groups.map((group: any) => (
                <button
                  key={group.SamAccountName || group.Name}
                  type="button"
                  onClick={() => setSelectedGroup(group.Name)}
                  className={cn(
                    "w-full text-left px-3 py-2.5 border-b last:border-b-0 border-border/60 hover:bg-secondary/40 transition-colors",
                    selectedGroup === group.Name && "bg-primary/10"
                  )}
                >
                  <div className="flex items-start gap-2.5">
                    <UsersIcon className="w-3.5 h-3.5 text-primary mt-0.5 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-[12px] font-medium truncate">{group.Name}</p>
                      <p className="text-[10px] text-muted-foreground truncate">
                        {[group.GroupCategory, group.GroupScope].filter(Boolean).join(" · ")}
                      </p>
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      </div>
    </ActionDialogShell>
  );
}
