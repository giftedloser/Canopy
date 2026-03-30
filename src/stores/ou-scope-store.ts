import { create } from "zustand";

interface OuScopeState {
  /** Set of OU distinguished names that are enabled (visible). Empty = all visible. */
  enabledOus: Set<string>;
  /** Whether scoping is active (user has configured restrictions). */
  scopeActive: boolean;

  setEnabledOus: (ous: Set<string>) => void;
  setScopeActive: (active: boolean) => void;
  isOuVisible: (dn: string) => boolean;
}

function loadFromStorage(): { enabledOus: Set<string>; scopeActive: boolean } {
  try {
    const raw = localStorage.getItem("ou-scope");
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        enabledOus: new Set(parsed.enabledOus ?? []),
        scopeActive: parsed.scopeActive ?? false,
      };
    }
  } catch {
    // ignore
  }
  return { enabledOus: new Set(), scopeActive: false };
}

function saveToStorage(enabledOus: Set<string>, scopeActive: boolean) {
  localStorage.setItem(
    "ou-scope",
    JSON.stringify({
      enabledOus: Array.from(enabledOus),
      scopeActive,
    })
  );
}

const initial = loadFromStorage();

export const useOuScopeStore = create<OuScopeState>((set, get) => ({
  enabledOus: initial.enabledOus,
  scopeActive: initial.scopeActive,

  setEnabledOus: (ous) => {
    saveToStorage(ous, get().scopeActive);
    set({ enabledOus: ous });
  },

  setScopeActive: (active) => {
    saveToStorage(get().enabledOus, active);
    set({ scopeActive: active });
  },

  isOuVisible: (dn) => {
    const state = get();
    if (!state.scopeActive || state.enabledOus.size === 0) return true;
    // Check if this OU or any of its ancestors is enabled
    const dnLower = dn.toLowerCase();
    for (const enabled of state.enabledOus) {
      const enabledLower = enabled.toLowerCase();
      if (dnLower === enabledLower || dnLower.endsWith("," + enabledLower)) {
        return true;
      }
    }
    return false;
  },
}));
