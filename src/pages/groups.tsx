import { useEffect, useState } from "react";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { cn, exportToCSV } from "@/lib/utils";
import { useCredentialStore } from "@/stores/credential-store";
import { useGroups, useGroupMembers, useAddGroupMember, useRemoveGroupMember, useCreateGroup } from "@/hooks/use-ad-groups";
import { PaginationBar } from "@/components/shared/pagination-bar";
import { isElevationCancelledError } from "@/lib/tauri-ad";
import { toast } from "sonner";
import {
  Search,
  Download,
  ChevronUp,
  ChevronDown,
  Loader2,
  ShieldCheck,
  Plus,
  X,
  UserMinus,
  UserPlus,
  Users,
  WifiOff,
  AlertTriangle,
} from "lucide-react";

type SortKey = "Name" | "GroupCategory" | "GroupScope" | "MemberCount" | "Description";

export default function GroupsPage() {
  const isConnected = useCredentialStore((s) => s.isConnected);
  const [search, setSearch]                   = useState("");
  const debouncedSearch = useDebouncedValue(search);
  const [selectedGroup, setSelectedGroup]     = useState<string | null>(null);
  const [showCreate, setShowCreate]           = useState(false);
  const [sortKey, setSortKey]                 = useState<SortKey>("Name");
  const [sortDir, setSortDir]                 = useState<"asc" | "desc">("asc");
  const [page, setPage]                       = useState(1);
  const [pageSize, setPageSize]               = useState(100);

  const { data, isLoading, isFetching, error } = useGroups({
    search: debouncedSearch || undefined,
    page,
    pageSize,
    sortBy: sortKey,
    sortDir,
  });

  const groups = data?.items ?? [];
  const totalGroups = data?.total ?? 0;
  const pageCount = data?.pageCount ?? 0;
  const shouldAnimateRows = groups.length <= 120;

  const handleSort = (key: SortKey) => {
    setPage(1);
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
  };

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, sortKey, sortDir, pageSize]);

  if (!isConnected) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <WifiOff className="w-10 h-10 text-muted-foreground/30" />
        <p className="text-sm text-muted-foreground">Connect to Active Directory to manage groups</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-primary" />
          <h1 className="text-[15px] font-bold tracking-tight">Groups</h1>
          <span className="text-[11px] text-muted-foreground font-mono bg-secondary px-1.5 py-0.5 rounded-md ml-1">
            {totalGroups}
          </span>
          {isFetching && !isLoading && (
            <span className="flex items-center gap-1 rounded-md border border-border bg-secondary px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
              <Loader2 className="w-3 h-3 animate-spin" />
              Updating
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-1.5 h-8 px-3 rounded-md bg-primary text-primary-foreground text-[12px] font-semibold hover:opacity-90 transition-opacity"
          >
            <Plus className="w-3.5 h-3.5" />
            Create Group
          </button>
          <button
            onClick={() => exportToCSV(groups, "ad-groups")}
            className="flex items-center gap-1.5 h-8 px-3 rounded-md border border-border text-[12px] font-medium text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            CSV
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="px-5 py-2.5 border-b border-border shrink-0 bg-secondary/20">
        <div className="relative max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/40" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search groups..."
            className="input-base w-full pl-9"
          />
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="flex items-center justify-center h-40">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <div className="flex items-center gap-3 p-4 m-4 rounded-xl border border-destructive/20 bg-destructive/5">
            <AlertTriangle className="w-5 h-5 text-destructive shrink-0" />
            <div>
              <p className="text-sm font-semibold">Failed to load groups</p>
              <p className="text-xs text-muted-foreground mt-0.5">{error instanceof Error ? error.message : "Unknown"}</p>
            </div>
          </div>
        ) : groups.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-muted-foreground">
            <ShieldCheck className="w-8 h-8 opacity-20 mb-2" />
            <p className="text-sm">No groups found</p>
          </div>
        ) : (
          <table className="data-table data-table-slim">
            <colgroup>
              <col style={{ width: "34%" }} />
              <col style={{ width: "14%" }} />
              <col style={{ width: "14%" }} />
              <col style={{ width: "10%" }} />
              <col style={{ width: "28%" }} />
            </colgroup>
            <thead className="sticky top-0 z-10">
              <tr className="bg-secondary/40 backdrop-blur-sm border-b border-border">
                {([
                  ["Name",          "Name"],
                  ["GroupCategory", "Type"],
                  ["GroupScope",    "Scope"],
                  ["MemberCount",   "Members"],
                  ["Description",   "Description"],
                ] as [SortKey, string][]).map(([key, label]) => (
                  <th
                    key={key}
                    onClick={() => handleSort(key)}
                    className="text-left text-[10px] font-bold uppercase tracking-[0.08em] text-muted-foreground/60 px-4 py-2.5 cursor-pointer hover:text-muted-foreground transition-colors select-none whitespace-nowrap"
                  >
                    <span className="flex items-center gap-1">
                      {label}
                      {sortKey === key && (
                        sortDir === "asc"
                          ? <ChevronUp   className="w-3 h-3 text-primary" />
                          : <ChevronDown className="w-3 h-3 text-primary" />
                      )}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {groups.map((group: any, i: number) => (
                <tr
                  key={group.SamAccountName || i}
                  onClick={() => setSelectedGroup(group.Name)}
                  className={cn(
                    "table-row-hover border-b border-border/40 hover:bg-secondary/25 cursor-pointer",
                    shouldAnimateRows && "table-row-animate"
                  )}
                  style={shouldAnimateRows ? { animationDelay: `${Math.min(i * 12, 250)}ms` } : undefined}
                >
                  <td className="px-4">
                    <div className="flex items-center gap-2.5">
                      <div className={cn(
                        "flex items-center justify-center w-7 h-7 rounded-lg shrink-0",
                        group.GroupCategory === "Security"
                          ? "bg-blue-500/10 text-blue-500"
                          : "bg-purple-500/10 text-purple-500"
                      )}>
                        <ShieldCheck className="w-3.5 h-3.5" />
                      </div>
                      <p className="text-[13px] font-medium truncate">{group.Name}</p>
                    </div>
                  </td>
                  <td className="px-4">
                    <span className={cn(
                      "badge",
                      group.GroupCategory === "Security"
                        ? "bg-blue-500/10 text-blue-500"
                        : "bg-purple-500/10 text-purple-500"
                    )}>
                      {group.GroupCategory}
                    </span>
                  </td>
                  <td className="px-4">
                    <span className="text-[12px] text-muted-foreground whitespace-nowrap">{group.GroupScope}</span>
                  </td>
                  <td className="px-4">
                    <span className="text-[12px] font-mono text-muted-foreground whitespace-nowrap">{group.MemberCount ?? "—"}</span>
                  </td>
                  <td className="px-4">
                    <span className="text-[12px] text-muted-foreground truncate block max-w-xs">{group.Description || "—"}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <PaginationBar
        page={page}
        pageCount={pageCount}
        pageSize={pageSize}
        total={totalGroups}
        loading={isLoading}
        onPageChange={setPage}
        onPageSizeChange={setPageSize}
        itemLabel="groups"
      />

      {selectedGroup && <GroupDetailSheet name={selectedGroup} onClose={() => setSelectedGroup(null)} />}
      {showCreate    && <CreateGroupDialog onClose={() => setShowCreate(false)} />}
    </div>
  );
}

/* ─── Group detail sheet ─────────────────────────────────────── */
function GroupDetailSheet({ name, onClose }: { name: string; onClose: () => void }) {
  const { data: members = [], isLoading } = useGroupMembers(name);
  const addMember    = useAddGroupMember();
  const removeMember = useRemoveGroupMember();
  const [newMemberSam, setNewMemberSam] = useState("");

  const handleAdd = async () => {
    if (!newMemberSam.trim()) return;
    try {
      await addMember.mutateAsync({ groupName: name, memberSam: newMemberSam.trim() });
      toast.success(`Added ${newMemberSam} to ${name}`);
      setNewMemberSam("");
    } catch (err: any) {
      if (isElevationCancelledError(err)) { toast.message("Add member cancelled."); return; }
      toast.error(err?.toString());
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px] sheet-overlay" onClick={onClose} />
      <div className="fixed right-0 top-0 bottom-0 z-50 w-full max-w-[440px] bg-card border-l border-border shadow-2xl animate-[slide-in-right_0.28s_cubic-bezier(0.16,1,0.3,1)] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 h-14 border-b border-border shrink-0">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary/10">
              <ShieldCheck className="w-4 h-4 text-primary" />
            </div>
            <div>
              <p className="text-[13px] font-bold">{name}</p>
              <p className="text-[11px] text-muted-foreground">{members.length} member{members.length !== 1 ? "s" : ""}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Add member */}
        <div className="px-5 py-3 border-b border-border flex gap-2 bg-secondary/20">
          <div className="relative flex-1">
            <UserPlus className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/40" />
            <input
              value={newMemberSam}
              onChange={(e) => setNewMemberSam(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAdd()}
              placeholder="Add member by username..."
              className="input-base w-full pl-9 font-mono"
            />
          </div>
          <button
            onClick={handleAdd}
            disabled={addMember.isPending || !newMemberSam.trim()}
            className="h-8 px-3.5 rounded-md bg-primary text-primary-foreground text-[12px] font-semibold hover:opacity-90 disabled:opacity-40 transition-opacity"
          >
            {addMember.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Add"}
          </button>
        </div>

        {/* Member list */}
        <div className="flex-1 overflow-auto p-3">
          {isLoading ? (
            <div className="flex items-center justify-center h-40">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : members.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-muted-foreground">
              <Users className="w-8 h-8 opacity-20 mb-2" />
              <p className="text-sm">No members</p>
            </div>
          ) : (
            <div className="space-y-0.5">
              {members.map((m: any, i: number) => (
                <div
                  key={i}
                  className="group flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-secondary/50 transition-colors"
                >
                  <div className={cn(
                    "flex items-center justify-center w-7 h-7 rounded-full text-[10px] font-bold shrink-0",
                    m.ObjectClass === "user"
                      ? "bg-blue-500/10 text-blue-500"
                      : m.ObjectClass === "computer"
                      ? "bg-amber-500/10 text-amber-500"
                      : "bg-emerald-500/10 text-emerald-500"
                  )}>
                    {m.ObjectClass === "user" ? "U" : m.ObjectClass === "computer" ? "C" : "G"}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-medium truncate">{m.Name}</p>
                    <p className="text-[11px] font-mono text-muted-foreground">{m.SamAccountName}</p>
                  </div>
                  <span className="text-[10px] text-muted-foreground/50 capitalize shrink-0">{m.ObjectClass}</span>
                  <button
                    onClick={async () => {
                      try {
                        await removeMember.mutateAsync({ groupName: name, memberSam: m.SamAccountName });
                        toast.success(`Removed ${m.SamAccountName}`);
                      } catch (err: any) {
                        if (isElevationCancelledError(err)) { toast.message("Remove cancelled."); return; }
                        toast.error(err?.toString());
                      }
                    }}
                    className="opacity-0 group-hover:opacity-100 p-1 rounded text-destructive/50 hover:text-destructive hover:bg-destructive/10 transition-all"
                  >
                    <UserMinus className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

/* ─── Create group dialog ────────────────────────────────────── */
function CreateGroupDialog({ onClose }: { onClose: () => void }) {
  const createGroup = useCreateGroup();
  const [form, setForm] = useState({
    name: "", samAccountName: "", groupScope: "Global",
    groupCategory: "Security", description: "", ouPath: "",
  });
  const update = (key: string, value: string) => setForm((f) => ({ ...f, [key]: value }));

  const handleCreate = async () => {
    if (!form.name || !form.samAccountName || !form.ouPath) {
      toast.error("Name, SAM, and OU Path are required");
      return;
    }
    try {
      await createGroup.mutateAsync({
        name: form.name, samAccountName: form.samAccountName,
        groupScope: form.groupScope, groupCategory: form.groupCategory,
        description: form.description || undefined, ouPath: form.ouPath,
      });
      toast.success("Group created");
      onClose();
    } catch (e: any) {
      if (isElevationCancelledError(e)) { toast.message("Creation cancelled."); return; }
      toast.error(e?.toString());
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-[400px] mx-4 bg-card border border-border rounded-xl shadow-2xl animate-[scale-in_0.18s_cubic-bezier(0.16,1,0.3,1)]">
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-primary" />
            <h2 className="text-[14px] font-bold">Create New Group</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-md text-muted-foreground hover:bg-secondary transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="px-5 py-4 space-y-3">
          <MiniField label="Name *"              value={form.name}            onChange={(v) => update("name", v)} />
          <MiniField label="SAM Account Name *"  value={form.samAccountName}  onChange={(v) => update("samAccountName", v)} mono />
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[10px] font-bold uppercase tracking-[0.07em] text-muted-foreground/60">Scope</label>
              <select
                value={form.groupScope}
                onChange={(e) => update("groupScope", e.target.value)}
                className="input-base w-full"
              >
                <option>Global</option>
                <option>Universal</option>
                <option>DomainLocal</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-bold uppercase tracking-[0.07em] text-muted-foreground/60">Category</label>
              <select
                value={form.groupCategory}
                onChange={(e) => update("groupCategory", e.target.value)}
                className="input-base w-full"
              >
                <option>Security</option>
                <option>Distribution</option>
              </select>
            </div>
          </div>
          <MiniField label="Description" value={form.description} onChange={(v) => update("description", v)} />
          <MiniField label="OU Path (DN) *" value={form.ouPath} onChange={(v) => update("ouPath", v)} mono placeholder="OU=Groups,DC=contoso,DC=com" />
        </div>
        <div className="px-5 py-3.5 border-t border-border flex justify-end gap-2">
          <button onClick={onClose} className="h-8 px-4 rounded-md text-[12px] font-medium text-muted-foreground hover:bg-secondary transition-colors">Cancel</button>
          <button
            onClick={handleCreate}
            disabled={createGroup.isPending}
            className="h-8 px-4 rounded-md bg-primary text-primary-foreground text-[12px] font-semibold hover:opacity-90 disabled:opacity-40 transition-opacity"
          >
            {createGroup.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Create Group"}
          </button>
        </div>
      </div>
    </div>
  );
}

function MiniField({ label, value, onChange, mono = false, placeholder }: {
  label: string; value: string; onChange: (v: string) => void; mono?: boolean; placeholder?: string;
}) {
  return (
    <div className="space-y-1">
      <label className="text-[10px] font-bold uppercase tracking-[0.07em] text-muted-foreground/60">{label}</label>
      <input
        value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        className={cn("input-base w-full", mono && "font-mono")}
      />
    </div>
  );
}
