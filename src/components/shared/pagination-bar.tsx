import { cn } from "@/lib/utils";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface PaginationBarProps {
  page: number;
  pageCount: number;
  pageSize: number;
  total: number;
  loading?: boolean;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  itemLabel: string;
}

const PAGE_SIZE_OPTIONS = [50, 100, 200];

export function PaginationBar({
  page,
  pageCount,
  pageSize,
  total,
  loading = false,
  onPageChange,
  onPageSizeChange,
  itemLabel,
}: PaginationBarProps) {
  const safePage = Math.max(page, 1);
  const from = total === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const to = total === 0 ? 0 : Math.min(safePage * pageSize, total);
  const hasPages = pageCount > 0;

  return (
    <div className="flex items-center justify-between gap-3 px-5 py-3 border-t border-border bg-secondary/20 shrink-0">
      <div className="text-[11px] text-muted-foreground font-mono">
        {total === 0 ? `0 ${itemLabel}` : `${from}-${to} of ${total} ${itemLabel}`}
      </div>

      <div className="flex items-center gap-2">
        <select
          value={pageSize}
          onChange={(e) => onPageSizeChange(Number(e.target.value))}
          disabled={loading}
          className="h-8 rounded-md border border-border bg-background px-2 text-[12px] text-muted-foreground"
          aria-label={`Page size for ${itemLabel}`}
        >
          {PAGE_SIZE_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option}/page
            </option>
          ))}
        </select>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onPageChange(safePage - 1)}
            disabled={loading || safePage <= 1 || !hasPages}
            className={cn(
              "flex items-center gap-1 h-8 px-3 rounded-md border border-border text-[12px] font-medium transition-colors",
              "text-muted-foreground hover:text-foreground hover:bg-secondary disabled:opacity-40"
            )}
          >
            <ChevronLeft className="w-3.5 h-3.5" />
            Prev
          </button>

          <div className="min-w-[88px] text-center text-[12px] font-medium text-muted-foreground">
            {hasPages ? `Page ${safePage} / ${pageCount}` : "Page 0 / 0"}
          </div>

          <button
            type="button"
            onClick={() => onPageChange(safePage + 1)}
            disabled={loading || !hasPages || safePage >= pageCount}
            className={cn(
              "flex items-center gap-1 h-8 px-3 rounded-md border border-border text-[12px] font-medium transition-colors",
              "text-muted-foreground hover:text-foreground hover:bg-secondary disabled:opacity-40"
            )}
          >
            Next
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
