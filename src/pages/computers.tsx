import { useEffect, useState } from "react";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { cn, formatDate, getOUFromDN, exportToCSV } from "@/lib/utils";
import { useCredentialStore } from "@/stores/credential-store";
import { useComputers, useComputerDetail, useComputerGroups, useToggleComputer, useMoveComputer } from "@/hooks/use-ad-computers";
import { useResizablePercentColumns } from "@/hooks/use-resizable-columns";
import { PaginationBar } from "@/components/shared/pagination-bar";
import { AppContextMenu, ContextMenuItem, getContextMenuPositionForElement } from "@/components/shared/context-menu";
import { formatErrorMessage, notifyActionError } from "@/lib/feedback";
import { MoveToOuDialog } from "@/components/shared/object-action-dialogs";
import { toast } from "sonner";
import {
  Search,
  Download,
  ChevronUp,
  ChevronDown,
  Loader2,
  Monitor,
  Power,
  X,
  Cpu,
  Globe,
  Clock,
  MapPin,
  Shield,
  WifiOff,
  AlertTriangle,
  Copy,
  Check,
  User,
  HardDrive,
  Calendar,
  MoreHorizontal,
  FolderTree,
} from "lucide-react";

type SortKey = "Name" | "Description" | "OperatingSystem" | "LastLogonDate" | "IPv4Address" | "Enabled";

const COMPUTER_COLUMN_DEFAULTS = [30, 24, 18, 10, 10, 8] as const;
const COMPUTER_COLUMN_MINS = [22, 14, 12, 8, 8, 6] as const;

export default function ComputersPage() {
  const isConnected = useCredentialStore((s) => s.isConnected);
  const [search, setSearch]                   = useState("");
  const debouncedSearch = useDebouncedValue(search);
  const [selectedComputer, setSelectedComputer] = useState<string | null>(null);
  const [sortKey, setSortKey]                 = useState<SortKey>("Name");
  const [sortDir, setSortDir]                 = useState<"asc" | "desc">("asc");
  const [page, setPage]                       = useState(1);
  const [pageSize, setPageSize]               = useState(100);
  const [contextMenu, setContextMenu]         = useState<{
    x: number; y: number; name: string; enabled: boolean; dn?: string | null;
  } | null>(null);
  const [moveComputerState, setMoveComputerState] = useState<{ name: string; dn?: string | null } | null>(null);

  const { data, isLoading, isFetching, error } = useComputers({
    search: debouncedSearch || undefined,
    page,
    pageSize,
    sortBy: sortKey,
    sortDir,
  });
  const toggle = useToggleComputer();
  const moveComputer = useMoveComputer();
  const {
    tableRef: computersTableRef,
    widths: computerColumnWidths,
    startResize: startComputerResize,
  } = useResizablePercentColumns(
    "table-widths.computers.v1",
    COMPUTER_COLUMN_DEFAULTS,
    COMPUTER_COLUMN_MINS
  );

  const computers = data?.items ?? [];
  const totalComputers = data?.total ?? 0;
  const pageCount = data?.pageCount ?? 0;
  const shouldAnimateRows = computers.length <= 120;

  const openContextMenu = (
    position: { x: number; y: number },
    payload: { name: string; enabled: boolean; dn?: string | null }
  ) => {
    setContextMenu({
      x: position.x,
      y: position.y,
      ...payload,
    });
  };

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
        <p className="text-sm text-muted-foreground">Connect to Active Directory to manage computers</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <Monitor className="w-4 h-4 text-primary" />
          <h1 className="text-[15px] font-bold tracking-tight">Computers</h1>
          <span className="text-[11px] text-muted-foreground font-mono bg-secondary px-1.5 py-0.5 rounded-md ml-1">
            {totalComputers}
          </span>
          {isFetching && !isLoading && (
            <span className="flex items-center gap-1 rounded-md border border-border bg-secondary px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
              <Loader2 className="w-3 h-3 animate-spin" />
              Updating
            </span>
          )}
        </div>
        <button
          onClick={() => exportToCSV(computers, "ad-computers")}
          className="flex items-center gap-1.5 h-8 px-3 rounded-md border border-border text-[12px] font-medium text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
        >
          <Download className="w-3.5 h-3.5" />
          CSV
        </button>
      </div>

      {/* Search */}
      <div className="px-5 py-2.5 border-b border-border shrink-0 bg-secondary/20">
        <div className="relative max-w-xs">
          <Search className="input-leading-icon absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/55" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name or description..."
            autoComplete="off"
            name="computers-search"
            spellCheck={false}
            autoCorrect="off"
            autoCapitalize="none"
            data-lpignore="true"
            data-1p-ignore="true"
            data-form-type="other"
            className="input-base input-with-leading-icon w-full"
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
              <p className="text-sm font-semibold">Failed to load computers</p>
              <p className="text-xs text-muted-foreground mt-0.5">{formatErrorMessage(error, "Unknown error")}</p>
            </div>
          </div>
        ) : computers.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-muted-foreground">
            <Monitor className="w-8 h-8 opacity-20 mb-2" />
            <p className="text-sm">No computers found</p>
          </div>
        ) : (
          <table ref={computersTableRef} className="data-table data-table-slim">
            <colgroup>
              <col style={{ width: `${computerColumnWidths[0]}%` }} />
              <col style={{ width: `${computerColumnWidths[1]}%` }} />
              <col style={{ width: `${computerColumnWidths[2]}%` }} />
              <col style={{ width: `${computerColumnWidths[3]}%` }} />
              <col style={{ width: `${computerColumnWidths[4]}%` }} />
              <col style={{ width: `${computerColumnWidths[5]}%` }} />
              <col style={{ width: "44px" }} />
            </colgroup>
            <thead className="sticky top-0 z-10">
              <tr className="bg-secondary/40 backdrop-blur-sm border-b border-border">
                {([
                  ["Name",            "Name"],
                  ["Description",     "Description"],
                  ["OperatingSystem", "Operating System"],
                  ["LastLogonDate",   "Last Logon"],
                  ["IPv4Address",     "IP Address"],
                  ["Enabled",         "Status"],
                ] as [SortKey, string][]).map(([key, label], idx) => (
                  <th
                    key={key}
                    onClick={() => handleSort(key)}
                    className={cn(
                      "relative text-left text-[10px] font-bold uppercase tracking-[0.08em] text-muted-foreground/60 py-2.5 cursor-pointer hover:text-muted-foreground transition-colors select-none whitespace-nowrap",
                      key === "Description"
                        ? "pl-2 pr-3"
                        : key === "OperatingSystem"
                        ? "pl-5 pr-4"
                        : "px-4"
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
                        onMouseDown={(e) => startComputerResize(idx, e)}
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
              {computers.map((comp: any, i: number) => {
                const fallbackOu = getOUFromDN(comp.DistinguishedName);
                const description = typeof comp.Description === "string" ? comp.Description.trim() : "";
                const subtext = fallbackOu || "—";
                return (
                  <tr
                    key={comp.Name || i}
                    onClick={() => setSelectedComputer(comp.Name)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                      openContextMenu(
                        { x: e.clientX, y: e.clientY },
                        {
                          name: comp.Name,
                          enabled: comp.Enabled,
                          dn: comp.DistinguishedName,
                        }
                      );
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "ContextMenu" || (e.shiftKey && e.key === "F10")) {
                        e.preventDefault();
                        openContextMenu(
                          getContextMenuPositionForElement(e.currentTarget),
                          {
                            name: comp.Name,
                            enabled: comp.Enabled,
                            dn: comp.DistinguishedName,
                          }
                        );
                      }
                    }}
                    className={cn(
                      "table-row-hover border-b border-border/40 hover:bg-secondary/25 cursor-pointer",
                      shouldAnimateRows && "table-row-animate"
                    )}
                    tabIndex={0}
                    style={shouldAnimateRows ? { animationDelay: `${Math.min(i * 12, 250)}ms` } : undefined}
                  >
                    <td className="px-4">
                      <div className="flex items-center gap-2.5">
                        <div className={cn(
                          "flex items-center justify-center w-7 h-7 rounded-lg shrink-0",
                          comp.Enabled ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground/50"
                        )}>
                          <Monitor className="w-3.5 h-3.5" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-[13px] font-medium font-mono leading-tight truncate">{comp.Name}</p>
                          <p className="text-[10px] text-muted-foreground leading-tight truncate" title={subtext}>
                            {subtext}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="pl-2 pr-3">
                      <span className="text-[12px] text-muted-foreground whitespace-nowrap truncate block" title={description || "—"}>
                        {description || "—"}
                      </span>
                    </td>
                    <td className="pl-5 pr-4">
                      <span className="text-[12px] text-muted-foreground whitespace-nowrap truncate block">{comp.OperatingSystem || "—"}</span>
                    </td>
                    <td className="px-4">
                      <span className="text-[11px] font-mono text-muted-foreground whitespace-nowrap">{formatDate(comp.LastLogonDate)}</span>
                    </td>
                    <td className="px-4">
                      <span className="text-[12px] font-mono text-muted-foreground whitespace-nowrap truncate block">{comp.IPv4Address || "—"}</span>
                    </td>
                    <td className="px-4">
                      <span className={cn(
                        "badge",
                        comp.Enabled ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"
                      )}>
                        <span className={cn("w-1.5 h-1.5 rounded-full", comp.Enabled ? "bg-success" : "bg-muted-foreground/40")} />
                        {comp.Enabled ? "Active" : "Disabled"}
                      </span>
                    </td>
                    <td className="px-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          openContextMenu(
                            { x: e.clientX, y: e.clientY },
                            {
                              name: comp.Name,
                              enabled: comp.Enabled,
                              dn: comp.DistinguishedName,
                            }
                          );
                        }}
                        aria-label={`Open actions for ${comp.Name}`}
                        className="p-1 rounded text-muted-foreground/30 hover:text-muted-foreground hover:bg-secondary transition-colors"
                      >
                        <MoreHorizontal className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <PaginationBar
        page={page}
        pageCount={pageCount}
        pageSize={pageSize}
        total={totalComputers}
        loading={isLoading}
        onPageChange={setPage}
        onPageSizeChange={setPageSize}
        itemLabel="computers"
      />

      {selectedComputer && (
        <ComputerDetailSheet name={selectedComputer} onClose={() => setSelectedComputer(null)} />
      )}
      {contextMenu && (
        <AppContextMenu position={contextMenu} onClose={() => setContextMenu(null)}>
            <ContextMenuItem
              icon={Monitor}
              label="View Details"
              onClick={() => {
                setSelectedComputer(contextMenu.name);
                setContextMenu(null);
              }}
            />
            <ContextMenuItem
              icon={Power}
              label={contextMenu.enabled ? "Disable Computer" : "Enable Computer"}
              destructive={contextMenu.enabled}
              onClick={async () => {
                try {
                  await toggle.mutateAsync({ name: contextMenu.name, enable: !contextMenu.enabled });
                  toast.success(contextMenu.enabled ? "Computer disabled" : "Computer enabled");
                } catch (error: unknown) {
                  notifyActionError(error, {
                    fallback: "Failed to update computer",
                    cancelled: "Computer update cancelled",
                  });
                } finally {
                  setContextMenu(null);
                }
              }}
            />
            <ContextMenuItem
              icon={FolderTree}
              label="Move"
              onClick={() => {
                setMoveComputerState({ name: contextMenu.name, dn: contextMenu.dn });
                setContextMenu(null);
              }}
            />
        </AppContextMenu>
      )}
      {moveComputerState && (
        <MoveToOuDialog
          objectLabel={moveComputerState.name}
          currentDn={moveComputerState.dn}
          loading={moveComputer.isPending}
          onClose={() => setMoveComputerState(null)}
          onConfirm={async (targetOu) => {
            try {
              await moveComputer.mutateAsync({ name: moveComputerState.name, targetOu });
              toast.success("Computer moved successfully");
              setMoveComputerState(null);
            } catch (error: unknown) {
              notifyActionError(error, {
                fallback: "Failed to move computer",
                cancelled: "Move cancelled",
              });
            }
          }}
        />
      )}
    </div>
  );
}

/* ─── Computer detail sheet ──────────────────────────────────── */
function ComputerDetailSheet({ name, onClose }: { name: string; onClose: () => void }) {
  const { data, isLoading, error } = useComputerDetail(name);
  const toggle = useToggleComputer();
  const [tab, setTab] = useState<"details" | "groups" | "attributes">("details");
  const groupsQuery = useComputerGroups(name, tab === "groups");
  const comp   = data?.computer;
  const groups = normalizeComputerGroups(groupsQuery.data, data);
  const attributes = getPopulatedComputerAttributes(comp);

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px] sheet-overlay" onClick={onClose} />
      <div className="fixed right-0 top-0 bottom-0 z-50 w-full max-w-[480px] bg-card border-l border-border shadow-2xl animate-[slide-in-right_0.28s_cubic-bezier(0.16,1,0.3,1)] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 h-14 border-b border-border shrink-0">
          <div className="flex items-center gap-3">
            <div className={cn(
              "flex items-center justify-center w-9 h-9 rounded-lg shrink-0",
              comp?.Enabled ? "bg-primary/10" : "bg-muted"
            )}>
              <Monitor className={cn("w-4 h-4", comp?.Enabled ? "text-primary" : "text-muted-foreground/60")} />
            </div>
            <div>
              <p className="text-[13px] font-bold font-mono">{name}</p>
              <p className="text-[11px] text-muted-foreground">{comp?.OperatingSystem || "Computer"}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Status + actions */}
        {comp && (
          <div className="px-5 py-2.5 border-b border-border flex items-center gap-2 shrink-0 bg-secondary/20">
            <span className={cn(
              "badge uppercase tracking-wider",
              comp.Enabled ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"
            )}>
              <span className={cn("w-1.5 h-1.5 rounded-full", comp.Enabled ? "bg-success" : "bg-destructive")} />
              {comp.Enabled ? "Active" : "Disabled"}
            </span>
            <div className="flex-1" />
            <button
              onClick={async () => {
                try {
                  await toggle.mutateAsync({ name, enable: !comp.Enabled });
                  toast.success(comp.Enabled ? "Computer disabled" : "Computer enabled");
                } catch (error: unknown) {
                  notifyActionError(error, {
                    fallback: "Failed to update computer",
                    cancelled: "Computer update cancelled",
                  });
                }
              }}
              disabled={toggle.isPending}
              className={cn(
                "flex items-center gap-1.5 h-7 px-2.5 rounded-md text-[11px] font-semibold transition-colors",
                comp.Enabled
                  ? "bg-destructive/10 text-destructive hover:bg-destructive/20"
                  : "bg-success/10 text-success hover:bg-success/20"
              )}
            >
              <Power className="w-3 h-3" />
              {comp.Enabled ? "Disable" : "Enable"}
            </button>
          </div>
        )}

        {/* Tabs */}
        <div className="flex px-5 gap-4 border-b border-border shrink-0">
          {(["details", "groups", "attributes"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                "text-[12px] font-semibold py-3 border-b-2 transition-colors capitalize",
                tab === t
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              {t === "groups"
                ? `Groups (${groups.length})`
                : t === "attributes"
                ? `Attributes (${attributes.length})`
                : t}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto">
          {isLoading ? (
            <div className="flex items-center justify-center h-40">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : error ? (
            <div className="p-5">
              <div className="rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3">
                <p className="text-sm font-semibold text-destructive">Failed to load computer details</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {formatErrorMessage(error, "Unknown error")}
                </p>
              </div>
            </div>
          ) : tab === "details" ? (
            <div className="p-5 space-y-5">
              <DetailSection title="System">
                <DetailRow icon={Cpu}       label="OS"            value={comp?.OperatingSystem} />
                <DetailRow                  label="Version"       value={comp?.OperatingSystemVersion} />
                <DetailRow                  label="Service Pack"  value={comp?.OperatingSystemServicePack} />
                <DetailRow icon={Globe}     label="DNS Host Name" value={comp?.DNSHostName} mono />
                <DetailRow                  label="IP Address"    value={comp?.IPv4Address} mono />
              </DetailSection>
              <DetailSection title="Directory">
                <DetailRow icon={Clock}     label="Last Logon"  value={formatDate(comp?.LastLogonDate)} />
                <DetailRow icon={Calendar}  label="Created"     value={formatDate(comp?.WhenCreated)} />
                <DetailRow icon={Calendar}  label="Modified"    value={formatDate(comp?.WhenChanged)} />
                <DetailRow icon={MapPin}    label="Location"    value={comp?.Location} />
                <DetailRow icon={User}      label="Managed By"  value={comp?.ManagedBy ? comp.ManagedBy.split(",")[0]?.replace("CN=", "") : null} />
                <DetailRow                  label="Description" value={comp?.Description} />
                <DetailRow                  label="OU"          value={getOUFromDN(comp?.DistinguishedName)} />
                <CopyField                  label="DN"          value={comp?.DistinguishedName} />
              </DetailSection>
              {comp?.ServicePrincipalNames && comp.ServicePrincipalNames.length > 0 && (
                <DetailSection title={`SPNs (${comp.ServicePrincipalNames.length})`}>
                  {(Array.isArray(comp.ServicePrincipalNames) ? comp.ServicePrincipalNames : [comp.ServicePrincipalNames]).map((spn: string, idx: number) => (
                    <div key={idx} className="flex items-center gap-2 py-1 px-2 rounded-md hover:bg-secondary/30">
                      <HardDrive className="w-3 h-3 text-muted-foreground/30 shrink-0" />
                      <span className="text-[11px] font-mono text-muted-foreground truncate">{spn}</span>
                    </div>
                  ))}
                </DetailSection>
              )}
            </div>
          ) : tab === "groups" ? (
            <div className="p-5 space-y-1">
              {groupsQuery.isLoading && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border/70 bg-secondary/20 text-[11px] text-muted-foreground">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Loading group details...
                </div>
              )}
              {groups.length === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">No group memberships</p>
              ) : (
                groups.map((group) => (
                  <div
                    key={group.DistinguishedName || group.SamAccountName || group.Name}
                    className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-secondary/50 transition-colors"
                  >
                    <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-primary/10 shrink-0">
                      <Shield className="w-3.5 h-3.5 text-primary" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-medium truncate">{group.Name}</p>
                      <p className="text-[11px] text-muted-foreground font-mono truncate">
                        {[group.GroupCategory, group.GroupScope].filter(Boolean).join(" · ") || group.DistinguishedName || "Group membership"}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
          ) : (
            <ComputerAttributeViewer attributes={attributes} />
          )}
        </div>
      </div>
    </>
  );
}

type DirectoryGroup = {
  Name: string;
  SamAccountName?: string | null;
  GroupCategory?: string | null;
  GroupScope?: string | null;
  DistinguishedName?: string | null;
};

type ComputerAttribute = {
  key: string;
  label: string;
  value: string;
};

function normalizeComputerGroups(groupData: unknown, detailData?: any): DirectoryGroup[] {
  const directGroups: unknown[] = Array.isArray(groupData)
    ? groupData
    : groupData
    ? [groupData]
    : [];
  const memberOf: unknown[] = Array.isArray(detailData?.computer?.MemberOf)
    ? detailData.computer.MemberOf
    : detailData?.computer?.MemberOf
    ? [detailData.computer.MemberOf]
    : [];
  const rawGroups: unknown[] = directGroups.length > 0 ? directGroups : memberOf;

  return rawGroups
    .map((group: unknown): DirectoryGroup | null => {
      if (!group) return null;
      if (typeof group === "string") {
        return {
          Name: getNameFromDn(group),
          DistinguishedName: group,
        };
      }

      const groupRecord = group as Record<string, unknown>;
      const name = String(groupRecord.Name || groupRecord.SamAccountName || groupRecord.DistinguishedName || "").trim();
      if (!name) return null;

      return {
        Name: name,
        SamAccountName: typeof groupRecord.SamAccountName === "string" ? groupRecord.SamAccountName : null,
        GroupCategory: typeof groupRecord.GroupCategory === "string" ? groupRecord.GroupCategory : null,
        GroupScope: typeof groupRecord.GroupScope === "string" ? groupRecord.GroupScope : null,
        DistinguishedName: typeof groupRecord.DistinguishedName === "string" ? groupRecord.DistinguishedName : null,
      };
    })
    .filter((group: DirectoryGroup | null): group is DirectoryGroup => !!group)
    .sort((left: DirectoryGroup, right: DirectoryGroup) => left.Name.localeCompare(right.Name, undefined, { numeric: true }));
}

function getPopulatedComputerAttributes(computer: Record<string, unknown> | null | undefined): ComputerAttribute[] {
  if (!computer || typeof computer !== "object") return [];

  const preferredOrder = [
    "Name",
    "DNSHostName",
    "Enabled",
    "OperatingSystem",
    "OperatingSystemVersion",
    "OperatingSystemServicePack",
    "IPv4Address",
    "LastLogonDate",
    "WhenCreated",
    "WhenChanged",
    "Description",
    "Location",
    "ManagedBy",
    "DistinguishedName",
    "ServicePrincipalNames",
    "MemberOf",
  ];
  const orderMap = new Map(preferredOrder.map((key, index) => [key, index]));

  return Object.entries(computer)
    .map(([key, value]) => {
      const serialized = serializeAttributeValue(value);
      if (!serialized) return null;
      return {
        key,
        label: formatAttributeLabel(key),
        value: serialized,
      };
    })
    .filter((attribute): attribute is ComputerAttribute => !!attribute)
    .sort((left, right) => {
      const leftOrder = orderMap.get(left.key) ?? Number.MAX_SAFE_INTEGER;
      const rightOrder = orderMap.get(right.key) ?? Number.MAX_SAFE_INTEGER;
      if (leftOrder !== rightOrder) return leftOrder - rightOrder;
      return left.label.localeCompare(right.label);
    });
}

function serializeAttributeValue(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : null;
  if (typeof value === "boolean") return value ? "True" : "False";
  if (Array.isArray(value)) {
    const values = value
      .map((entry) => serializeAttributeValue(entry))
      .filter((entry): entry is string => !!entry);
    return values.length > 0 ? values.join("\n") : null;
  }
  if (typeof value === "object") {
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

function getNameFromDn(dn: string) {
  const firstPart = dn.split(",")[0]?.trim() || dn;
  return firstPart.startsWith("CN=") ? firstPart.slice(3) : firstPart;
}

function formatAttributeLabel(key: string) {
  return key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .trim();
}

function DetailSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-[10px] font-bold uppercase tracking-[0.09em] text-muted-foreground/50 mb-2 flex items-center gap-2">
        {title}
        <span className="flex-1 h-px bg-border" />
      </h3>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

function DetailRow({ icon: Icon, label, value, mono = false }: {
  icon?: any; label: string; value?: string | null; mono?: boolean;
}) {
  if (!value) return null;
  return (
    <div className="grid grid-cols-[14px_96px_minmax(0,1fr)] items-center gap-2 py-1.5 px-2 rounded-md hover:bg-secondary/30 transition-colors">
      {Icon ? (
        <Icon className="w-3.5 h-3.5 text-muted-foreground/40 shrink-0" />
      ) : (
        <span className="w-3.5 h-3.5 shrink-0" />
      )}
      <span className="text-[11px] text-muted-foreground truncate">{label}</span>
      <span className={cn("text-[13px] truncate", mono && "font-mono text-[12px]")}>{value}</span>
    </div>
  );
}

function CopyField({ label, value }: { label: string; value?: string }) {
  const [copied, setCopied] = useState(false);
  if (!value) return null;
  return (
    <div className="grid grid-cols-[14px_96px_minmax(0,1fr)_auto] items-center gap-2 py-1.5 px-2 rounded-md hover:bg-secondary/30 transition-colors group">
      <span className="w-3.5 h-3.5 shrink-0" />
      <span className="text-[11px] text-muted-foreground truncate">{label}</span>
      <span className="text-[11px] font-mono truncate text-muted-foreground">{value}</span>
      <CopyButton value={value} copied={copied} setCopied={setCopied} className="opacity-0 group-hover:opacity-100" />
    </div>
  );
}

function ComputerAttributeViewer({ attributes }: { attributes: ComputerAttribute[] }) {
  const [copiedAll, setCopiedAll] = useState(false);
  const copyAllValue = attributes.map((attribute) => `${attribute.label}: ${attribute.value}`).join("\n\n");

  return (
    <div className="p-5 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[12px] font-semibold">Read-only attribute viewer</p>
          <p className="text-[11px] text-muted-foreground">Only populated fields are shown. Each value can be copied directly.</p>
        </div>
        {attributes.length > 0 && (
          <CopyButton value={copyAllValue} copied={copiedAll} setCopied={setCopiedAll} label="Copy all" />
        )}
      </div>

      {attributes.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center">No populated attributes</p>
      ) : (
        <div className="space-y-2">
          {attributes.map((attribute) => (
            <ComputerAttributeRow key={attribute.key} attribute={attribute} />
          ))}
        </div>
      )}
    </div>
  );
}

function ComputerAttributeRow({ attribute }: { attribute: ComputerAttribute }) {
  const [copied, setCopied] = useState(false);

  return (
    <div className="rounded-lg border border-border/70 bg-secondary/20 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold text-muted-foreground">{attribute.label}</p>
          <pre className="mt-1 whitespace-pre-wrap break-all text-[12px] leading-5 text-foreground font-mono bg-card rounded-md border border-border/60 px-3 py-2 overflow-x-auto">
            {attribute.value}
          </pre>
        </div>
        <CopyButton value={attribute.value} copied={copied} setCopied={setCopied} />
      </div>
    </div>
  );
}

function CopyButton({
  value,
  copied,
  setCopied,
  label,
  className,
}: {
  value: string;
  copied: boolean;
  setCopied: (value: boolean) => void;
  label?: string;
  className?: string;
}) {
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className={cn(
        "inline-flex items-center gap-1.5 p-1.5 rounded text-muted-foreground hover:text-primary hover:bg-secondary transition-all shrink-0",
        className
      )}
    >
      {copied ? <Check className="w-3 h-3 text-success" /> : <Copy className="w-3 h-3" />}
      {label && <span className="text-[11px] font-medium">{copied ? "Copied" : label}</span>}
    </button>
  );
}
