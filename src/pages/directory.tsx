import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { useCredentialStore } from "@/stores/credential-store";
import { useOuTree, useOuContents } from "@/hooks/use-ad-directory";
import { buildOuTree, type OuTreeNode } from "@/lib/ou-tree";
import {
  FolderOpen,
  FolderClosed,
  ChevronRight,
  User,
  HardDrive,
  ShieldCheck,
  Loader2,
  WifiOff,
  AlertTriangle,
} from "lucide-react";

export default function DirectoryPage() {
  const isConnected = useCredentialStore((s) => s.isConnected);
  const { data: flatOus, isLoading: treeLoading, error: treeError } = useOuTree();
  const [selectedOu, setSelectedOu] = useState<string | null>(null);
  const [selectedOuName, setSelectedOuName] = useState<string>("");
  const { data: contents, isLoading: contentsLoading } = useOuContents(selectedOu);

  if (!isConnected) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-5">
        <div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-secondary border border-border">
          <WifiOff className="w-7 h-7 text-muted-foreground/40" />
        </div>
        <div className="text-center space-y-1">
          <p className="text-base font-semibold text-foreground">Not Connected</p>
          <p className="text-sm text-muted-foreground">
            Connect to Active Directory to browse the directory
          </p>
        </div>
      </div>
    );
  }

  const tree = useMemo(() => (flatOus ? buildOuTree(flatOus) : []), [flatOus]);

  return (
    <div className="flex h-full animate-[fade-in_0.35s_ease-out]">
      {/* Left: OU tree */}
      <div className="w-[280px] shrink-0 border-r border-border flex flex-col overflow-hidden">
        <div className="px-4 py-3 border-b border-border shrink-0">
          <h2 className="text-[13px] font-semibold">Organizational Units</h2>
        </div>
        <div className="flex-1 overflow-auto px-2 py-2">
          {treeLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : treeError ? (
            <div className="flex items-center gap-2 p-3 text-sm text-destructive">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span className="text-[12px]">Failed to load OU tree</span>
            </div>
          ) : tree.length === 0 ? (
            <p className="text-[12px] text-muted-foreground p-3">No organizational units found</p>
          ) : (
            tree.map((node) => (
              <OuTreeItem
                key={node.dn}
                node={node}
                depth={0}
                selectedDn={selectedOu}
                onSelect={(dn, name) => { setSelectedOu(dn); setSelectedOuName(name); }}
              />
            ))
          )}
        </div>
      </div>

      {/* Right: contents */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <div className="px-4 py-3 border-b border-border shrink-0">
          <h2 className="text-[13px] font-semibold">
            {selectedOu ? selectedOuName : "Select an OU"}
          </h2>
          {selectedOu && (
            <p className="text-[10px] text-muted-foreground font-mono mt-0.5 truncate">
              {selectedOu}
            </p>
          )}
        </div>

        <div className="flex-1 overflow-auto">
          {!selectedOu ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
              <FolderOpen className="w-10 h-10 opacity-20" />
              <p className="text-sm">Select an OU from the tree to view its contents</p>
            </div>
          ) : contentsLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : !contents || contents.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
              <FolderOpen className="w-8 h-8 opacity-20" />
              <p className="text-sm">This OU is empty</p>
            </div>
          ) : (
            <table className="data-table data-table-slim">
              <colgroup>
                <col style={{ width: "14%" }} />
                <col style={{ width: "36%" }} />
                <col style={{ width: "30%" }} />
                <col style={{ width: "20%" }} />
              </colgroup>
              <thead>
                <tr className="border-b border-border text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  <th className="text-left px-4 py-2">Type</th>
                  <th className="text-left px-4 py-2">Name</th>
                  <th className="text-left px-4 py-2">SAM Account</th>
                  <th className="text-left px-4 py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {contents.map((item: any, i: number) => (
                  <tr
                    key={i}
                    className="border-b border-border/50 hover:bg-secondary/40 transition-colors"
                  >
                    <td className="px-4">
                      <TypeBadge type={item.type} />
                    </td>
                    <td className="px-4 text-[12px] font-medium truncate">{item.name}</td>
                    <td className="px-4 text-[12px] font-mono text-muted-foreground whitespace-nowrap truncate">{item.sam}</td>
                    <td className="px-4">
                      <span
                        className={cn(
                          "inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold",
                          item.enabled
                            ? "bg-success/10 text-success"
                            : "bg-muted text-muted-foreground"
                        )}
                      >
                        {item.enabled ? "Enabled" : "Disabled"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── OU Tree Item ────────────────────────────────────────────── */
function OuTreeItem({
  node,
  depth,
  selectedDn,
  onSelect,
}: {
  node: OuTreeNode;
  depth: number;
  selectedDn: string | null;
  onSelect: (dn: string, name: string) => void;
}) {
  const [expanded, setExpanded] = useState(depth < 1);
  const isSelected = selectedDn === node.dn;
  const hasChildren = node.children.length > 0;

  return (
    <div>
      <button
        onClick={() => {
          onSelect(node.dn, node.name);
          if (hasChildren) setExpanded(!expanded);
        }}
        className={cn(
          "flex items-center gap-1.5 w-full h-7 rounded-md px-2 text-[12px] transition-colors",
          isSelected
            ? "bg-primary/10 text-primary font-semibold"
            : "text-foreground hover:bg-secondary/60"
        )}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
      >
        {hasChildren ? (
          <ChevronRight
            className={cn(
              "w-3 h-3 shrink-0 transition-transform duration-150",
              expanded && "rotate-90"
            )}
          />
        ) : (
          <span className="w-3 shrink-0" />
        )}
        {expanded ? (
          <FolderOpen className="w-3.5 h-3.5 shrink-0 text-warning" />
        ) : (
          <FolderClosed className="w-3.5 h-3.5 shrink-0 text-warning" />
        )}
        <span className="truncate">{node.name}</span>
      </button>

      {expanded && hasChildren && (
        <div>
          {node.children.map((child) => (
            <OuTreeItem
              key={child.dn}
              node={child}
              depth={depth + 1}
              selectedDn={selectedDn}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Type badge ──────────────────────────────────────────────── */
function TypeBadge({ type }: { type: string }) {
  const config = {
    user: { icon: User, label: "User", cls: "bg-primary/10 text-primary" },
    computer: { icon: HardDrive, label: "Computer", cls: "bg-warning/10 text-warning" },
    group: { icon: ShieldCheck, label: "Group", cls: "bg-blue-500/10 text-blue-500" },
  }[type] ?? { icon: FolderOpen, label: type, cls: "bg-muted text-muted-foreground" };

  const Icon = config.icon;
  return (
    <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold", config.cls)}>
      <Icon className="w-3 h-3" />
      {config.label}
    </span>
  );
}
