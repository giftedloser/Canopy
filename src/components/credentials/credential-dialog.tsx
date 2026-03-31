import { useState } from "react";
import { cn } from "@/lib/utils";
import { getStoredLastActiveServer, useCredentialStore } from "@/stores/credential-store";
import { testConnection } from "@/lib/tauri-ad";
import { normalizeConnectionPayload } from "@/lib/connection-response";
import {
  Server,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Network,
  X,
} from "lucide-react";

interface CredentialDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CredentialDialog({ open, onOpenChange }: CredentialDialogProps) {
  const { connectIntegratedSuccess, setServerOverride, isConnected } =
    useCredentialStore();
  const [serverOverride, setServerOverrideInput] = useState(() => getStoredLastActiveServer());
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const handleConnect = async () => {
    const srv = serverOverride.trim();

    setTesting(true);
    setError("");
    setSuccess(false);

    try {
      const result = await testConnection(srv || undefined);
      const normalized = normalizeConnectionPayload(result, srv);
      connectIntegratedSuccess(normalized);
      setServerOverride(srv);
      setSuccess(true);

      setTimeout(() => {
        onOpenChange(false);
        setSuccess(false);
      }, 600);
    } catch (err: any) {
      setError(err?.toString() || "Connection failed.");
    } finally {
      setTesting(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-[fade-in_0.15s_ease-out]"
        onClick={() => onOpenChange(false)}
      />

      <div className="relative w-full max-w-[400px] mx-4 animate-[scale-in_0.2s_ease-out]">
        <div className="bg-card border border-border rounded-xl shadow-2xl overflow-hidden">
          <div className="relative px-6 pt-8 pb-6 text-center">
            <div className="absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-primary/[0.06] to-transparent pointer-events-none" />

            <button
              onClick={() => onOpenChange(false)}
              className="absolute right-3 top-3 p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="relative">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-primary/15 mb-4">
                <Network className="w-6 h-6 text-primary" />
              </div>
              <h2 className="text-[17px] font-bold tracking-tight">
                Connect to Active Directory
              </h2>
              <p className="text-[13px] text-muted-foreground mt-1">
                Uses the currently logged-in domain account.
              </p>
            </div>
          </div>

          <div className="px-6 pb-6 space-y-3">
            <InputField
              icon={Server}
              label="Domain Controller (Optional Override)"
              placeholder="dc01.contoso.com"
              value={serverOverride}
              onChange={setServerOverrideInput}
              autoComplete="off"
              name="server-override"
              mono
              onKeyDown={(e) => e.key === "Enter" && handleConnect()}
            />

            {error && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/20">
                <AlertCircle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
                <p className="text-xs text-destructive leading-relaxed">{error}</p>
              </div>
            )}

            <button
              onClick={handleConnect}
              disabled={testing || success}
              className={cn(
                "w-full h-10 rounded-lg font-semibold text-[13px] transition-all duration-200 mt-2",
                success
                  ? "bg-success text-success-foreground"
                  : "bg-primary text-primary-foreground hover:bg-primary/90 active:scale-[0.98]",
                (testing || success) && "pointer-events-none"
              )}
            >
              {testing ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Testing connection...
                </span>
              ) : success ? (
                <span className="flex items-center justify-center gap-2">
                  <CheckCircle2 className="w-4 h-4" />
                  Connected
                </span>
              ) : (
                "Connect"
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function InputField({
  icon: Icon,
  label,
  placeholder,
  value,
  onChange,
  type = "text",
  mono = false,
  autoComplete,
  name,
  onKeyDown,
}: {
  icon: any;
  label: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  mono?: boolean;
  autoComplete?: string;
  name?: string;
  onKeyDown?: (e: React.KeyboardEvent) => void;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-[10px] font-bold uppercase tracking-[0.07em] text-muted-foreground/60">
        {label}
      </label>
      <div className="relative">
        <Icon className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/40" />
        <input
          type={type}
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete={autoComplete}
          name={name}
          onKeyDown={onKeyDown}
          spellCheck={false}
          autoCorrect="off"
          autoCapitalize="none"
          data-lpignore="true"
          data-1p-ignore="true"
          data-form-type="other"
          className={cn(
            "input-base w-full pl-9",
            mono && "font-mono"
          )}
        />
      </div>
    </div>
  );
}
