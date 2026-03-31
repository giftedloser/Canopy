import type { QueryClient, QueryKey } from "@tanstack/react-query";

const STORAGE_KEY = "fuzzy-directory.query-cache.v1";
const STORAGE_VERSION = 2;
const MAX_SCOPE_BYTES = 3 * 1024 * 1024;
const MAX_ENTRY_BYTES = 512 * 1024;
const MAX_AGE_MS = 12 * 60 * 60 * 1000;

const PERSISTED_QUERY_ROOTS = new Set([
  "dashboard-stats",
  "computer-os-breakdown",
  "report",
  "users-snapshot",
  "computers-snapshot",
  "groups",
  "group-members",
  "ou-tree",
  "ou-contents",
]);

export interface QueryPersistenceConnection {
  domainName: string;
  activeServer: string;
  connectedAs: string;
}

interface PersistedQueryEntry {
  scope: string;
  keyHash: string;
  queryKey: QueryKey;
  data: unknown;
  dataUpdatedAt: number;
  savedAt: number;
  expiresAt: number;
  sizeBytes: number;
}

interface PersistedQueryEnvelope {
  version: number;
  entries: PersistedQueryEntry[];
}

function getStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function getQueryRoot(queryKey: QueryKey): string | null {
  const root = Array.isArray(queryKey) ? queryKey[0] : null;
  return typeof root === "string" ? root : null;
}

function buildScope(connection: QueryPersistenceConnection): string {
  return [
    connection.domainName.trim().toLowerCase(),
    connection.activeServer.trim().toLowerCase(),
    connection.connectedAs.trim().toLowerCase(),
  ].join("::");
}

function getEndOfDay(now: number): number {
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);
  return end.getTime();
}

function getExpiresAt(now: number): number {
  return Math.min(now + MAX_AGE_MS, getEndOfDay(now));
}

function serializeQueryKey(queryKey: QueryKey): string {
  try {
    return JSON.stringify(queryKey);
  } catch {
    return "";
  }
}

function loadEnvelope(): PersistedQueryEnvelope {
  const storage = getStorage();
  if (!storage) {
    return { version: STORAGE_VERSION, entries: [] };
  }

  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) {
      return { version: STORAGE_VERSION, entries: [] };
    }

    const parsed = JSON.parse(raw) as Partial<PersistedQueryEnvelope>;
    if (parsed.version !== STORAGE_VERSION || !Array.isArray(parsed.entries)) {
      return { version: STORAGE_VERSION, entries: [] };
    }

    return {
      version: STORAGE_VERSION,
      entries: parsed.entries.filter((entry): entry is PersistedQueryEntry => {
        return (
          !!entry &&
          typeof entry.scope === "string" &&
          typeof entry.keyHash === "string" &&
          Array.isArray(entry.queryKey) &&
          "data" in entry &&
          typeof entry.dataUpdatedAt === "number" &&
          typeof entry.savedAt === "number" &&
          typeof entry.expiresAt === "number" &&
          typeof entry.sizeBytes === "number"
        );
      }),
    };
  } catch {
    return { version: STORAGE_VERSION, entries: [] };
  }
}

function saveEnvelope(envelope: PersistedQueryEnvelope) {
  const storage = getStorage();
  if (!storage) return;

  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(envelope));
  } catch {
    // Ignore quota/storage errors and fall back to memory-only caching.
  }
}

function pruneEnvelope(envelope: PersistedQueryEnvelope, now = Date.now()): PersistedQueryEnvelope {
  return {
    version: STORAGE_VERSION,
    entries: envelope.entries.filter((entry) => {
      if (entry.expiresAt <= now) return false;
      return PERSISTED_QUERY_ROOTS.has(getQueryRoot(entry.queryKey) ?? "");
    }),
  };
}

export function hydrateConnectionScopedQueries(
  queryClient: QueryClient,
  connection: QueryPersistenceConnection
) {
  const scope = buildScope(connection);
  const envelope = pruneEnvelope(loadEnvelope());

  saveEnvelope(envelope);

  const scopedEntries = envelope.entries
    .filter((entry) => entry.scope === scope)
    .sort((a, b) => a.dataUpdatedAt - b.dataUpdatedAt);

  for (const entry of scopedEntries) {
    queryClient.setQueryData(entry.queryKey, entry.data, {
      updatedAt: entry.dataUpdatedAt,
    });
  }
}

export function setupQueryPersistence(
  queryClient: QueryClient,
  getConnection: () => QueryPersistenceConnection | null
) {
  let flushTimer: ReturnType<typeof setTimeout> | null = null;

  const flush = () => {
    flushTimer = null;

    const connection = getConnection();
    if (!connection) return;

    const now = Date.now();
    const scope = buildScope(connection);
    const existingEnvelope = pruneEnvelope(loadEnvelope(), now);
    const existingEntries = new Map<string, PersistedQueryEntry>();

    for (const entry of existingEnvelope.entries) {
      if (entry.scope === scope) {
        existingEntries.set(entry.keyHash, entry);
      }
    }

    const currentEntries = queryClient
      .getQueryCache()
      .getAll()
      .flatMap((query): PersistedQueryEntry[] => {
        const root = getQueryRoot(query.queryKey);
        if (!root || !PERSISTED_QUERY_ROOTS.has(root)) return [];
        if (query.state.status !== "success" || query.state.data === undefined) return [];

        const keyHash = serializeQueryKey(query.queryKey);
        if (!keyHash) return [];

        let serializedData = "";
        try {
          serializedData = JSON.stringify(query.state.data);
        } catch {
          return [];
        }

        const sizeBytes = serializedData.length;
        if (sizeBytes > MAX_ENTRY_BYTES) return [];

        return [{
          scope,
          keyHash,
          queryKey: query.queryKey,
          data: query.state.data,
          dataUpdatedAt: query.state.dataUpdatedAt || now,
          savedAt: now,
          expiresAt: getExpiresAt(now),
          sizeBytes,
        }];
      })
      .sort((a, b) => b.dataUpdatedAt - a.dataUpdatedAt);

    for (const entry of currentEntries) {
      existingEntries.set(entry.keyHash, entry);
    }

    const mergedScopeEntries = Array.from(existingEntries.values())
      .sort((a, b) => b.dataUpdatedAt - a.dataUpdatedAt);

    const keptScopeEntries: PersistedQueryEntry[] = [];
    let totalBytes = 0;

    for (const entry of mergedScopeEntries) {
      if (totalBytes + entry.sizeBytes > MAX_SCOPE_BYTES) continue;
      keptScopeEntries.push(entry);
      totalBytes += entry.sizeBytes;
    }

    const nextEnvelope: PersistedQueryEnvelope = {
      version: STORAGE_VERSION,
      entries: [
        ...existingEnvelope.entries.filter((entry) => entry.scope !== scope),
        ...keptScopeEntries,
      ],
    };

    saveEnvelope(nextEnvelope);
  };

  const scheduleFlush = () => {
    if (flushTimer) {
      clearTimeout(flushTimer);
    }
    flushTimer = setTimeout(flush, 250);
  };

  const unsubscribe = queryClient.getQueryCache().subscribe((event) => {
    const root = getQueryRoot(event?.query?.queryKey ?? []);
    if (!root || !PERSISTED_QUERY_ROOTS.has(root)) return;
    if (event?.query?.state.status !== "success") return;
    scheduleFlush();
  });

  if (typeof window !== "undefined") {
    window.addEventListener("beforeunload", flush);
  }

  return () => {
    unsubscribe();
    if (flushTimer) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }
    if (typeof window !== "undefined") {
      window.removeEventListener("beforeunload", flush);
    }
  };
}
