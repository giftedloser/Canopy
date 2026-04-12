import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { cn, exportToCSV, parseAdJsonArray } from "@/lib/utils";
import { useCredentialStore } from "@/stores/credential-store";
import { useOuScopeStore } from "@/stores/ou-scope-store";
import { useReport } from "@/hooks/use-ad-reports";
import { runReport } from "@/lib/tauri-ad";
import { toast } from "sonner";
import {
  FileBarChart,
  LockKeyhole,
  UserX,
  Clock,
  KeyRound,
  UserCheck,
  Mail,
  Monitor,
  Users,
  ShieldAlert,
  Shield,
  Download,
  Loader2,
  ChevronRight,
  WifiOff,
  ArrowLeft,
  AlertTriangle,
  Check,
} from "lucide-react";

interface ReportDef {
  id: string;
  category: "security" | "identity" | "devices" | "groups";
  title: string;
  description: string;
  icon: any;
  colorClass: string;
  borderClass: string;
}

interface ReportValidationResult {
  id: string;
  title: string;
  resultCount: number;
  error?: string;
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<R>
) {
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  async function runWorker() {
    while (true) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      if (currentIndex >= items.length) return;
      results[currentIndex] = await worker(items[currentIndex]);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => runWorker())
  );

  return results;
}

const reportSections = [
  { id: "security", title: "Security & Privilege" },
  { id: "identity", title: "Identity Hygiene" },
  { id: "devices", title: "Devices" },
  { id: "groups", title: "Groups" },
] as const;

const reports: ReportDef[] = [
  {
    id: "locked_accounts",
    category: "security",
    title: "Locked Accounts",
    description: "Users currently locked out of their accounts",
    icon: LockKeyhole,
    colorClass: "text-red-400 bg-red-500/10",
    borderClass: "border-l-red-500/40",
  },
  {
    id: "disabled_accounts",
    category: "identity",
    title: "Disabled Accounts",
    description: "User accounts that are currently disabled",
    icon: UserX,
    colorClass: "text-slate-400 bg-slate-500/10",
    borderClass: "border-l-slate-500/40",
  },
  {
    id: "inactive_users",
    category: "identity",
    title: "Inactive Users (90+ days)",
    description: "Enabled accounts with no logon in 90 days",
    icon: Clock,
    colorClass: "text-amber-400 bg-amber-500/10",
    borderClass: "border-l-amber-500/40",
  },
  {
    id: "expiring_passwords",
    category: "identity",
    title: "Expiring Passwords",
    description: "Passwords expiring within the next 7 days",
    icon: KeyRound,
    colorClass: "text-orange-400 bg-orange-500/10",
    borderClass: "border-l-orange-500/40",
  },
  {
    id: "never_logged_in",
    category: "identity",
    title: "Never Logged In",
    description: "Enabled accounts that have never been used",
    icon: UserCheck,
    colorClass: "text-violet-400 bg-violet-500/10",
    borderClass: "border-l-violet-500/40",
  },
  {
    id: "no_email",
    category: "identity",
    title: "Users Without Email",
    description: "Active users missing an email address",
    icon: Mail,
    colorClass: "text-blue-400 bg-blue-500/10",
    borderClass: "border-l-blue-500/40",
  },
  {
    id: "computer_os_breakdown",
    category: "devices",
    title: "OS Breakdown",
    description: "Computer count grouped by operating system",
    icon: Monitor,
    colorClass: "text-cyan-400 bg-cyan-500/10",
    borderClass: "border-l-cyan-500/40",
  },
  {
    id: "empty_groups",
    category: "groups",
    title: "Empty Groups",
    description: "Groups with zero members",
    icon: Users,
    colorClass: "text-emerald-400 bg-emerald-500/10",
    borderClass: "border-l-emerald-500/40",
  },
  {
    id: "large_groups",
    category: "groups",
    title: "Large Groups (50+)",
    description: "Groups with 50 or more members",
    icon: ShieldAlert,
    colorClass: "text-pink-400 bg-pink-500/10",
    borderClass: "border-l-pink-500/40",
  },
  {
    id: "password_never_expires",
    category: "identity",
    title: "Password Never Expires",
    description: "Active accounts with non-expiring passwords",
    icon: Shield,
    colorClass: "text-indigo-400 bg-indigo-500/10",
    borderClass: "border-l-indigo-500/40",
  },
  {
    id: "privileged_accounts",
    category: "security",
    title: "Privileged Accounts",
    description: "Users in built-in and directory privileged groups",
    icon: ShieldAlert,
    colorClass: "text-rose-400 bg-rose-500/10",
    borderClass: "border-l-rose-500/40",
  },
  {
    id: "stale_privileged_accounts",
    category: "security",
    title: "Stale Privileged Accounts",
    description: "Privileged users with no logon in 90+ days",
    icon: Clock,
    colorClass: "text-amber-400 bg-amber-500/10",
    borderClass: "border-l-amber-500/40",
  },
  {
    id: "service_accounts",
    category: "identity",
    title: "Service Accounts",
    description: "SPN-backed or service-patterned user accounts",
    icon: KeyRound,
    colorClass: "text-orange-400 bg-orange-500/10",
    borderClass: "border-l-orange-500/40",
  },
  {
    id: "delegation_enabled",
    category: "security",
    title: "Delegation Enabled",
    description: "Users or computers with unconstrained or constrained delegation",
    icon: Shield,
    colorClass: "text-fuchsia-400 bg-fuchsia-500/10",
    borderClass: "border-l-fuchsia-500/40",
  },
  {
    id: "spn_accounts",
    category: "security",
    title: "Accounts With SPNs",
    description: "Kerberoastable user accounts with service principal names",
    icon: KeyRound,
    colorClass: "text-red-400 bg-red-500/10",
    borderClass: "border-l-red-500/40",
  },
  {
    id: "sidhistory_present",
    category: "security",
    title: "SIDHistory Present",
    description: "Users, computers, or groups carrying SIDHistory values",
    icon: ShieldAlert,
    colorClass: "text-yellow-400 bg-yellow-500/10",
    borderClass: "border-l-yellow-500/40",
  },
  {
    id: "disabled_accounts_in_groups",
    category: "identity",
    title: "Disabled But In Groups",
    description: "Disabled users still present in security groups",
    icon: UserX,
    colorClass: "text-slate-400 bg-slate-500/10",
    borderClass: "border-l-slate-500/40",
  },
  {
    id: "admincount_accounts",
    category: "security",
    title: "AdminCount = 1",
    description: "Protected users, computers, or groups with adminCount set",
    icon: Shield,
    colorClass: "text-indigo-400 bg-indigo-500/10",
    borderClass: "border-l-indigo-500/40",
  },
  {
    id: "old_password_active_users",
    category: "identity",
    title: "Old Passwords, Still Active",
    description: "Enabled users active recently with passwords older than 180 days",
    icon: Clock,
    colorClass: "text-amber-400 bg-amber-500/10",
    borderClass: "border-l-amber-500/40",
  },
  {
    id: "computers_not_reporting",
    category: "devices",
    title: "Computers Not Reporting",
    description: "Enabled machines with no AD logon in 30+ days",
    icon: Monitor,
    colorClass: "text-cyan-400 bg-cyan-500/10",
    borderClass: "border-l-cyan-500/40",
  },
  {
    id: "outdated_operating_systems",
    category: "devices",
    title: "Outdated OS / Unsupported",
    description: "Unsupported Windows versions and Windows 10 builds before 22H2",
    icon: AlertTriangle,
    colorClass: "text-orange-400 bg-orange-500/10",
    borderClass: "border-l-orange-500/40",
  },
  {
    id: "group_nesting_depth",
    category: "groups",
    title: "Group Nesting Depth",
    description: "Nested groups ranked by depth and direct nested-group count",
    icon: Users,
    colorClass: "text-emerald-400 bg-emerald-500/10",
    borderClass: "border-l-emerald-500/40",
  },
];

export default function ReportsPage() {
  const isConnected   = useCredentialStore((s) => s.isConnected);
  const scopeActive = useOuScopeStore((s) => s.scopeActive);
  const enabledOus = useOuScopeStore((s) => s.enabledOus);
  const [searchParams, setSearchParams] = useSearchParams();
  const [isValidatingCatalog, setIsValidatingCatalog] = useState(false);
  const [validationResults, setValidationResults] = useState<ReportValidationResult[] | null>(null);
  const ouScopes = useMemo(
    () =>
      scopeActive && enabledOus.size > 0
        ? Array.from(enabledOus).sort((a, b) => a.localeCompare(b))
        : undefined,
    [enabledOus, scopeActive]
  );
  const reportsBySection = useMemo(
    () =>
      reportSections.map((section) => ({
        ...section,
        reports: reports.filter((report) => report.category === section.id),
      })),
    []
  );
  const activeReport = useMemo(() => {
    const reportId = searchParams.get("report");
    return reports.some((report) => report.id === reportId) ? reportId : null;
  }, [searchParams]);

  const validateCatalog = async () => {
    setIsValidatingCatalog(true);
    setValidationResults(null);

    const results = await mapWithConcurrency(reports, 3, async (report): Promise<ReportValidationResult> => {
      try {
        const raw = await runReport(report.id, ouScopes);
        const parsed = parseAdJsonArray(raw);
        return {
          id: report.id,
          title: report.title,
          resultCount: parsed.length,
        };
      } catch (error) {
        return {
          id: report.id,
          title: report.title,
          resultCount: 0,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    });

    setValidationResults(results);
    setIsValidatingCatalog(false);

    const failures = results.filter((result) => result.error).length;
    if (failures > 0) {
      toast.error(`Validation found ${failures} report issue${failures === 1 ? "" : "s"}`);
    } else {
      toast.success(`Validated ${results.length} reports successfully`);
    }
  };

  if (!isConnected) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <WifiOff className="w-10 h-10 text-muted-foreground/30" />
        <p className="text-sm text-muted-foreground">Connect to Active Directory to run reports</p>
      </div>
    );
  }

  if (activeReport) {
    const def = reports.find((r) => r.id === activeReport)!;
    return <ReportViewer report={def} onBack={() => setSearchParams({}, { replace: true })} />;
  }

  return (
    <div className="p-6 max-w-[1280px] mx-auto animate-[fade-in_0.35s_ease-out]">
      {/* Page header */}
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight leading-none mb-2">Reports</h1>
          <p className="text-[13px] text-muted-foreground">
            Generate and export Active Directory audit reports
          </p>
        </div>
        <button
          type="button"
          onClick={validateCatalog}
          disabled={isValidatingCatalog}
          className="inline-flex h-9 items-center gap-2 px-3 rounded-md border border-border text-[12px] font-medium text-muted-foreground hover:text-foreground hover:bg-secondary disabled:opacity-60 transition-colors shrink-0"
        >
          {isValidatingCatalog ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
          Validate Catalog
        </button>
      </div>

      {validationResults && (
        <div className="mb-6 rounded-xl border border-border bg-card overflow-hidden">
          <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border">
            <div>
              <p className="text-[13px] font-semibold">Report Validation</p>
              <p className="text-[11px] text-muted-foreground">
                Ran all reports against the current directory connection{ouScopes ? " with the active OU scope applied" : ""}.
              </p>
            </div>
            <div className="text-[11px] font-mono text-muted-foreground bg-secondary px-2 py-1 rounded-md">
              {validationResults.filter((result) => !result.error).length} ok / {validationResults.filter((result) => !!result.error).length} failed
            </div>
          </div>
          <div className="divide-y divide-border/60">
            {validationResults.map((result) => (
              <div key={result.id} className="flex items-start justify-between gap-4 px-4 py-3">
                <div className="min-w-0">
                  <p className="text-[12px] font-medium">{result.title}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    {result.error ? result.error : `${result.resultCount} rows returned`}
                  </p>
                </div>
                <span
                  className={cn(
                    "inline-flex items-center rounded-md px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] shrink-0",
                    result.error
                      ? "bg-destructive/10 text-destructive"
                      : "bg-emerald-500/10 text-emerald-500"
                  )}
                >
                  {result.error ? "Issue" : "OK"}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-6">
        {reportsBySection.map((section) => (
          <section key={section.id}>
            <div className="flex items-center gap-3 mb-3">
              <h2 className="text-[12px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/80">
                {section.title}
              </h2>
              <div className="h-px flex-1 bg-border" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 card-stagger">
              {section.reports.map((report) => (
                <button
                  key={report.id}
                  onClick={() => setSearchParams({ report: report.id })}
                  className={cn(
                    "group text-left rounded-xl border border-border bg-card p-4 hover:border-primary/30 hover:bg-secondary/30 transition-all border-l-[3px]",
                    report.borderClass
                  )}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className={cn("flex items-center justify-center w-9 h-9 rounded-lg", report.colorClass)}>
                      <report.icon className="w-4 h-4" />
                    </div>
                    <ChevronRight className="w-4 h-4 text-muted-foreground/25 group-hover:text-primary group-hover:translate-x-0.5 transition-all mt-2" />
                  </div>
                  <p className="text-[13px] font-semibold mb-1">{report.title}</p>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">{report.description}</p>
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

/* ─── Report viewer ──────────────────────────────────────────── */
function ReportViewer({ report, onBack }: { report: ReportDef; onBack: () => void }) {
  const { data = [], isLoading, error } = useReport(report.id);
  const columns = data.length > 0 ? Object.keys(data[0]) : [];
  const shouldAnimateRows = data.length <= 150;

  return (
    <div className="flex flex-col h-full animate-[fade-in_0.25s_ease-out]">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-border shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="flex items-center justify-center w-8 h-8 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className={cn("flex items-center justify-center w-8 h-8 rounded-lg", report.colorClass)}>
            <report.icon className="w-4 h-4" />
          </div>
          <div>
            <h1 className="text-[14px] font-bold">{report.title}</h1>
            <p className="text-[11px] text-muted-foreground">{report.description}</p>
          </div>
          {!isLoading && (
            <span className="ml-1 text-[11px] font-mono text-muted-foreground bg-secondary px-1.5 py-0.5 rounded-md">
              {data.length} results
            </span>
          )}
        </div>
        <button
          onClick={() => exportToCSV(data, `report-${report.id}`)}
          disabled={data.length === 0}
          className="flex items-center gap-1.5 h-8 px-3 rounded-md border border-border text-[12px] font-medium text-muted-foreground hover:text-foreground hover:bg-secondary disabled:opacity-40 transition-colors"
        >
          <Download className="w-3.5 h-3.5" />
          Export CSV
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center h-40 gap-3">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Running report...</p>
          </div>
        ) : error ? (
          <div className="flex items-center gap-3 p-4 m-4 rounded-xl border border-destructive/20 bg-destructive/5">
            <AlertTriangle className="w-5 h-5 text-destructive shrink-0" />
            <p className="text-sm">{error instanceof Error ? error.message : "Report failed"}</p>
          </div>
        ) : data.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-muted-foreground">
            <FileBarChart className="w-8 h-8 opacity-20 mb-2" />
            <p className="text-sm">No results found</p>
            <p className="text-[11px] mt-1 opacity-60">This report returned no matching records</p>
          </div>
        ) : (
          <table className="w-full">
            <thead className="sticky top-0 z-10">
              <tr className="bg-secondary/40 backdrop-blur-sm border-b border-border">
                {columns.map((col) => (
                  <th
                    key={col}
                    className="text-left text-[10px] font-bold uppercase tracking-[0.08em] text-muted-foreground/60 px-4 py-2.5 whitespace-nowrap"
                  >
                    {col.replace(/([A-Z])/g, " $1").trim()}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.map((row: any, i: number) => (
                <tr
                  key={i}
                  className={cn(
                    "table-row-hover border-b border-border/40 hover:bg-secondary/25 transition-colors",
                    shouldAnimateRows && "table-row-animate"
                  )}
                  style={shouldAnimateRows ? { animationDelay: `${Math.min(i * 10, 200)}ms` } : undefined}
                >
                  {columns.map((col) => (
                    <td key={col} className="px-4 py-2.5 text-[12px] text-muted-foreground whitespace-nowrap">
                      {typeof row[col] === "boolean"
                        ? row[col] ? "Yes" : "No"
                        : String(row[col] ?? "—")}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
