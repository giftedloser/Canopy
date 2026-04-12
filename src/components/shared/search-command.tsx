import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useCredentialStore } from "@/stores/credential-store";
import { getUsersPage, getComputersPage, getGroupsPage } from "@/lib/tauri-ad";
import { parseAdJson, normalizePagedResult } from "@/lib/utils";
import {
  Search,
  Users,
  Monitor,
  ShieldCheck,
  LayoutDashboard,
  Loader2,
  X,
} from "lucide-react";

interface SearchCommandProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type SearchResult = {
  type: "user" | "computer" | "group" | "page";
  name: string;
  detail: string;
  sam?: string;
};

type CachedSearchResult = {
  fetchedAt: number;
  results: SearchResult[];
};

const SEARCH_CACHE_TTL_MS = 5 * 60 * 1000;
const SEARCH_CACHE_MAX_ENTRIES = 25;
const COMMAND_SEARCH_LIMITS = {
  users: 10,
  computers: 8,
  groups: 8,
} as const;

const pages: SearchResult[] = [
  { type: "page", name: "Dashboard",  detail: "Overview & stats" },
  { type: "page", name: "Users",      detail: "Manage AD users" },
  { type: "page", name: "Computers",  detail: "Manage AD computers" },
  { type: "page", name: "Groups",     detail: "Manage AD groups" },
  { type: "page", name: "Directory",  detail: "Browse OU structure" },
  { type: "page", name: "Reports",    detail: "Generate reports" },
  { type: "page", name: "Settings",   detail: "Configure app behavior" },
];

const pageRoutes: Record<string, string> = {
  Dashboard: "/",
  Users:     "/users",
  Computers: "/computers",
  Groups:    "/groups",
  Directory: "/directory",
  Reports:   "/reports",
  Settings:  "/settings",
};

const typeIcons = {
  user:     Users,
  computer: Monitor,
  group:    ShieldCheck,
  page:     LayoutDashboard,
} as const;

const typeBadge: Record<string, string> = {
  user:     "bg-blue-500/10 text-blue-400",
  computer: "bg-amber-500/10 text-amber-400",
  group:    "bg-emerald-500/10 text-emerald-400",
  page:     "bg-secondary text-muted-foreground",
};

function getRelevanceScore(query: string, ...fields: Array<string | undefined>) {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  if (!normalizedQuery) return Number.NEGATIVE_INFINITY;

  let bestScore = Number.NEGATIVE_INFINITY;
  for (const field of fields) {
    const normalizedField = field?.trim().toLocaleLowerCase();
    if (!normalizedField) continue;

    const exactIndex = normalizedField.indexOf(normalizedQuery);
    if (exactIndex === -1) continue;

    let score = 10;
    if (normalizedField === normalizedQuery) score = 100;
    else if (normalizedField.startsWith(normalizedQuery)) score = 80;
    else if (normalizedField.includes(` ${normalizedQuery}`) || normalizedField.includes(`-${normalizedQuery}`) || normalizedField.includes(`_${normalizedQuery}`)) score = 60;
    else score = 40 - Math.min(exactIndex, 20);

    bestScore = Math.max(bestScore, score);
  }

  return bestScore;
}

export function SearchCommand({ open, onOpenChange }: SearchCommandProps) {
  const navigate    = useNavigate();
  const isConnected = useCredentialStore((s) => s.isConnected);
  const connectionScope = useCredentialStore(
    (s) => `${s.connectionInfo?.domainName ?? ""}|${s.connectionInfo?.activeServer ?? ""}`
  );
  const [query,    setQuery]    = useState("");
  const [results,  setResults]  = useState<SearchResult[]>(pages);
  const [selected, setSelected] = useState(0);
  const [loading,  setLoading]  = useState(false);
  const requestSequence = useRef(0);
  const searchCache = useRef(new Map<string, CachedSearchResult>());

  useEffect(() => {
    if (!open) {
      requestSequence.current += 1;
      setQuery("");
      setResults(pages);
      setSelected(0);
      setLoading(false);
    }
  }, [open]);

  useEffect(() => {
    searchCache.current.clear();
  }, [connectionScope]);

  useEffect(() => {
    if (!query.trim()) { setResults(pages); setSelected(0); return; }

    const lq = query.toLowerCase();
    const filteredPages = pages.filter(
      (p) => p.name.toLowerCase().includes(lq) || p.detail.toLowerCase().includes(lq)
    );

    if (query.trim().length < 3) {
      requestSequence.current += 1;
      setResults(filteredPages);
      setSelected(0);
      setLoading(false);
      return;
    }

    if (!isConnected) {
      requestSequence.current += 1;
      setResults(filteredPages);
      setSelected(0);
      setLoading(false);
      return;
    }

    const requestId = ++requestSequence.current;
    const timer = setTimeout(async () => {
      const cacheKey = `${connectionScope}::${query.trim().toLowerCase()}`;
      const cached = searchCache.current.get(cacheKey);
      if (cached && Date.now() - cached.fetchedAt < SEARCH_CACHE_TTL_MS) {
        setResults(cached.results);
        setSelected(0);
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        const [usersRaw, computersRaw, groupsRaw] = await Promise.allSettled([
          getUsersPage({ search: query, page: 1, pageSize: COMMAND_SEARCH_LIMITS.users, lookupMode: true }),
          getComputersPage({ search: query, page: 1, pageSize: COMMAND_SEARCH_LIMITS.computers, lookupMode: true }),
          getGroupsPage({ search: query, page: 1, pageSize: COMMAND_SEARCH_LIMITS.groups, includeMemberCounts: false, lookupMode: true }),
        ]);

        const adResults: SearchResult[] = [];
        const normalizedQuery = query.trim().toLocaleLowerCase();

        if (usersRaw.status === "fulfilled") {
          const users = normalizePagedResult(parseAdJson(usersRaw.value)).items;
          (Array.isArray(users) ? users : users ? [users] : [])
            .map((u: any) => ({
              row: u,
              score: getRelevanceScore(normalizedQuery, u.DisplayName, u.Name, u.SamAccountName),
            }))
            .filter((entry) => entry.score > Number.NEGATIVE_INFINITY)
            .sort((left, right) => right.score - left.score || String(left.row.DisplayName || left.row.Name || "").localeCompare(String(right.row.DisplayName || right.row.Name || ""), undefined, { numeric: true }))
            .slice(0, COMMAND_SEARCH_LIMITS.users)
            .forEach(({ row: u }) => adResults.push({
              type: "user", name: u.DisplayName || u.Name, detail: u.SamAccountName, sam: u.SamAccountName,
            }));
        }
        if (computersRaw.status === "fulfilled") {
          const computers = normalizePagedResult(parseAdJson(computersRaw.value)).items;
          (Array.isArray(computers) ? computers : computers ? [computers] : [])
            .map((c: any) => ({
              row: c,
              score: getRelevanceScore(normalizedQuery, c.Name, c.DNSHostName),
            }))
            .filter((entry) => entry.score > Number.NEGATIVE_INFINITY)
            .sort((left, right) => right.score - left.score || String(left.row.Name || "").localeCompare(String(right.row.Name || ""), undefined, { numeric: true }))
            .slice(0, COMMAND_SEARCH_LIMITS.computers)
            .forEach(({ row: c }) => adResults.push({
              type: "computer", name: c.Name, detail: c.OperatingSystem || "Computer",
            }));
        }
        if (groupsRaw.status === "fulfilled") {
          const groups = normalizePagedResult(parseAdJson(groupsRaw.value)).items;
          (Array.isArray(groups) ? groups : groups ? [groups] : [])
            .map((g: any) => ({
              row: g,
              score: getRelevanceScore(normalizedQuery, g.Name, g.SamAccountName),
            }))
            .filter((entry) => entry.score > Number.NEGATIVE_INFINITY)
            .sort((left, right) => right.score - left.score || String(left.row.Name || "").localeCompare(String(right.row.Name || ""), undefined, { numeric: true }))
            .slice(0, COMMAND_SEARCH_LIMITS.groups)
            .forEach(({ row: g }) => adResults.push({
              type: "group", name: g.Name, detail: `${g.GroupCategory} · ${g.GroupScope}`,
            }));
        }

        if (requestSequence.current === requestId) {
          const combinedResults = [...filteredPages, ...adResults];
          searchCache.current.set(cacheKey, {
            fetchedAt: Date.now(),
            results: combinedResults,
          });
          if (searchCache.current.size > SEARCH_CACHE_MAX_ENTRIES) {
            const oldestKey = searchCache.current.keys().next().value;
            if (oldestKey) {
              searchCache.current.delete(oldestKey);
            }
          }

          setResults(combinedResults);
          setSelected(0);
        }
      } catch {
        if (requestSequence.current === requestId) {
          setResults(filteredPages);
        }
      } finally {
        if (requestSequence.current === requestId) {
          setLoading(false);
        }
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [query, isConnected]);

  const handleSelect = (result: SearchResult) => {
    requestSequence.current += 1;
    setLoading(false);
    onOpenChange(false);
    if      (result.type === "page")     navigate(pageRoutes[result.name] || "/");
    else if (result.type === "user")     navigate("/users");
    else if (result.type === "computer") navigate("/computers");
    else if (result.type === "group")    navigate("/groups");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if      (e.key === "ArrowDown") { e.preventDefault(); setSelected((s) => Math.min(s + 1, results.length - 1)); }
    else if (e.key === "ArrowUp")   { e.preventDefault(); setSelected((s) => Math.max(s - 1, 0)); }
    else if (e.key === "Enter" && results[selected]) handleSelect(results[selected]);
    else if (e.key === "Escape") onOpenChange(false);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[18vh]">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => onOpenChange(false)} />

      <div className="relative w-full max-w-[540px] mx-4 animate-[scale-in_0.18s_cubic-bezier(0.16,1,0.3,1)]">
        <div className="bg-popover border border-border rounded-xl shadow-2xl overflow-hidden">
          {/* Input */}
          <div className="flex items-center gap-3 px-4 border-b border-border">
            {loading
              ? <Loader2 className="w-4 h-4 text-primary animate-spin shrink-0" />
              : <Search  className="w-4 h-4 text-muted-foreground/50 shrink-0" />
            }
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Search users, computers, groups..."
              autoComplete="off"
              name="command-search"
              spellCheck={false}
              autoCorrect="off"
              autoCapitalize="none"
              data-lpignore="true"
              data-1p-ignore="true"
              data-form-type="other"
              className="flex-1 h-12 bg-transparent text-[14px] placeholder:text-muted-foreground/40 focus:outline-none"
            />
            <button
              onClick={() => onOpenChange(false)}
              className="p-1 rounded text-muted-foreground/40 hover:text-muted-foreground transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Results */}
          <div className="max-h-[340px] overflow-auto p-1.5">
            {results.length === 0 ? (
              <div className="py-10 text-center text-sm text-muted-foreground">
                No results found
              </div>
            ) : (
              results.map((result, i) => {
                const Icon = typeIcons[result.type];
                return (
                  <button
                    key={`${result.type}-${result.name}-${i}`}
                    onClick={() => handleSelect(result)}
                    onMouseEnter={() => setSelected(i)}
                    className={cn(
                      "flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-left transition-colors",
                      selected === i
                        ? "bg-primary/12 text-foreground"
                        : "text-muted-foreground hover:bg-secondary/50"
                    )}
                  >
                    <div className={cn(
                      "flex items-center justify-center w-8 h-8 rounded-lg shrink-0 transition-colors",
                      selected === i ? "bg-primary/15" : "bg-secondary"
                    )}>
                      <Icon className={cn("w-4 h-4", selected === i ? "text-primary" : "")} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-[13px] font-medium truncate">{result.name}</div>
                      <div className="text-[11px] text-muted-foreground truncate font-mono">{result.detail}</div>
                    </div>
                    <span className={cn("badge shrink-0", typeBadge[result.type])}>
                      {result.type}
                    </span>
                  </button>
                );
              })
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center gap-4 px-4 py-2.5 border-t border-border">
            <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground/50">
              <kbd>↑↓</kbd> Navigate
            </span>
            <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground/50">
              <kbd>↵</kbd> Select
            </span>
            <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground/50">
              <kbd>esc</kbd> Close
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
