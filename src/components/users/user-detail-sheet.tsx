import { useState } from "react";
import { cn, formatDate, formatDateTime, getOUFromDN } from "@/lib/utils";
import { useUserDetail, useUnlockUser, useToggleUser, useResetPassword } from "@/hooks/use-ad-users";
import { isElevationCancelledError } from "@/lib/tauri-ad";
import { toast } from "sonner";
import {
  X,
  User,
  Mail,
  Building2,
  Briefcase,
  MapPin,
  Phone,
  Clock,
  Shield,
  Lock,
  Unlock,
  Power,
  KeyRound,
  ShieldCheck,
  Loader2,
  Copy,
  Check,
} from "lucide-react";

interface UserDetailSheetProps {
  sam: string | null;
  onClose: () => void;
}

export function UserDetailSheet({ sam, onClose }: UserDetailSheetProps) {
  const { data, isLoading, error } = useUserDetail(sam);
  const [tab, setTab]               = useState<"details" | "groups">("details");
  const [showResetPw, setShowResetPw] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const unlock  = useUnlockUser();
  const toggle  = useToggleUser();
  const resetPw = useResetPassword();

  if (!sam) return null;

  const user   = data?.user;
  const groups = Array.isArray(data?.groups)
    ? data.groups
    : data?.groups
    ? [data.groups]
    : [];

  const initials = (user?.DisplayName || user?.Name || sam)
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w: string) => w[0].toUpperCase())
    .join("");

  return (
    <>
      {/* Overlay */}
      <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px] sheet-overlay" onClick={onClose} />

      {/* Sheet */}
      <div className="fixed right-0 top-0 bottom-0 z-50 w-full max-w-[480px] bg-card border-l border-border shadow-2xl animate-[slide-in-right_0.28s_cubic-bezier(0.16,1,0.3,1)] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 h-14 border-b border-border shrink-0">
          <div className="flex items-center gap-3">
            <div className={cn(
              "flex items-center justify-center w-9 h-9 rounded-full text-[12px] font-bold shrink-0",
              user?.Enabled ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground/60"
            )}>
              {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : (initials || "?")}
            </div>
            <div>
              <p className="text-[13px] font-bold">
                {isLoading ? "Loading..." : user?.DisplayName || user?.Name || sam}
              </p>
              <p className="text-[11px] font-mono text-muted-foreground">{sam}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Status + Actions */}
        {user && (
          <div className="px-5 py-2.5 border-b border-border flex items-center gap-2 shrink-0 flex-wrap bg-secondary/20">
            <span className={cn(
              "badge uppercase tracking-wider",
              user.Enabled ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"
            )}>
              <span className={cn("w-1.5 h-1.5 rounded-full", user.Enabled ? "bg-success" : "bg-destructive")} />
              {user.Enabled ? "Active" : "Disabled"}
            </span>
            {user.LockedOut && (
              <span className="badge bg-warning/10 text-warning uppercase tracking-wider">
                <Lock className="w-2.5 h-2.5" /> Locked
              </span>
            )}
            <div className="flex-1" />
            {user.LockedOut && (
              <ActionButton
                icon={Unlock} label="Unlock" loading={unlock.isPending} variant="warning"
                onClick={async () => {
                  try {
                    await unlock.mutateAsync(sam);
                    toast.success("Account unlocked");
                  } catch (e: any) {
                    if (isElevationCancelledError(e)) { toast.message("Cancelled."); return; }
                    toast.error(e?.toString());
                  }
                }}
              />
            )}
            <ActionButton
              icon={KeyRound} label="Reset PW" variant="primary"
              onClick={() => setShowResetPw(!showResetPw)}
            />
            <ActionButton
              icon={Power}
              label={user.Enabled ? "Disable" : "Enable"}
              loading={toggle.isPending}
              variant={user.Enabled ? "destructive" : "success"}
              onClick={async () => {
                try {
                  await toggle.mutateAsync({ sam, enable: !user.Enabled });
                  toast.success(user.Enabled ? "Account disabled" : "Account enabled");
                } catch (e: any) {
                  if (isElevationCancelledError(e)) { toast.message("Cancelled."); return; }
                  toast.error(e?.toString());
                }
              }}
            />
          </div>
        )}

        {/* Reset PW inline */}
        {showResetPw && (
          <div className="px-5 py-3 border-b border-border bg-accent/30 shrink-0">
            <div className="flex gap-2">
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Enter new password"
                className="input-base flex-1"
                autoFocus
              />
              <button
                onClick={async () => {
                  if (!newPassword) return;
                  try {
                    await resetPw.mutateAsync({ samAccountName: sam, newPassword });
                    toast.success("Password reset successfully.");
                    setNewPassword("");
                    setShowResetPw(false);
                  } catch (e: any) {
                    if (isElevationCancelledError(e)) { toast.message("Cancelled."); return; }
                    toast.error(e?.toString());
                  }
                }}
                disabled={resetPw.isPending}
                className="h-8 px-3.5 rounded-md bg-primary text-primary-foreground text-[12px] font-semibold hover:opacity-90 disabled:opacity-40 transition-opacity"
              >
                {resetPw.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : "Set"}
              </button>
            </div>
            <p className="text-[10px] text-muted-foreground mt-1.5">
              Sets the user's password to the value entered above
            </p>
          </div>
        )}

        {/* Tabs */}
        <div className="flex px-5 gap-4 border-b border-border shrink-0">
          {(["details", "groups"] as const).map((t) => (
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
              {t === "groups" ? `Groups (${groups.length})` : t}
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
                <p className="text-sm font-semibold text-destructive">Failed to load user details</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {error instanceof Error ? error.message : "Unknown error"}
                </p>
              </div>
            </div>
          ) : tab === "details" ? (
            <div className="p-5 space-y-5">
              <Section title="Identity">
                <Field icon={User} label="Display Name" value={user?.DisplayName} />
                <Field icon={User} label="First / Last"  value={`${user?.GivenName || ""} ${user?.Surname || ""}`.trim()} />
                <Field icon={Mail} label="Email"         value={user?.EmailAddress} mono />
                <Field              label="Description"  value={user?.Description} />
              </Section>
              <Section title="Organization">
                <Field icon={Building2} label="Department" value={user?.Department} />
                <Field icon={Briefcase} label="Title"      value={user?.Title} />
                <Field                  label="Company"    value={user?.Company} />
                <Field                  label="Office"     value={user?.Office} />
                <Field                  label="Manager"    value={user?.Manager ? user.Manager.split(",")[0]?.replace("CN=", "") : null} />
              </Section>
              <Section title="Contact">
                <Field icon={Phone}  label="Phone"   value={user?.TelephoneNumber} mono />
                <Field icon={Phone}  label="Mobile"  value={user?.MobilePhone} mono />
                <Field icon={MapPin} label="Address" value={[user?.StreetAddress, user?.City, user?.State, user?.PostalCode].filter(Boolean).join(", ")} />
              </Section>
              <Section title="Account">
                <Field icon={Clock}  label="Last Logon"   value={formatDateTime(user?.LastLogonDate)} />
                <Field icon={Clock}  label="Created"      value={formatDate(user?.WhenCreated)} />
                <Field icon={Clock}  label="Modified"     value={formatDate(user?.WhenChanged)} />
                <Field icon={Lock}   label="Password Set" value={formatDate(user?.PasswordLastSet)} />
                <Field icon={Shield} label="PW Expires"   value={user?.PasswordNeverExpires ? "Never" : "Per policy"} />
                <Field               label="OU"           value={getOUFromDN(user?.DistinguishedName)} />
                <CopyField           label="DN"           value={user?.DistinguishedName} />
              </Section>
            </div>
          ) : (
            <div className="p-5 space-y-1">
              {groups.length === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">No group memberships</p>
              ) : (
                groups.map((g: any, i: number) => (
                  <div key={i} className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-secondary/50 transition-colors">
                    <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-primary/10 shrink-0">
                      <ShieldCheck className="w-3.5 h-3.5 text-primary" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-medium truncate">{g.Name}</p>
                      <p className="text-[11px] text-muted-foreground font-mono">{g.GroupCategory} · {g.GroupScope}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
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

function Field({ icon: Icon, label, value, mono = false }: {
  icon?: any; label: string; value: string | null | undefined; mono?: boolean;
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
      <button
        onClick={() => {
          navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
        className="opacity-0 group-hover:opacity-100 p-1 rounded text-muted-foreground hover:text-primary transition-all"
      >
        {copied ? <Check className="w-3 h-3 text-success" /> : <Copy className="w-3 h-3" />}
      </button>
    </div>
  );
}

function ActionButton({ icon: Icon, label, onClick, loading = false, variant = "primary" }: {
  icon: any; label: string; onClick: () => void;
  loading?: boolean; variant?: "primary" | "destructive" | "warning" | "success";
}) {
  const variantStyles = {
    primary:     "bg-primary/10 text-primary hover:bg-primary/20",
    destructive: "bg-destructive/10 text-destructive hover:bg-destructive/20",
    warning:     "bg-warning/10 text-warning hover:bg-warning/20",
    success:     "bg-success/10 text-success hover:bg-success/20",
  };
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className={cn(
        "flex items-center gap-1.5 h-7 px-2.5 rounded-md text-[11px] font-semibold transition-colors",
        variantStyles[variant],
        loading && "opacity-50"
      )}
    >
      {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Icon className="w-3 h-3" />}
      {label}
    </button>
  );
}
