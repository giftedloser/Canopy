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
  const [tab, setTab]               = useState<"details" | "groups" | "attributes">("details");
  const [showResetPw, setShowResetPw] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const unlock  = useUnlockUser();
  const toggle  = useToggleUser();
  const resetPw = useResetPassword();

  if (!sam) return null;

  const user   = data?.user;
  const groups = normalizeUserGroups(data);
  const attributes = getPopulatedAttributes(user);

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
                autoComplete="new-password"
                name="user-detail-reset-password"
                spellCheck={false}
                autoCorrect="off"
                autoCapitalize="none"
                data-lpignore="true"
                data-1p-ignore="true"
                data-form-type="other"
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
          ) : tab === "groups" ? (
            <div className="p-5 space-y-1">
              {groups.length === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">No group memberships</p>
              ) : (
                groups.map((group) => (
                  <div
                    key={group.DistinguishedName || group.SamAccountName || group.Name}
                    className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-secondary/50 transition-colors"
                  >
                    <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-primary/10 shrink-0">
                      <ShieldCheck className="w-3.5 h-3.5 text-primary" />
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
            <AttributeViewer attributes={attributes} />
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

type UserAttribute = {
  key: string;
  label: string;
  value: string;
};

function normalizeUserGroups(data: any): DirectoryGroup[] {
  const directGroups: unknown[] = Array.isArray(data?.groups)
    ? data.groups
    : data?.groups
    ? [data.groups]
    : [];
  const memberOf: unknown[] = Array.isArray(data?.user?.MemberOf)
    ? data.user.MemberOf
    : data?.user?.MemberOf
    ? [data.user.MemberOf]
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

function getPopulatedAttributes(user: Record<string, unknown> | null | undefined): UserAttribute[] {
  if (!user || typeof user !== "object") return [];

  const preferredOrder = [
    "Name",
    "SamAccountName",
    "DisplayName",
    "GivenName",
    "Surname",
    "EmailAddress",
    "Enabled",
    "LockedOut",
    "Department",
    "Title",
    "Company",
    "Office",
    "Manager",
    "TelephoneNumber",
    "MobilePhone",
    "StreetAddress",
    "City",
    "State",
    "PostalCode",
    "Country",
    "Description",
    "LastLogonDate",
    "PasswordLastSet",
    "PasswordNeverExpires",
    "AccountExpirationDate",
    "WhenCreated",
    "WhenChanged",
    "DistinguishedName",
    "HomeDirectory",
    "HomeDrive",
    "ScriptPath",
    "ProfilePath",
    "MemberOf",
  ];
  const orderMap = new Map(preferredOrder.map((key, index) => [key, index]));

  return Object.entries(user)
    .map(([key, value]) => {
      const serialized = serializeAttributeValue(value);
      if (!serialized) return null;
      return {
        key,
        label: formatAttributeLabel(key),
        value: serialized,
      };
    })
    .filter((attribute): attribute is UserAttribute => !!attribute)
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
      <CopyButton value={value} copied={copied} setCopied={setCopied} className="opacity-0 group-hover:opacity-100" />
    </div>
  );
}

function AttributeViewer({ attributes }: { attributes: UserAttribute[] }) {
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
            <AttributeRow key={attribute.key} attribute={attribute} />
          ))}
        </div>
      )}
    </div>
  );
}

function AttributeRow({ attribute }: { attribute: UserAttribute }) {
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
