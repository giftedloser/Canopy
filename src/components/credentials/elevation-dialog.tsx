import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { useElevationStore } from "@/stores/elevation-store";
import { AlertCircle, Lock, ShieldAlert, User, X } from "lucide-react";

export function ElevationDialog() {
  const { open, reason, initialDomain, initialUsername, submitElevation, cancelElevation } =
    useElevationStore();
  const [domain, setDomain] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) {
      setDomain("");
      setUsername("");
      setPassword("");
      setError("");
      return;
    }

    setDomain(initialDomain);
    setUsername(initialUsername); // pre-fill admin account; password always blank
    setPassword("");
    setError("");
  }, [open, initialDomain, initialUsername]);

  if (!open) return null;

  const handleSubmit = () => {
    const dom = domain.trim();
    const usr = username.trim();
    if (!dom || !usr || !password) {
      setError("Domain, username, and password are required.");
      return;
    }

    submitElevation({ domain: dom, username: usr, password });
    setPassword("");
  };

  const handleCancel = () => {
    setPassword("");
    cancelElevation();
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={handleCancel}
      />
      <div className="relative w-full max-w-[420px] mx-4">
        <div className="bg-card border border-border rounded-xl shadow-2xl overflow-hidden">
          <div className="relative px-6 pt-6 pb-5">
            <button
              onClick={handleCancel}
              className="absolute right-3 top-3 p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
            <div className="inline-flex items-center justify-center w-10 h-10 rounded-2xl bg-warning/15 mb-3">
              <ShieldAlert className="w-5 h-5 text-warning" />
            </div>
            <h2 className="text-[16px] font-bold tracking-tight">Elevation Required</h2>
            <p className="text-[13px] text-muted-foreground mt-1">
              Enter admin credentials to continue.
            </p>
            {reason && (
              <p className="text-[11px] text-muted-foreground/70 mt-2 font-mono bg-secondary px-2 py-1 rounded-md">{reason}</p>
            )}
          </div>

          <div className="px-6 pb-6 space-y-3">
            <InputField
              icon={User}
              label="Domain"
              placeholder="contoso.com"
              value={domain}
              onChange={setDomain}
              autoComplete="organization"
              mono
            />
            <InputField
              icon={User}
              label="Admin Username"
              placeholder="administrator"
              value={username}
              onChange={setUsername}
              autoComplete="username"
            />
            <InputField
              icon={Lock}
              label="Password"
              placeholder="Password"
              type="password"
              value={password}
              onChange={setPassword}
              autoComplete="current-password"
              onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
            />

            {error && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/20">
                <AlertCircle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
                <p className="text-xs text-destructive leading-relaxed">{error}</p>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <button
                onClick={handleCancel}
                className="h-8 px-4 rounded-md border border-border text-[12px] font-medium text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                className="h-8 px-4 rounded-md bg-primary text-primary-foreground text-[12px] font-semibold hover:opacity-90 transition-opacity"
              >
                Continue
              </button>
            </div>
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
          onKeyDown={onKeyDown}
          className={cn("input-base w-full pl-9", mono && "font-mono")}
        />
      </div>
    </div>
  );
}
