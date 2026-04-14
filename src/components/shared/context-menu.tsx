import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

type ContextMenuPosition = {
  x: number;
  y: number;
};

export function getContextMenuPositionForElement(element: HTMLElement) {
  const rect = element.getBoundingClientRect();
  return {
    x: rect.left + Math.min(rect.width / 2, 120),
    y: rect.top + Math.min(rect.height / 2, 24),
  };
}

interface AppContextMenuProps {
  position: ContextMenuPosition | null;
  onClose: () => void;
  children: ReactNode;
  className?: string;
}

export function AppContextMenu({
  position,
  onClose,
  children,
  className,
}: AppContextMenuProps) {
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [resolvedPosition, setResolvedPosition] = useState<ContextMenuPosition | null>(null);

  useLayoutEffect(() => {
    if (!position || !menuRef.current) {
      setResolvedPosition(null);
      return;
    }

    const margin = 8;
    const rect = menuRef.current.getBoundingClientRect();
    const maxLeft = Math.max(margin, window.innerWidth - rect.width - margin);
    const maxTop = Math.max(margin, window.innerHeight - rect.height - margin);

    setResolvedPosition({
      x: Math.min(Math.max(position.x, margin), maxLeft),
      y: Math.min(Math.max(position.y, margin), maxTop),
    });
  }, [position, children]);

  useEffect(() => {
    if (!position) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("resize", onClose);
    window.addEventListener("scroll", onClose, true);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", onClose);
      window.removeEventListener("scroll", onClose, true);
    };
  }, [position, onClose]);

  if (!position) return null;

  return (
    <>
      <div className="fixed inset-0 z-50" onClick={onClose} />
      <div
        ref={menuRef}
        role="menu"
        className={cn(
          "fixed z-50 min-w-[180px] rounded-xl border border-border/80 bg-popover p-1.5 shadow-2xl ring-1 ring-black/5 animate-[scale-in_0.12s_ease-out]",
          className
        )}
        style={{
          left: resolvedPosition?.x ?? position.x,
          top: resolvedPosition?.y ?? position.y,
          visibility: resolvedPosition ? "visible" : "hidden",
        }}
      >
        {children}
      </div>
    </>
  );
}

interface ContextMenuItemProps {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
  destructive?: boolean;
}

export function ContextMenuItem({
  icon: Icon,
  label,
  onClick,
  destructive = false,
}: ContextMenuItemProps) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[12px] font-medium transition-colors",
        destructive
          ? "text-destructive hover:bg-destructive/10"
          : "text-foreground hover:bg-secondary"
      )}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" />
      <span className="truncate">{label}</span>
    </button>
  );
}
