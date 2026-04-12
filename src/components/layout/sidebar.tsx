import { useState } from "react";
import { NavLink } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useCredentialStore } from "@/stores/credential-store";
import {
  LayoutDashboard,
  Users,
  Monitor,
  ShieldCheck,
  FileBarChart,
  FolderTree,
  PanelLeftClose,
  PanelLeftOpen,
  TreePine,
  Settings,
} from "lucide-react";

const navItems = [
  { to: "/",          icon: LayoutDashboard, label: "Dashboard",  end: true },
  { to: "/users",     icon: Users,           label: "Users" },
  { to: "/computers", icon: Monitor,         label: "Computers" },
  { to: "/groups",    icon: ShieldCheck,     label: "Groups" },
  { to: "/directory", icon: FolderTree,      label: "Directory" },
  { to: "/reports",   icon: FileBarChart,    label: "Reports" },
];

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  onTitleBarMouseDown?: (event: React.MouseEvent<HTMLDivElement>) => void;
}

export function Sidebar({ collapsed, onToggle, onTitleBarMouseDown }: SidebarProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [settingsHovered, setSettingsHovered] = useState(false);
  const connectionInfo = useCredentialStore((s) => s.connectionInfo);
  const isConnected    = useCredentialStore((s) => s.isConnected);

  return (
    <aside
      className={cn(
        "relative flex flex-col h-full bg-sidebar border-r border-sidebar-border transition-all duration-300 ease-[cubic-bezier(0.25,0.1,0.25,1)] overflow-hidden",
        collapsed ? "w-[52px]" : "w-[216px]"
      )}
    >
      {/* Dot-grid texture */}
      <div className="pointer-events-none absolute inset-0 dot-grid opacity-40" />

      {/* Logo */}
      <div
        className="relative flex items-center h-[52px] px-3 border-b border-sidebar-border shrink-0"
        onMouseDown={onTitleBarMouseDown}
      >
        <div className="flex items-center gap-2.5 overflow-hidden min-w-0">
          {/* Logo mark */}
          <div className="relative flex items-center justify-center w-7 h-7 shrink-0">
            <div className="absolute inset-0 rounded-lg bg-primary/20" />
            <div className="absolute inset-0.5 rounded-md bg-primary/10" />
            <TreePine className="relative w-3.5 h-3.5 text-primary" />
          </div>

          <div
            className={cn(
              "flex flex-col overflow-hidden transition-all duration-300",
              collapsed ? "opacity-0 w-0" : "opacity-100"
            )}
          >
            <span className="text-[13px] font-bold tracking-tight text-sidebar-foreground whitespace-nowrap leading-tight">
              Canopy
            </span>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="relative flex-1 flex flex-col gap-0.5 px-2 py-3 overflow-hidden">
        {!collapsed && (
          <span className="text-[9px] font-bold uppercase tracking-[0.12em] text-sidebar-muted px-2 mb-2 block">
            Navigate
          </span>
        )}

        {navItems.map((item, i) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            onMouseEnter={() => setHoveredIndex(i)}
            onMouseLeave={() => setHoveredIndex(null)}
            title={collapsed ? item.label : undefined}
            className={({ isActive }) =>
              cn(
                "group relative flex items-center gap-2.5 h-8 rounded-md px-2 text-[13px] font-medium transition-all duration-150",
                isActive
                  ? "text-sidebar-active bg-primary/10"
                  : cn(
                      "text-sidebar-muted hover:text-sidebar-foreground",
                      hoveredIndex === i && "bg-white/[0.04]"
                    )
              )
            }
          >
            {({ isActive }) => (
              <>
                {/* Active indicator */}
                {isActive && (
                  <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[2.5px] h-5 bg-primary rounded-r-full shadow-[0_0_6px_hsl(38_92%_54%/0.6)]" />
                )}

                <item.icon
                  className={cn(
                    "w-4 h-4 shrink-0 transition-colors duration-150",
                    isActive
                      ? "text-primary"
                      : "text-sidebar-muted group-hover:text-sidebar-foreground"
                  )}
                />

                <span
                  className={cn(
                    "whitespace-nowrap transition-all duration-300",
                    collapsed ? "opacity-0 w-0 overflow-hidden" : "opacity-100"
                  )}
                >
                  {item.label}
                </span>

                {/* Tooltip for collapsed */}
                {collapsed && hoveredIndex === i && (
                  <span className="absolute left-full ml-2.5 z-50 px-2.5 py-1.5 rounded-md bg-popover border border-border text-[12px] font-medium text-foreground whitespace-nowrap shadow-xl pointer-events-none">
                    {item.label}
                  </span>
                )}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Domain info */}
      {!collapsed && isConnected && connectionInfo && (
        <div className="relative px-3 py-2.5 border-t border-sidebar-border mx-0 shrink-0">
          <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-sidebar-muted mb-1">
            Connected to
          </p>
          <p className="text-[11px] font-medium text-sidebar-foreground font-mono truncate">
            {connectionInfo.domainName}
          </p>
          <p className="text-[10px] text-sidebar-muted font-mono truncate">
            {connectionInfo.connectedAs}
          </p>
        </div>
      )}

      {/* Settings + Collapse */}
      <div className="relative px-2 pb-3 shrink-0 space-y-0.5">
        <NavLink
          to="/settings"
          onMouseEnter={() => setSettingsHovered(true)}
          onMouseLeave={() => setSettingsHovered(false)}
          title={collapsed ? "Settings" : undefined}
          className={({ isActive }) =>
            cn(
              "group relative flex items-center gap-2.5 h-8 rounded-md px-2 text-[13px] font-medium transition-all duration-150",
              isActive
                ? "text-sidebar-active bg-primary/10"
                : cn(
                    "text-sidebar-muted hover:text-sidebar-foreground",
                    settingsHovered && "bg-white/[0.04]"
                  )
            )
          }
        >
          {({ isActive }) => (
            <>
              {isActive && (
                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[2.5px] h-5 bg-primary rounded-r-full shadow-[0_0_6px_hsl(38_92%_54%/0.6)]" />
              )}
              <Settings
                className={cn(
                  "w-4 h-4 shrink-0 transition-colors duration-150",
                  isActive
                    ? "text-primary"
                    : "text-sidebar-muted group-hover:text-sidebar-foreground"
                )}
              />
              <span
                className={cn(
                  "whitespace-nowrap transition-all duration-300",
                  collapsed ? "opacity-0 w-0 overflow-hidden" : "opacity-100"
                )}
              >
                Settings
              </span>
              {collapsed && settingsHovered && (
                <span className="absolute left-full ml-2.5 z-50 px-2.5 py-1.5 rounded-md bg-popover border border-border text-[12px] font-medium text-foreground whitespace-nowrap shadow-xl pointer-events-none">
                  Settings
                </span>
              )}
            </>
          )}
        </NavLink>
        <button
          onClick={onToggle}
          className="flex items-center justify-center w-full h-8 rounded-md text-sidebar-muted hover:text-sidebar-foreground hover:bg-white/[0.04] transition-colors"
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? (
            <PanelLeftOpen className="w-3.5 h-3.5" />
          ) : (
            <PanelLeftClose className="w-3.5 h-3.5" />
          )}
        </button>
      </div>
    </aside>
  );
}
