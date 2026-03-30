import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Parse a date string from PowerShell output.
 * Handles both ISO 8601 strings and PS 5.1's /Date(timestamp)/ format.
 */
function parsePsDate(date: string): Date | null {
  if (!date) return null;
  // PowerShell 5.1 ConvertTo-Json serializes DateTime as /Date(1710000000000)/
  const psMatch = date.match(/^\/Date\((-?\d+)\)\/$/);
  if (psMatch) {
    return new Date(parseInt(psMatch[1], 10));
  }
  const d = new Date(date);
  return isNaN(d.getTime()) ? null : d;
}

export function formatDate(date: string | null | undefined): string {
  if (!date) return "Never";
  const d = parsePsDate(date);
  if (!d) return "Never";
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function formatDateTime(date: string | null | undefined): string {
  if (!date) return "Never";
  const d = parsePsDate(date);
  if (!d) return "Never";
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/**
 * Robustly extract JSON from PowerShell output that may contain
 * extra text (warnings, progress) before/after the actual JSON.
 */
function extractJson(raw: string): unknown {
  const trimmed = raw.replace(/\0/g, "").trim();
  // Try direct parse first (fast path)
  try {
    return JSON.parse(trimmed);
  } catch {
    // Fall through
  }
  // Try to find JSON object or array boundaries
  const firstBrace = trimmed.indexOf("{");
  const firstBracket = trimmed.indexOf("[");
  let start = -1;
  if (firstBrace >= 0 && (firstBracket < 0 || firstBrace < firstBracket)) {
    start = firstBrace;
  } else if (firstBracket >= 0) {
    start = firstBracket;
  }
  if (start >= 0) {
    const isArr = trimmed[start] === "[";
    const end = isArr ? trimmed.lastIndexOf("]") : trimmed.lastIndexOf("}");
    if (end > start) {
      try {
        return JSON.parse(trimmed.slice(start, end + 1));
      } catch {
        // Fall through
      }
    }
  }
  throw new Error(`Invalid JSON from PowerShell: ${trimmed.slice(0, 200)}`);
}

/** Parse PowerShell JSON output into a single object. */
export function parseAdJson(raw: string): any {
  return extractJson(raw);
}

/** Parse PowerShell JSON output, always returning an array. */
export function parseAdJsonArray(raw: string): any[] {
  const data = extractJson(raw);
  return Array.isArray(data) ? data : data ? [data] : [];
}

export interface PagedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
  hasMore: boolean;
}

export type CsvRow = Record<string, unknown>;

export function normalizePagedResult<T = CsvRow>(data: any, fallbackPageSize = 100): PagedResult<T> {
  const rawItems = Array.isArray(data?.items) ? data.items : data?.items ? [data.items] : [];
  const total = typeof data?.total === "number" ? data.total : rawItems.length;
  const page = typeof data?.page === "number" && data.page > 0 ? data.page : 1;
  const pageSize =
    typeof data?.page_size === "number" && data.page_size > 0
      ? data.page_size
      : typeof data?.pageSize === "number" && data.pageSize > 0
      ? data.pageSize
      : fallbackPageSize;
  const pageCount =
    typeof data?.page_count === "number" && data.page_count >= 0
      ? data.page_count
      : typeof data?.pageCount === "number" && data.pageCount >= 0
      ? data.pageCount
      : total === 0
      ? 0
      : Math.ceil(total / pageSize);
  const hasMore =
    typeof data?.has_more === "boolean"
      ? data.has_more
      : typeof data?.hasMore === "boolean"
      ? data.hasMore
      : page < pageCount;

  return {
    items: rawItems as T[],
    total,
    page,
    pageSize,
    pageCount,
    hasMore,
  };
}

export function getOUFromDN(dn: string): string {
  if (!dn) return "";
  const parts = dn.split(",");
  const ouParts = parts
    .filter((p) => p.trim().startsWith("OU="))
    .map((p) => p.trim().replace("OU=", ""));
  return ouParts.reverse().join(" / ") || "Root";
}

export function exportToCSV<T extends CsvRow>(data: T[], filename: string) {
  if (!data.length) return;
  const headers = Object.keys(data[0] as CsvRow);
  const csv = [
    headers.join(","),
    ...data.map((row) =>
      headers
        .map((h) => {
          const val = String((row as CsvRow)[h] ?? "");
          return val.includes(",") || val.includes('"') || val.includes("\n") || val.includes("\r")
            ? `"${val.replace(/"/g, '""')}"`
            : val;
        })
        .join(",")
    ),
  ].join("\n");

  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${filename}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
