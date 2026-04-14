import { toast } from "sonner";
import { isElevationCancelledError } from "@/lib/tauri-ad";

function readErrorMessage(error: unknown): string | null {
  if (typeof error === "string") {
    const trimmed = error.trim();
    return trimmed || null;
  }

  if (error instanceof Error) {
    const trimmed = error.message.trim();
    return trimmed || null;
  }

  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string") {
      const trimmed = message.trim();
      if (trimmed) return trimmed;
    }
  }

  const rendered = String(error ?? "").trim();
  return rendered && rendered !== "[object Object]" ? rendered : null;
}

export function formatErrorMessage(error: unknown, fallback: string) {
  return readErrorMessage(error) ?? fallback;
}

export function notifyActionError(
  error: unknown,
  options: {
    fallback: string;
    cancelled?: string;
  }
) {
  if (isElevationCancelledError(error)) {
    toast.message(options.cancelled ?? "Action cancelled");
    return;
  }

  toast.error(formatErrorMessage(error, options.fallback));
}
