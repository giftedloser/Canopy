import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useCredentialStore } from "@/stores/credential-store";
import { useOuScopeStore } from "@/stores/ou-scope-store";
import { useDashboardStats } from "@/hooks/use-ad-reports";
import { useGroupMembers } from "@/hooks/use-ad-groups";
import { useUnlockUser, useResetPassword } from "@/hooks/use-ad-users";
import { formatErrorMessage, notifyActionError } from "@/lib/feedback";
import { toast } from "sonner";
import {
  Users,
  UserCheck,
  UserX,
  LockKeyhole,
  Monitor,
  ShieldCheck,
  Unlock,
  KeyRound,
  Loader2,
  AlertTriangle,
  WifiOff,
  Server,
  Network,
  Building2,
  Clock,
  UserMinus,
  KeySquare,
  Timer,
  ShieldAlert,
  User,
} from "lucide-react";

const DashboardOverview = lazy(() => import("@/components/dashboard/dashboard-overview"));

export default function Dashboard() {
  const navigate = useNavigate();
  const isConnected    = useCredentialStore((s) => s.isConnected);
  const connectionInfo = useCredentialStore((s) => s.connectionInfo);
  const isOuVisible = useOuScopeStore((s) => s.isOuVisible);
  const { data: stats, isLoading, error } = useDashboardStats();
  const pastDueSectionRef = useRef<HTMLDivElement | null>(null);
  const [pastDueEnabled, setPastDueEnabled] = useState(false);

  useEffect(() => {
    if (pastDueEnabled) return;

    const node = pastDueSectionRef.current;
    if (!node || typeof IntersectionObserver === "undefined") {
      setPastDueEnabled(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry?.isIntersecting) {
          setPastDueEnabled(true);
          observer.disconnect();
        }
      },
      { rootMargin: "240px 0px" }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [pastDueEnabled]);

  const { data: pastDueMembers, isLoading: pastDueLoading } = useGroupMembers(
    isConnected && pastDueEnabled ? "Security_PastDue_KB4" : null
  );
  const scopedPastDueMembers = (pastDueMembers ?? []).filter((member: any) => {
    const dn = member?.DistinguishedName || member?.distinguishedName;
    return typeof dn !== "string" || isOuVisible(dn);
  });

  if (!isConnected) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-5">
        <div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-secondary border border-border">
          <WifiOff className="w-7 h-7 text-muted-foreground/40" />
        </div>
        <div className="text-center space-y-1">
          <p className="text-base font-semibold text-foreground">Not Connected</p>
          <p className="text-sm text-muted-foreground">
            Connect to Active Directory to view the dashboard
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-[1280px] mx-auto space-y-6 animate-[fade-in_0.35s_ease-out]">
      {/* Domain header */}
      <DomainHeader connectionInfo={connectionInfo} />

      {/* Stats */}
      {isLoading ? (
        <SkeletonGrid />
      ) : error ? (
        <ErrorBanner message={formatErrorMessage(error, "Unknown error")} />
      ) : (
        <StatsSection
          stats={stats}
          onOpenUsers={(status) => navigate(status === "all" ? "/users" : `/users?status=${status}`)}
          onOpenReports={(reportId) => navigate(`/reports?report=${reportId}`)}
          onOpenGroups={() => navigate("/groups")}
          onOpenComputers={() => navigate("/computers")}
        />
      )}

      {/* Charts row */}
      {stats && (
        <div>
          <SectionLabel>Overview</SectionLabel>
          <Suspense fallback={<OverviewSkeleton />}>
            <DashboardOverview stats={stats} />
          </Suspense>
        </div>
      )}

      {/* Quick actions */}
      <div>
        <SectionLabel>Quick Actions</SectionLabel>
        <div className="grid grid-cols-1 items-stretch gap-3 mt-3 sm:grid-cols-2">
          <QuickUnlockCard />
          <QuickResetPasswordCard />
        </div>
      </div>

      {/* Security PastDue KB4 monitor */}
      <div ref={pastDueSectionRef}>
        <SectionLabel>Security Training — Past Due</SectionLabel>
        <PastDueGroupCard
          members={scopedPastDueMembers}
          isLoading={pastDueEnabled && pastDueLoading}
          pendingLoad={!pastDueEnabled}
        />
      </div>
    </div>
  );
}

/* ─── Domain header ─────────────────────────────────────────── */
function DomainHeader({ connectionInfo }: { connectionInfo: any }) {
  if (!connectionInfo) return null;
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight leading-none mb-2">Dashboard</h1>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-muted-foreground font-mono">
          <span className="flex items-center gap-1.5">
            <Network className="w-3 h-3 text-primary" />
            {connectionInfo.domainName}
          </span>
          <span className="flex items-center gap-1.5">
            <Server className="w-3 h-3 text-muted-foreground/50" />
            {connectionInfo.activeServer}
          </span>
          <span className="flex items-center gap-1.5">
            <Building2 className="w-3 h-3 text-muted-foreground/50" />
            {connectionInfo.connectedAs}
          </span>
        </div>
      </div>
    </div>
  );
}

/* ─── Stats section ──────────────────────────────────────────── */
function StatsSection({
  stats,
  onOpenUsers,
  onOpenReports,
  onOpenGroups,
  onOpenComputers,
}: {
  stats: any;
  onOpenUsers: (status: "all" | "enabled" | "disabled" | "locked") => void;
  onOpenReports: (reportId: string) => void;
  onOpenGroups: () => void;
  onOpenComputers: () => void;
}) {
  const lockedCount = stats?.locked_users ?? 0;

  return (
    <div className="space-y-3">
      {/* Alert card for locked accounts */}
      {lockedCount > 0 && (
        <button
          type="button"
          onClick={() => onOpenUsers("locked")}
          className="relative w-full overflow-hidden flex items-center gap-4 p-4 rounded-xl border border-destructive/25 bg-destructive/[0.04] alert-glow animate-[fade-in_0.3s_ease-out] text-left transition-colors hover:bg-destructive/[0.06]"
        >
          <div className="relative flex items-center justify-center w-10 h-10 rounded-xl bg-destructive/10 shrink-0">
            <LockKeyhole className="w-5 h-5 text-destructive" />
            <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[9px] font-bold text-white">
              {lockedCount > 9 ? "9+" : lockedCount}
            </span>
          </div>
          <div>
            <p className="text-sm font-semibold text-destructive">
              {lockedCount} account{lockedCount !== 1 ? "s" : ""} locked out
            </p>
            <p className="text-[12px] text-muted-foreground mt-0.5">
              Users are unable to sign in until their accounts are unlocked
            </p>
          </div>
          <div
            className="absolute inset-0 pointer-events-none opacity-[0.03]"
            style={{
              backgroundImage: "repeating-linear-gradient(45deg, currentColor 0, currentColor 1px, transparent 0, transparent 50%)",
              backgroundSize: "8px 8px",
            }}
          />
        </button>
      )}

      {/* Expanded stat grid — 5 columns on large, 2 on small */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 card-stagger">
        <StatCard
          icon={Users}
          label="Total Users"
          value={stats?.total_users ?? 0}
          accentClass="text-primary bg-primary/10"
          featured
          onClick={() => onOpenUsers("all")}
        />
        <StatCard
          icon={UserCheck}
          label="Enabled"
          value={stats?.enabled_users ?? 0}
          accentClass="text-success bg-success/10"
          onClick={() => onOpenUsers("enabled")}
        />
        <StatCard
          icon={UserX}
          label="Disabled"
          value={stats?.disabled_users ?? 0}
          accentClass="text-muted-foreground bg-muted"
          onClick={() => onOpenUsers("disabled")}
        />
        <StatCard
          icon={LockKeyhole}
          label="Locked Out"
          value={lockedCount}
          accentClass="text-destructive bg-destructive/10"
          danger={lockedCount > 0}
          onClick={() => onOpenUsers("locked")}
        />
        <StatCard
          icon={Monitor}
          label="Computers"
          value={stats?.total_computers ?? 0}
          accentClass="text-warning bg-warning/10"
          onClick={onOpenComputers}
        />
        <StatCard
          icon={ShieldCheck}
          label="Groups"
          value={stats?.total_groups ?? 0}
          accentClass="text-blue-500 bg-blue-500/10"
          onClick={onOpenGroups}
        />
        <StatCard
          icon={Clock}
          label="Expiring PW"
          value={stats?.expiring_passwords ?? 0}
          accentClass="text-orange-500 bg-orange-500/10"
          danger={(stats?.expiring_passwords ?? 0) > 0}
          onClick={() => onOpenReports("expiring_passwords")}
        />
        <StatCard
          icon={UserMinus}
          label="Inactive 90d"
          value={stats?.inactive_users ?? 0}
          accentClass="text-amber-600 bg-amber-600/10"
          onClick={() => onOpenReports("inactive_users")}
        />
        <StatCard
          icon={Timer}
          label="Never Logged In"
          value={stats?.never_logged_in ?? 0}
          accentClass="text-violet-500 bg-violet-500/10"
          onClick={() => onOpenReports("never_logged_in")}
        />
        <StatCard
          icon={KeySquare}
          label="PW Never Expires"
          value={stats?.password_never_expires ?? 0}
          accentClass="text-cyan-500 bg-cyan-500/10"
          onClick={() => onOpenReports("password_never_expires")}
        />
      </div>
    </div>
  );
}

/* ─── Security PastDue KB4 Group Card ────────────────────────── */
function PastDueGroupCard({
  members,
  isLoading,
  pendingLoad = false,
}: {
  members: any[] | undefined;
  isLoading: boolean;
  pendingLoad?: boolean;
}) {
  const count = members?.length ?? 0;
  const users = (members ?? []).filter((m: any) => m.ObjectClass === "user" || m.objectClass === "user");

  return (
    <div className="mt-3 rounded-xl border border-border bg-card overflow-hidden">
      {/* Header */}
      <div className={cn(
        "flex items-center gap-3 px-5 py-3.5 border-b border-border",
        count > 0 ? "bg-destructive/[0.04]" : "bg-success/[0.04]"
      )}>
        <div className={cn(
          "relative flex items-center justify-center w-9 h-9 rounded-xl shrink-0",
          count > 0 ? "bg-destructive/10" : "bg-success/10"
        )}>
          <ShieldAlert className={cn("w-4.5 h-4.5", count > 0 ? "text-destructive" : "text-success")} />
          {count > 0 && (
            <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive text-[9px] font-bold text-white px-1">
              {count > 99 ? "99+" : count}
            </span>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-semibold">
            Security_PastDue_KB4
          </p>
          <p className="text-[11px] text-muted-foreground">
            {pendingLoad ? "Waiting to load..." : isLoading ? "Loading..." : count > 0
              ? `${count} user${count !== 1 ? "s" : ""} with overdue security training — at risk of lockout`
              : "All users are current on security training"}
          </p>
        </div>
      </div>

      {/* Member list */}
      {pendingLoad ? (
        <div className="flex items-center justify-center py-8">
          <span className="text-[12px] text-muted-foreground">Load on scroll</span>
        </div>
      ) : isLoading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
        </div>
      ) : users.length > 0 ? (
        <div className="divide-y divide-border max-h-[320px] overflow-auto">
          {users.map((m: any, i: number) => {
            const ou = getOuShort(m.DistinguishedName || m.distinguishedName || "");
            return (
              <div key={m.SamAccountName || m.samAccountName || i} className="flex items-center gap-3 px-5 py-2.5 hover:bg-secondary/40 transition-colors">
                <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-destructive/10 text-destructive shrink-0">
                  <User className="w-3.5 h-3.5" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] font-medium truncate">{m.Name || m.name}</p>
                  <p className="text-[10px] text-muted-foreground font-mono truncate">{m.SamAccountName || m.samAccountName}</p>
                </div>
                {ou && (
                  <span className="text-[10px] text-muted-foreground/60 truncate max-w-[160px] hidden sm:block">{ou}</span>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-8 gap-1">
          <ShieldCheck className="w-5 h-5 text-success/60" />
          <p className="text-[12px] text-muted-foreground">No past-due users</p>
        </div>
      )}
    </div>
  );
}

function getOuShort(dn: string): string {
  const parts = dn.split(",").filter((p) => p.trim().toUpperCase().startsWith("OU="));
  if (parts.length === 0) return "";
  return parts.map((p) => p.replace(/^OU=/i, "")).join(" / ");
}

function normalizeUserIdentity(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";

  const withoutDomain = trimmed.includes("\\")
    ? trimmed.split("\\").pop()?.trim() || ""
    : trimmed;
  const withoutUpn = withoutDomain.includes("@")
    ? withoutDomain.split("@")[0]?.trim() || ""
    : withoutDomain;

  return withoutUpn;
}

function QuickActionBadge({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full border border-primary/20 bg-primary/[0.08] px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-foreground/85">
      {children}
    </span>
  );
}

function QuickActionFieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-[0.06em] text-muted-foreground">
      {children}
    </label>
  );
}

function QuickActionButton({
  children,
  tone,
  disabled,
  onClick,
}: {
  children: React.ReactNode;
  tone: "primary" | "warning";
  disabled?: boolean;
  onClick: () => void;
}) {
  const toneClass =
    tone === "warning"
      ? "border border-warning/30 bg-warning text-warning-foreground shadow-[0_8px_18px_hsl(38_92%_54%_/0.18)]"
      : "border border-primary/30 bg-primary text-primary-foreground shadow-[0_8px_18px_hsl(38_92%_54%_/0.18)]";

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex h-9 min-w-[142px] items-center justify-center rounded-md px-4 text-[12px] font-bold tracking-[0.01em] transition-[transform,opacity,box-shadow] duration-150 hover:-translate-y-px hover:opacity-95 disabled:translate-y-0 disabled:opacity-40 ${toneClass}`}
    >
      {children}
    </button>
  );
}

type QuickActionStatusTone = "neutral" | "success" | "error";

function QuickActionStatusLine({
  message,
  tone = "neutral",
}: {
  message: string;
  tone?: QuickActionStatusTone;
}) {
  const toneClass =
    tone === "success"
      ? "text-success"
      : tone === "error"
      ? "text-destructive"
      : "text-muted-foreground";

  return <p className={`min-h-4 text-[11px] leading-4 ${toneClass}`}>{message}</p>;
}

/* ─── Stat card ──────────────────────────────────────────────── */
function StatCard({
  icon: Icon,
  label,
  value,
  accentClass,
  featured = false,
  danger = false,
  onClick,
}: {
  icon: any;
  label: string;
  value: number;
  accentClass: string;
  featured?: boolean;
  danger?: boolean;
  onClick?: () => void;
}) {
  const cardClassName = cn(
    "interactive-card relative overflow-hidden rounded-xl border bg-card p-4 transition-all duration-200 group",
    danger
      ? "border-destructive/25 hover:border-destructive/40"
      : "border-border hover:border-border/80",
    onClick ? "text-left hover:shadow-md cursor-pointer" : "hover:shadow-md"
  );

  const content = (
    <>
      <div className="flex items-start justify-between mb-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.07em] text-muted-foreground">
          {label}
        </p>
        <div className={cn("flex items-center justify-center w-8 h-8 rounded-lg shrink-0", accentClass)}>
          <Icon className="w-4 h-4" />
        </div>
      </div>
      <p
        className={cn(
          "text-3xl font-bold tracking-tight font-mono stat-number leading-none",
          danger && "text-destructive"
        )}
      >
        {value.toLocaleString()}
      </p>
      {featured && (
        <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-gradient-to-r from-primary/60 via-primary/20 to-transparent" />
      )}
      {danger && value > 0 && (
        <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-gradient-to-r from-destructive/60 via-destructive/20 to-transparent" />
      )}
    </>
  );

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={cardClassName}>
        {content}
      </button>
    );
  }

  return (
    <div className={cardClassName}>
      {content}
    </div>
  );
}

/* ─── Section label ──────────────────────────────────────────── */
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground/60">
        {children}
      </span>
      <div className="flex-1 h-px bg-border" />
    </div>
  );
}

/* ─── Loading skeleton ───────────────────────────────────────── */
function SkeletonGrid() {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
      {Array.from({ length: 10 }).map((_, i) => (
        <div key={i} className="h-[100px] rounded-xl skeleton" />
      ))}
    </div>
  );
}

function OverviewSkeleton() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mt-3">
      <div className="h-[280px] rounded-xl skeleton" />
      <div className="h-[280px] rounded-xl skeleton" />
    </div>
  );
}

/* ─── Error banner ───────────────────────────────────────────── */
function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="flex items-center gap-3 p-4 rounded-xl border border-destructive/20 bg-destructive/5">
      <AlertTriangle className="w-5 h-5 text-destructive shrink-0" />
      <div>
        <p className="text-sm font-semibold">Failed to load stats</p>
        <p className="text-xs text-muted-foreground mt-0.5">{message}</p>
      </div>
    </div>
  );
}

/* ─── Quick Unlock ───────────────────────────────────────────── */
function QuickUnlockCard() {
  const [sam, setSam] = useState("");
  const [status, setStatus] = useState<{ tone: QuickActionStatusTone; message: string }>({
    tone: "neutral",
    message: "",
  });
  const unlock = useUnlockUser();
  const normalizedSam = normalizeUserIdentity(sam);

  const handleUnlock = async () => {
    if (!normalizedSam) {
      setStatus({ tone: "error", message: "Enter a user identity to unlock." });
      return;
    }
    try {
      await unlock.mutateAsync(normalizedSam);
      toast.success(`Account "${normalizedSam}" unlocked`);
      setSam("");
      setStatus({ tone: "success", message: `Unlocked ${normalizedSam}.` });
    } catch (error: unknown) {
      setStatus({
        tone: "error",
        message: formatErrorMessage(error, "Failed to unlock account"),
      });
      notifyActionError(error, {
        fallback: "Failed to unlock account",
        cancelled: "Unlock cancelled",
      });
    }
  };

  return (
    <div className="interactive-card h-full rounded-xl border border-border bg-card p-4 sm:p-5">
      <div className="flex items-start gap-3 mb-4">
        <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-warning/10 shrink-0">
          <Unlock className="w-4 h-4 text-warning" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[13px] font-semibold">Unlock Account</p>
            <QuickActionBadge>Directory-wide</QuickActionBadge>
          </div>
        </div>
      </div>
      <div className="flex flex-1 flex-col space-y-3">
        <div>
          <QuickActionFieldLabel>User</QuickActionFieldLabel>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              value={sam}
              onChange={(e) => {
                setSam(e.target.value);
                if (status.tone !== "neutral") {
                  setStatus({ tone: "neutral", message: "" });
                }
              }}
              onKeyDown={(e) => e.key === "Enter" && handleUnlock()}
              placeholder="jdoe, DOMAIN\\jdoe, or jdoe@domain.com"
              autoComplete="off"
              name="quick-unlock-sam"
              spellCheck={false}
              autoCorrect="off"
              autoCapitalize="none"
              data-lpignore="true"
              data-1p-ignore="true"
              data-form-type="other"
              className="input-base w-full flex-1 font-mono"
            />
            <QuickActionButton onClick={handleUnlock} disabled={unlock.isPending || !normalizedSam} tone="warning">
              {unlock.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Unlock Account"}
            </QuickActionButton>
          </div>
        </div>
        <div className="mt-auto">
          <QuickActionStatusLine message={status.message} tone={status.tone} />
        </div>
      </div>
    </div>
  );
}

/* ─── Quick Reset PW ─────────────────────────────────────────── */
function QuickResetPasswordCard() {
  const [sam, setSam]     = useState("");
  const [newPw, setNewPw] = useState("");
  const [changePasswordAtLogon, setChangePasswordAtLogon] = useState(false);
  const [status, setStatus] = useState<{ tone: QuickActionStatusTone; message: string }>({
    tone: "neutral",
    message: "",
  });
  const reset = useResetPassword();
  const normalizedSam = normalizeUserIdentity(sam);

  const handleReset = async () => {
    const normalizedPassword = newPw.trim();
    if (!normalizedSam) {
      setStatus({ tone: "error", message: "Enter a user identity before resetting." });
      return;
    }
    if (!normalizedPassword) {
      setStatus({ tone: "error", message: "Enter a new password before resetting." });
      return;
    }
    try {
      await reset.mutateAsync({
        samAccountName: normalizedSam,
        newPassword: normalizedPassword,
        changePasswordAtLogon,
      });
      toast.success(`Password reset for "${normalizedSam}"`);
      setSam(""); setNewPw(""); setChangePasswordAtLogon(false);
      setStatus({ tone: "success", message: `Password reset for ${normalizedSam}.` });
    } catch (error: unknown) {
      setStatus({
        tone: "error",
        message: formatErrorMessage(error, "Failed to reset password"),
      });
      notifyActionError(error, {
        fallback: "Failed to reset password",
        cancelled: "Password reset cancelled",
      });
    }
  };

  return (
    <div className="interactive-card h-full rounded-xl border border-border bg-card p-4 sm:p-5">
      <div className="flex items-start gap-3 mb-4">
        <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary/10 shrink-0">
          <KeyRound className="w-4 h-4 text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[13px] font-semibold">Reset Password</p>
            <QuickActionBadge>Directory-wide</QuickActionBadge>
          </div>
        </div>
      </div>
      <div className="flex flex-1 flex-col space-y-3">
        <div className="grid gap-3 sm:grid-cols-[1.1fr_1fr]">
          <div>
            <QuickActionFieldLabel>User</QuickActionFieldLabel>
            <input
              value={sam}
              onChange={(e) => {
                setSam(e.target.value);
                if (status.tone !== "neutral") {
                  setStatus({ tone: "neutral", message: "" });
                }
              }}
              onKeyDown={(e) => e.key === "Enter" && handleReset()}
              placeholder="jdoe, DOMAIN\\jdoe, or jdoe@domain.com"
              autoComplete="off"
              name="quick-reset-username"
              spellCheck={false}
              autoCorrect="off"
              autoCapitalize="none"
              data-lpignore="true"
              data-1p-ignore="true"
              data-form-type="other"
              className="input-base w-full font-mono"
            />
          </div>
          <div>
            <QuickActionFieldLabel>New Password</QuickActionFieldLabel>
            <input
              type="password"
              value={newPw}
              onChange={(e) => {
                setNewPw(e.target.value);
                if (status.tone !== "neutral") {
                  setStatus({ tone: "neutral", message: "" });
                }
              }}
              onKeyDown={(e) => e.key === "Enter" && handleReset()}
              placeholder="New password"
              autoComplete="new-password"
              name="quick-reset-password"
              spellCheck={false}
              autoCorrect="off"
              autoCapitalize="none"
              data-lpignore="true"
              data-1p-ignore="true"
              data-form-type="other"
              className="input-base w-full"
            />
          </div>
        </div>
        <div className="mt-auto space-y-2">
          <QuickActionStatusLine message={status.message} tone={status.tone} />
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <label className="flex items-start gap-2.5 py-0.5 text-[12px] text-muted-foreground">
              <input
                type="checkbox"
                checked={changePasswordAtLogon}
                onChange={(event) => setChangePasswordAtLogon(event.target.checked)}
                className="mt-0.5"
              />
              <span>Require password change at next login</span>
            </label>
            <QuickActionButton onClick={handleReset} disabled={reset.isPending || !normalizedSam || !newPw.trim()} tone="primary">
              {reset.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Reset Password"}
            </QuickActionButton>
          </div>
        </div>
      </div>
    </div>
  );
}
