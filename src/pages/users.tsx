import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { cn, formatDate, getOUFromDN, exportToCSV } from "@/lib/utils";
import { useCredentialStore } from "@/stores/credential-store";
import {
  useUsers,
  useUnlockUser,
  useToggleUser,
  useCreateUser,
  useResetPassword,
  useAddUserToGroup,
  useMoveUser,
} from "@/hooks/use-ad-users";
import { useResizablePercentColumns } from "@/hooks/use-resizable-columns";
import { PaginationBar } from "@/components/shared/pagination-bar";
import { isElevationCancelledError } from "@/lib/tauri-ad";
import { UserDetailSheet } from "@/components/users/user-detail-sheet";
import { GroupPickerDialog, MoveToOuDialog } from "@/components/shared/object-action-dialogs";
import { toast } from "sonner";
import {
  Search,
  UserPlus,
  Download,
  ChevronUp,
  ChevronDown,
  Loader2,
  Users as UsersIcon,
  Lock,
  Unlock,
  Power,
  MoreHorizontal,
  WifiOff,
  Filter,
  AlertTriangle,
  KeyRound,
  FolderTree,
} from "lucide-react";

type SortKey = "Name" | "SamAccountName" | "Description" | "Department" | "Enabled" | "LastLogonDate";
type SortDir = "asc" | "desc";

const USER_COLUMN_DEFAULTS = [30, 10, 26, 12, 10, 10] as const;
const USER_COLUMN_MINS = [22, 7, 14, 8, 7, 7] as const;

export default function UsersPage() {
  const isConnected = useCredentialStore((s) => s.isConnected);
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch]                   = useState("");
  const debouncedSearch = useDebouncedValue(search);
  const getStatusFilter = (): "all" | "enabled" | "disabled" | "locked" => {
    const status = searchParams.get("status");
    return status === "enabled" || status === "disabled" || status === "locked"
      ? status
      : "all";
  };
  const [statusFilter, setStatusFilter]       = useState<"all" | "enabled" | "disabled" | "locked">(getStatusFilter);
  const [selectedSam, setSelectedSam]         = useState<string | null>(null);
  const [sortKey, setSortKey]                 = useState<SortKey>("Name");
  const [sortDir, setSortDir]                 = useState<SortDir>("asc");
  const [page, setPage]                       = useState(1);
  const [pageSize, setPageSize]               = useState(100);
  const [showCreate, setShowCreate]           = useState(false);
  const [contextMenu, setContextMenu]         = useState<{
    x: number; y: number; sam: string; enabled: boolean; locked: boolean; dn?: string | null;
  } | null>(null);
  const [resetPasswordSam, setResetPasswordSam] = useState<string | null>(null);
  const [addToGroupSam, setAddToGroupSam] = useState<string | null>(null);
  const [moveUserState, setMoveUserState] = useState<{ sam: string; dn?: string | null } | null>(null);

  const { data, isLoading, isFetching, error } = useUsers({
    search: debouncedSearch || undefined,
    status: statusFilter,
    page,
    pageSize,
    sortBy: sortKey,
    sortDir,
  });
  const unlock = useUnlockUser();
  const toggle = useToggleUser();
  const resetPassword = useResetPassword();
  const addToGroup = useAddUserToGroup();
  const moveUser = useMoveUser();
  const {
    tableRef: usersTableRef,
    widths: userColumnWidths,
    startResize: startUserResize,
  } = useResizablePercentColumns(
    "table-widths.users.v1",
    USER_COLUMN_DEFAULTS,
    USER_COLUMN_MINS
  );

  const users = data?.items ?? [];
  const totalUsers = data?.total ?? 0;
  const pageCount = data?.pageCount ?? 0;
  const shouldAnimateRows = users.length <= 120;

  const handleSort = (key: SortKey) => {
    setPage(1);
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
  };

  useEffect(() => {
    setStatusFilter(getStatusFilter());
  }, [searchParams]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, statusFilter, sortKey, sortDir, pageSize]);

  if (!isConnected) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <WifiOff className="w-10 h-10 text-muted-foreground/30" />
        <p className="text-sm text-muted-foreground">Connect to Active Directory to manage users</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <UsersIcon className="w-4 h-4 text-primary" />
          <h1 className="text-[15px] font-bold tracking-tight">Users</h1>
          <span className="text-[11px] text-muted-foreground font-mono bg-secondary px-1.5 py-0.5 rounded-md ml-1">
            {totalUsers}
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
            <UserPlus className="w-3.5 h-3.5" />
            Create User
          </button>
          <button
            onClick={() => exportToCSV(users, "ad-users")}
            className="flex items-center gap-1.5 h-8 px-3 rounded-md border border-border text-[12px] font-medium text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            CSV
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 px-5 py-2.5 border-b border-border shrink-0 bg-secondary/20">
        <div className="relative flex-1 max-w-xs">
          <Search className="input-leading-icon absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/55" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, username, employee # or description..."
            autoComplete="off"
            name="users-search"
            spellCheck={false}
            autoCorrect="off"
            autoCapitalize="none"
            data-lpignore="true"
            data-1p-ignore="true"
            data-form-type="other"
            className="input-base input-with-leading-icon w-full"
          />
        </div>
        <div className="flex items-center gap-1">
          <Filter className="w-3 h-3 text-muted-foreground/40 mr-0.5" />
          {(["all", "enabled", "disabled", "locked"] as const).map((f) => (
            <button
              key={f}
              onClick={() => {
                setStatusFilter(f);
                const nextParams = new URLSearchParams(searchParams);
                if (f === "all") nextParams.delete("status");
                else nextParams.set("status", f);
                setSearchParams(nextParams, { replace: true });
              }}
              className={cn(
                "h-7 px-2.5 rounded-md text-[11px] font-medium capitalize transition-colors",
                statusFilter === f
                  ? "bg-primary/15 text-primary"
                  : "text-muted-foreground hover:text-foreground hover:bg-secondary"
              )}
            >
              {f}
            </button>
          ))}
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
              <p className="text-sm font-semibold">Failed to load users</p>
              <p className="text-xs text-muted-foreground mt-0.5">{error instanceof Error ? error.message : "Unknown"}</p>
            </div>
          </div>
        ) : users.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-muted-foreground">
            <UsersIcon className="w-8 h-8 opacity-20 mb-2" />
            <p className="text-sm">No users found</p>
          </div>
        ) : (
          <table ref={usersTableRef} className="data-table data-table-slim">
            <colgroup>
              <col style={{ width: `${userColumnWidths[0]}%` }} />
              <col style={{ width: `${userColumnWidths[1]}%` }} />
              <col style={{ width: `${userColumnWidths[2]}%` }} />
              <col style={{ width: `${userColumnWidths[3]}%` }} />
              <col style={{ width: `${userColumnWidths[4]}%` }} />
              <col style={{ width: `${userColumnWidths[5]}%` }} />
              <col style={{ width: "44px" }} />
            </colgroup>
            <thead className="sticky top-0 z-10">
              <tr className="bg-secondary/40 backdrop-blur-sm border-b border-border">
                {([
                  ["Name",           "Name"],
                  ["SamAccountName", "Username"],
                  ["Description",    "Description"],
                  ["Department",     "Department"],
                  ["Enabled",        "Status"],
                  ["LastLogonDate",  "Last Logon"],
                ] as [SortKey, string][]).map(([key, label], idx) => (
                  <th
                    key={key}
                    onClick={() => handleSort(key)}
                    className={cn(
                      "relative text-left text-[10px] font-bold uppercase tracking-[0.08em] text-muted-foreground/60 py-2.5 cursor-pointer hover:text-muted-foreground transition-colors select-none whitespace-nowrap",
                      key === "SamAccountName" ? "pl-1 pr-2" : "px-4"
                    )}
                  >
                    <span className="flex items-center gap-1">
                      {label}
                      {sortKey === key && (
                        sortDir === "asc"
                          ? <ChevronUp   className="w-3 h-3 text-primary" />
                          : <ChevronDown className="w-3 h-3 text-primary" />
                        )}
                    </span>
                    {idx < 5 && (
                      <span
                        role="separator"
                        aria-label={`Resize ${label} column`}
                        aria-orientation="vertical"
                        title="Drag to resize columns"
                        onMouseDown={(e) => startUserResize(idx, e)}
                        onClick={(e) => e.stopPropagation()}
                        className="absolute right-0 top-0 h-full w-2 cursor-col-resize select-none"
                      >
                        <span className="pointer-events-none absolute right-0 top-1.5 bottom-1.5 w-px bg-border/70" />
                      </span>
                    )}
                  </th>
                ))}
                <th className="w-11 px-0" />
              </tr>
            </thead>
            <tbody>
              {users.map((user: any, i: number) => (
                <tr
                  key={user.SamAccountName || i}
                  onClick={() => setSelectedSam(user.SamAccountName)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setContextMenu({
                      x: e.clientX,
                      y: e.clientY,
                      sam: user.SamAccountName,
                      enabled: user.Enabled,
                      locked: user.LockedOut,
                      dn: user.DistinguishedName,
                    });
                  }}
                  className={cn(
                    "table-row-hover border-b border-border/40 hover:bg-secondary/25 cursor-pointer",
                    shouldAnimateRows && "table-row-animate"
                  )}
                  style={shouldAnimateRows ? { animationDelay: `${Math.min(i * 12, 250)}ms` } : undefined}
                >
                  {/* Name + Avatar */}
                  <td className="px-4">
                    <div className="flex items-center gap-2.5">
                      <UserAvatar name={user.DisplayName || user.Name} enabled={user.Enabled} locked={user.LockedOut} />
                      <div className="min-w-0">
                        <p className="text-[13px] font-medium leading-tight truncate">
                          {user.DisplayName || user.Name}
                        </p>
                        <p className="text-[10px] text-muted-foreground leading-tight truncate">
                          {getOUFromDN(user.DistinguishedName)}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="pl-1 pr-2">
                    <span className="text-[12px] font-mono text-muted-foreground whitespace-nowrap truncate block">{user.SamAccountName}</span>
                  </td>
                  <td className="px-4">
                    <span
                      className="text-[12px] text-muted-foreground whitespace-nowrap truncate block"
                      title={user.Description || "—"}
                    >
                      {user.Description || "—"}
                    </span>
                  </td>
                  <td className="px-4">
                    <span className="text-[12px] text-muted-foreground whitespace-nowrap truncate block">{user.Department || "—"}</span>
                  </td>
                  <td className="px-4">
                    <StatusBadge enabled={user.Enabled} locked={user.LockedOut} />
                  </td>
                  <td className="px-4">
                    <span className="text-[11px] font-mono text-muted-foreground whitespace-nowrap">{formatDate(user.LastLogonDate)}</span>
                  </td>
                  <td className="px-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setContextMenu({
                          x: e.clientX,
                          y: e.clientY,
                          sam: user.SamAccountName,
                          enabled: user.Enabled,
                          locked: user.LockedOut,
                          dn: user.DistinguishedName,
                        });
                      }}
                      className="p-1 rounded text-muted-foreground/30 hover:text-muted-foreground hover:bg-secondary transition-colors"
                    >
                      <MoreHorizontal className="w-4 h-4" />
                    </button>
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
        total={totalUsers}
        loading={isLoading}
        onPageChange={setPage}
        onPageSizeChange={setPageSize}
        itemLabel="users"
      />

      {/* Context menu */}
      {contextMenu && (
        <>
          <div className="fixed inset-0 z-50" onClick={() => setContextMenu(null)} />
          <div
            className="fixed z-50 bg-popover border border-border rounded-lg shadow-2xl p-1 min-w-[170px] animate-[scale-in_0.12s_ease-out]"
            style={{ left: contextMenu.x, top: contextMenu.y }}
          >
            <ContextItem icon={UsersIcon} label="View Details" onClick={() => { setSelectedSam(contextMenu.sam); setContextMenu(null); }} />
            <ContextItem
              icon={KeyRound}
              label="Reset Password"
              onClick={() => {
                setResetPasswordSam(contextMenu.sam);
                setContextMenu(null);
              }}
            />
            {contextMenu.locked && (
              <ContextItem
                icon={Unlock}
                label="Unlock Account"
                onClick={async () => {
                  try {
                    await unlock.mutateAsync(contextMenu.sam);
                    toast.success("Account unlocked");
                  } catch (e: any) {
                    if (isElevationCancelledError(e)) { toast.message("Unlock cancelled."); return; }
                    toast.error(e?.toString());
                  }
                  setContextMenu(null);
                }}
              />
            )}
            <ContextItem
              icon={UserPlus}
              label="Add to Group"
              onClick={() => {
                setAddToGroupSam(contextMenu.sam);
                setContextMenu(null);
              }}
            />
            <ContextItem
              icon={Power}
              label={contextMenu.enabled ? "Disable Account" : "Enable Account"}
              destructive={contextMenu.enabled}
              onClick={async () => {
                try {
                  await toggle.mutateAsync({ sam: contextMenu.sam, enable: !contextMenu.enabled });
                  toast.success(contextMenu.enabled ? "Account disabled" : "Account enabled");
                } catch (e: any) {
                  if (isElevationCancelledError(e)) { toast.message("Update cancelled."); return; }
                  toast.error(e?.toString());
                }
                setContextMenu(null);
              }}
            />
            <ContextItem
              icon={FolderTree}
              label="Move"
              onClick={() => {
                setMoveUserState({ sam: contextMenu.sam, dn: contextMenu.dn });
                setContextMenu(null);
              }}
            />
          </div>
        </>
      )}

      {selectedSam && <UserDetailSheet sam={selectedSam} onClose={() => setSelectedSam(null)} />}
      {showCreate   && <CreateUserDialog onClose={() => setShowCreate(false)} />}
      {resetPasswordSam && (
        <ResetPasswordDialog
          sam={resetPasswordSam}
          loading={resetPassword.isPending}
          onClose={() => setResetPasswordSam(null)}
          onConfirm={async (newPassword) => {
            try {
              await resetPassword.mutateAsync({ samAccountName: resetPasswordSam, newPassword });
              toast.success("Password reset successfully.");
              setResetPasswordSam(null);
            } catch (e: any) {
              if (isElevationCancelledError(e)) { toast.message("Cancelled."); return; }
              toast.error(e?.toString() || "Failed to reset password");
            }
          }}
        />
      )}
      {addToGroupSam && (
        <GroupPickerDialog
          memberSam={addToGroupSam}
          loading={addToGroup.isPending}
          onClose={() => setAddToGroupSam(null)}
          onConfirm={async (groupName) => {
            try {
              await addToGroup.mutateAsync({ sam: addToGroupSam, groupName });
              toast.success(`Added ${addToGroupSam} to ${groupName}`);
              setAddToGroupSam(null);
            } catch (e: any) {
              if (isElevationCancelledError(e)) { toast.message("Cancelled."); return; }
              toast.error(e?.toString() || "Failed to add to group");
            }
          }}
        />
      )}
      {moveUserState && (
        <MoveToOuDialog
          objectLabel={moveUserState.sam}
          currentDn={moveUserState.dn}
          loading={moveUser.isPending}
          onClose={() => setMoveUserState(null)}
          onConfirm={async (targetOu) => {
            try {
              await moveUser.mutateAsync({ sam: moveUserState.sam, targetOu });
              toast.success("User moved successfully");
              setMoveUserState(null);
            } catch (e: any) {
              if (isElevationCancelledError(e)) { toast.message("Cancelled."); return; }
              toast.error(e?.toString() || "Failed to move user");
            }
          }}
        />
      )}
    </div>
  );
}

/* ─── User Avatar ────────────────────────────────────────────── */
function UserAvatar({ name, enabled, locked }: { name: string; enabled: boolean; locked: boolean }) {
  const initials = name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w: string) => w[0].toUpperCase())
    .join("");

  return (
    <div
      className={cn(
        "relative flex items-center justify-center w-7 h-7 rounded-full text-[10px] font-bold shrink-0 select-none",
        locked
          ? "bg-warning/15 text-warning"
          : enabled
          ? "bg-primary/12 text-primary"
          : "bg-muted text-muted-foreground/60"
      )}
    >
      {initials || "?"}
      {locked && (
        <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 flex items-center justify-center rounded-full bg-warning">
          <Lock className="w-1.5 h-1.5 text-warning-foreground" />
        </span>
      )}
    </div>
  );
}

/* ─── Status badge ───────────────────────────────────────────── */
function StatusBadge({ enabled, locked }: { enabled: boolean; locked: boolean }) {
  if (locked) {
    return (
      <span className="badge bg-warning/10 text-warning">
        <Lock className="w-2.5 h-2.5" /> Locked
      </span>
    );
  }
  return (
    <span className={cn("badge", enabled ? "bg-success/10 text-success" : "bg-muted text-muted-foreground")}>
      <span className={cn("w-1.5 h-1.5 rounded-full", enabled ? "bg-success" : "bg-muted-foreground/40")} />
      {enabled ? "Active" : "Disabled"}
    </span>
  );
}

/* ─── Context item ───────────────────────────────────────────── */
function ContextItem({ icon: Icon, label, onClick, destructive = false }: {
  icon: any; label: string; onClick: () => void; destructive?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 w-full px-2.5 py-1.5 rounded-md text-[12px] transition-colors",
        destructive ? "text-destructive hover:bg-destructive/10" : "text-foreground hover:bg-secondary"
      )}
    >
      <Icon className="w-3.5 h-3.5" /> {label}
    </button>
  );
}

function ResetPasswordDialog({
  sam,
  loading,
  onClose,
  onConfirm,
}: {
  sam: string;
  loading?: boolean;
  onClose: () => void;
  onConfirm: (newPassword: string) => Promise<void> | void;
}) {
  const [newPassword, setNewPassword] = useState("");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-[420px] mx-4 bg-card border border-border rounded-xl shadow-2xl animate-[scale-in_0.18s_cubic-bezier(0.16,1,0.3,1)]">
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <div>
            <h2 className="text-[14px] font-bold">Reset Password</h2>
            <p className="text-[11px] text-muted-foreground mt-1">{sam}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
            <span className="text-lg leading-none">&times;</span>
          </button>
        </div>
        <div className="px-5 py-4 space-y-3">
          <div className="space-y-1">
            <label className="text-[10px] font-bold uppercase tracking-[0.07em] text-muted-foreground/60">New Password</label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Enter new password"
              autoComplete="new-password"
              name="users-context-reset-password"
              spellCheck={false}
              autoCorrect="off"
              autoCapitalize="none"
              data-lpignore="true"
              data-1p-ignore="true"
              data-form-type="other"
              className="input-base w-full"
              autoFocus
            />
          </div>
        </div>
        <div className="px-5 py-3.5 border-t border-border flex justify-end gap-2">
          <button onClick={onClose} className="h-8 px-4 rounded-md text-[12px] font-medium text-muted-foreground hover:bg-secondary transition-colors">
            Cancel
          </button>
          <button
            onClick={() => newPassword && onConfirm(newPassword)}
            disabled={loading || !newPassword}
            className="h-8 px-4 rounded-md bg-primary text-primary-foreground text-[12px] font-semibold hover:opacity-90 disabled:opacity-40 transition-opacity"
          >
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Set Password"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Create user dialog ─────────────────────────────────────── */
function CreateUserDialog({ onClose }: { onClose: () => void }) {
  const createUser = useCreateUser();
  const [form, setForm] = useState({
    firstName: "", lastName: "", samAccountName: "", email: "",
    department: "", title: "", userPassword: "", ouPath: "",
  });
  const update = (key: string, val: string) => setForm((f) => ({ ...f, [key]: val }));

  const handleCreate = async () => {
    if (!form.firstName || !form.lastName || !form.samAccountName || !form.userPassword || !form.ouPath) {
      toast.error("Please fill in all required fields");
      return;
    }
    try {
      await createUser.mutateAsync({
        samAccountName: form.samAccountName,
        displayName: `${form.firstName} ${form.lastName}`,
        firstName: form.firstName, lastName: form.lastName,
        email: form.email || undefined,
        department: form.department || undefined,
        title: form.title || undefined,
        userPassword: form.userPassword,
        ouPath: form.ouPath,
      });
      toast.success("User created successfully");
      onClose();
    } catch (e: any) {
      if (isElevationCancelledError(e)) { toast.message("Creation cancelled."); return; }
      toast.error(e?.toString() || "Failed to create user");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-[440px] mx-4 bg-card border border-border rounded-xl shadow-2xl animate-[scale-in_0.18s_cubic-bezier(0.16,1,0.3,1)]">
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <UserPlus className="w-4 h-4 text-primary" />
            <h2 className="text-[14px] font-bold">Create New User</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
            <span className="text-lg leading-none">&times;</span>
          </button>
        </div>
        <div className="px-5 py-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <FormField label="First Name *" value={form.firstName} onChange={(v) => update("firstName", v)} />
            <FormField label="Last Name *"  value={form.lastName}  onChange={(v) => update("lastName", v)} />
          </div>
          <FormField label="Username (SAM) *" value={form.samAccountName} onChange={(v) => update("samAccountName", v)} mono />
          <FormField label="Email" value={form.email} onChange={(v) => update("email", v)} />
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Department" value={form.department} onChange={(v) => update("department", v)} />
            <FormField label="Title"      value={form.title}      onChange={(v) => update("title", v)} />
          </div>
          <FormField label="Password *" value={form.userPassword} onChange={(v) => update("userPassword", v)} type="password" />
          <FormField label="OU Path (DN) *" value={form.ouPath} onChange={(v) => update("ouPath", v)} mono placeholder="OU=Users,DC=contoso,DC=com" />
        </div>
        <div className="px-5 py-3.5 border-t border-border flex justify-end gap-2">
          <button onClick={onClose} className="h-8 px-4 rounded-md text-[12px] font-medium text-muted-foreground hover:bg-secondary transition-colors">
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={createUser.isPending}
            className="h-8 px-4 rounded-md bg-primary text-primary-foreground text-[12px] font-semibold hover:opacity-90 disabled:opacity-40 transition-opacity"
          >
            {createUser.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Create User"}
          </button>
        </div>
      </div>
    </div>
  );
}

function FormField({ label, value, onChange, type = "text", mono = false, placeholder }: {
  label: string; value: string; onChange: (v: string) => void;
  type?: string; mono?: boolean; placeholder?: string;
}) {
  return (
    <div className="space-y-1">
      <label className="text-[10px] font-bold uppercase tracking-[0.07em] text-muted-foreground/60">{label}</label>
      <input
        type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        autoComplete="off"
        spellCheck={false}
        autoCorrect="off"
        autoCapitalize="none"
        data-lpignore="true"
        data-1p-ignore="true"
        data-form-type="other"
        className={cn("input-base w-full", mono && "font-mono")}
      />
    </div>
  );
}
