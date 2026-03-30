import { create } from "zustand";

export interface ElevationCredentials {
  domain: string;
  username: string;
  password: string;
}

interface ElevationState {
  open: boolean;
  reason: string;
  initialDomain: string;
  initialUsername: string;
  resolver: ((creds: ElevationCredentials | null) => void) | null;

  requestElevation: (
    reason: string,
    initialDomain: string,
    initialUsername?: string
  ) => Promise<ElevationCredentials | null>;
  submitElevation: (creds: ElevationCredentials) => void;
  cancelElevation: () => void;
}

export const useElevationStore = create<ElevationState>((set, get) => ({
  open: false,
  reason: "",
  initialDomain: "",
  initialUsername: "",
  resolver: null,

  requestElevation: (reason, initialDomain, initialUsername = "") =>
    new Promise((resolve) => {
      const pending = get().resolver;
      if (pending) pending(null);

      set({
        open: true,
        reason,
        initialDomain: initialDomain.trim(),
        initialUsername: initialUsername.trim(),
        resolver: resolve,
      });
    }),

  submitElevation: (creds) => {
    const resolver = get().resolver;
    if (resolver) resolver(creds);
    set({
      open: false,
      reason: "",
      initialDomain: "",
      initialUsername: "",
      resolver: null,
    });
  },

  cancelElevation: () => {
    const resolver = get().resolver;
    if (resolver) resolver(null);
    set({
      open: false,
      reason: "",
      initialDomain: "",
      initialUsername: "",
      resolver: null,
    });
  },
}));
