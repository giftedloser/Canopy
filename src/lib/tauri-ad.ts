import { invoke } from "@tauri-apps/api/core";
import { useElevationStore } from "@/stores/elevation-store";
import { useCredentialStore } from "@/stores/credential-store";

// Detect if running inside Tauri or plain browser
const isTauri = !!(window as any).__TAURI_INTERNALS__;

function toError(err: unknown, cmd: string): Error {
  if (err instanceof Error) return err;
  if (typeof err === "string") return new Error(err);
  if (err && typeof err === "object") {
    const maybeMessage = (err as { message?: unknown }).message;
    if (typeof maybeMessage === "string" && maybeMessage.trim()) {
      return new Error(maybeMessage);
    }
    try {
      return new Error(JSON.stringify(err));
    } catch {
      return new Error(`Command '${cmd}' failed`);
    }
  }
  return new Error(`Command '${cmd}' failed`);
}

export class ElevationCancelledError extends Error {
  constructor() {
    super("Operation cancelled.");
    this.name = "ElevationCancelledError";
  }
}

export function isElevationCancelledError(err: unknown): boolean {
  return (
    err instanceof ElevationCancelledError ||
    (typeof err === "object" &&
      err !== null &&
      "name" in err &&
      (err as { name?: string }).name === "ElevationCancelledError")
  );
}

async function tauriInvoke<T>(
  cmd: string,
  args?: Record<string, unknown>
): Promise<T> {
  if (!isTauri) {
    throw new Error(
      "Not running inside Tauri. Launch with `npm run tauri dev` to connect to Active Directory."
    );
  }
  try {
    return await invoke<T>(cmd, args);
  } catch (err) {
    throw toError(err, cmd);
  }
}

function getConnectionContext() {
  const state = useCredentialStore.getState();
  if (!state.isConnected || !state.connectionInfo) {
    throw new Error("Not connected to Active Directory");
  }

  return state.connectionInfo;
}

function getEffectiveServer() {
  const ctx = getConnectionContext();
  const server =
    ctx.activeServer?.trim() ||
    ctx.serverOverride?.trim() ||
    ctx.resolvedServer?.trim();
  if (!server) {
    throw new Error(
      "No domain controller is selected. Reconnect and specify a domain controller override."
    );
  }
  return server;
}

function getElevationDefaultDomain() {
  const ctx = getConnectionContext();
  const fromConnectedAs = ctx.connectedAs.includes("\\")
    ? ctx.connectedAs.split("\\")[0]
    : "";
  return fromConnectedAs || ctx.domainName || "";
}

const ELEVATION_USERNAME_STORAGE_KEY = "fuzzy-directory.elevation-username";

function getStoredElevationUsername() {
  if (typeof window === "undefined") return "";
  try {
    return window.localStorage.getItem(ELEVATION_USERNAME_STORAGE_KEY)?.trim() || "";
  } catch {
    return "";
  }
}

function getConnectedUsername() {
  const ctx = getConnectionContext();
  if (ctx.connectedAs.includes("\\")) {
    return ctx.connectedAs.split("\\").pop()?.trim() || "";
  }
  return ctx.connectedAs.trim();
}

function getElevationDefaultUsername() {
  return getStoredElevationUsername() || getConnectedUsername();
}

async function invokeRead<T>(cmd: string, args?: Record<string, unknown>) {
  return tauriInvoke<T>(cmd, { server: getEffectiveServer(), ...(args ?? {}) });
}

async function invokeWriteWithElevation<T>(
  cmd: string,
  reason: string,
  args?: Record<string, unknown>
) {
  const server = getEffectiveServer();
  const creds = await useElevationStore
    .getState()
    .requestElevation(reason, getElevationDefaultDomain(), getElevationDefaultUsername());

  if (!creds) {
    throw new ElevationCancelledError();
  }

  return tauriInvoke<T>(cmd, {
    ...args,
    domain: creds.domain,
    username: creds.username,
    password: creds.password,
    server,
  });
}

// Connection
export async function testConnection(serverOverride?: string) {
  const normalized = serverOverride?.trim() || undefined;
  return tauriInvoke<string>("test_connection", {
    // Send both key styles for compatibility with different command arg mappers.
    serverOverride: normalized,
    server_override: normalized,
  });
}

export async function getDashboardStats(ouScopes?: string[]) {
  return invokeRead<string>("get_dashboard_stats", {
    ouScopes,
    ou_scopes: ouScopes,
  });
}


export async function getComputerOsBreakdown(ouScopes?: string[]) {
  return invokeRead<string>("get_computer_os_breakdown", {
    ouScopes,
    ou_scopes: ouScopes,
  });
}

// Users (read)
export async function getUsers(search?: string, filter?: string, ouScopes?: string[]) {
  return invokeRead<string>("get_users", { search, filter, ouScopes, ou_scopes: ouScopes });
}

export async function getUsersPage(params: {
  search?: string;
  filter?: string;
  ouScopes?: string[];
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortDir?: "asc" | "desc";
  fetchAll?: boolean;
  lookupMode?: boolean;
}) {
  return invokeRead<string>("get_users", {
    search: params.search,
    filter: params.filter,
    ouScopes: params.ouScopes,
    ou_scopes: params.ouScopes,
    page: params.page,
    page_size: params.pageSize,
    pageSize: params.pageSize,
    sort_by: params.sortBy,
    sortBy: params.sortBy,
    sort_dir: params.sortDir,
    sortDir: params.sortDir,
    fetch_all: params.fetchAll,
    fetchAll: params.fetchAll,
    lookup_mode: params.lookupMode,
    lookupMode: params.lookupMode,
  });
}

export async function getUserDetail(samAccountName: string) {
  return invokeRead<string>("get_user_detail", {
    samAccountName,
    sam_account_name: samAccountName,
  });
}

// Users (write)
export async function resetUserPassword(
  samAccountName: string,
  newPassword: string
) {
  return invokeWriteWithElevation<string>(
    "reset_user_password",
    `Reset password for ${samAccountName}`,
    { samAccountName, newPassword }
  );
}

export async function unlockUser(samAccountName: string) {
  return invokeWriteWithElevation<string>(
    "unlock_user",
    `Unlock account ${samAccountName}`,
    { samAccountName }
  );
}

export async function toggleUser(samAccountName: string, enable: boolean) {
  return invokeWriteWithElevation<string>(
    "toggle_user",
    `${enable ? "Enable" : "Disable"} account ${samAccountName}`,
    { samAccountName, enable }
  );
}

export async function createUser(params: {
  samAccountName: string;
  displayName: string;
  firstName: string;
  lastName: string;
  email?: string;
  department?: string;
  title?: string;
  userPassword: string;
  ouPath: string;
}) {
  return invokeWriteWithElevation<string>(
    "create_user",
    `Create user ${params.samAccountName}`,
    params
  );
}

export async function updateUser(
  samAccountName: string,
  properties: Record<string, string>
) {
  return invokeWriteWithElevation<string>(
    "update_user",
    `Update user ${samAccountName}`,
    { samAccountName, properties }
  );
}

export async function moveUser(samAccountName: string, targetOu: string) {
  return invokeWriteWithElevation<string>(
    "move_user",
    `Move user ${samAccountName}`,
    { samAccountName, targetOu }
  );
}

// Computers (read)
export async function getComputers(search?: string, ouScopes?: string[]) {
  return invokeRead<string>("get_computers", { search, ouScopes, ou_scopes: ouScopes });
}

export async function getComputersPage(params: {
  search?: string;
  ouScopes?: string[];
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortDir?: "asc" | "desc";
  fetchAll?: boolean;
  lookupMode?: boolean;
}) {
  return invokeRead<string>("get_computers", {
    search: params.search,
    ouScopes: params.ouScopes,
    ou_scopes: params.ouScopes,
    page: params.page,
    page_size: params.pageSize,
    pageSize: params.pageSize,
    sort_by: params.sortBy,
    sortBy: params.sortBy,
    sort_dir: params.sortDir,
    sortDir: params.sortDir,
    fetch_all: params.fetchAll,
    fetchAll: params.fetchAll,
    lookup_mode: params.lookupMode,
    lookupMode: params.lookupMode,
  });
}

export async function getComputerDetail(computerName: string) {
  return invokeRead<string>("get_computer_detail", {
    computerName,
    computer_name: computerName,
  });
}

// Computers (write)
export async function toggleComputer(computerName: string, enable: boolean) {
  return invokeWriteWithElevation<string>(
    "toggle_computer",
    `${enable ? "Enable" : "Disable"} computer ${computerName}`,
    { computerName, enable }
  );
}

export async function moveComputer(computerName: string, targetOu: string) {
  return invokeWriteWithElevation<string>(
    "move_computer",
    `Move computer ${computerName}`,
    { computerName, targetOu }
  );
}

// Groups (read)
export async function getGroups(search?: string, ouScopes?: string[]) {
  return invokeRead<string>("get_groups", { search, ouScopes, ou_scopes: ouScopes });
}

export async function getGroupsPage(params: {
  search?: string;
  ouScopes?: string[];
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortDir?: "asc" | "desc";
  includeMemberCounts?: boolean;
  lookupMode?: boolean;
}) {
  return invokeRead<string>("get_groups", {
    search: params.search,
    ouScopes: params.ouScopes,
    ou_scopes: params.ouScopes,
    page: params.page,
    page_size: params.pageSize,
    pageSize: params.pageSize,
    sort_by: params.sortBy,
    sortBy: params.sortBy,
    sort_dir: params.sortDir,
    sortDir: params.sortDir,
    include_member_counts: params.includeMemberCounts,
    includeMemberCounts: params.includeMemberCounts,
    lookup_mode: params.lookupMode,
    lookupMode: params.lookupMode,
  });
}

export async function getGroupMembers(groupName: string) {
  return invokeRead<string>("get_group_members", { groupName });
}

export async function getGroupMemberCounts(groupDns: string[]) {
  return invokeRead<string>("get_group_member_counts", {
    groupDns,
    group_dns: groupDns,
  });
}

// Groups (write)
export async function addGroupMember(groupName: string, memberSam: string) {
  return invokeWriteWithElevation<string>(
    "add_group_member",
    `Add ${memberSam} to ${groupName}`,
    { groupName, memberSam }
  );
}

export async function removeGroupMember(groupName: string, memberSam: string) {
  return invokeWriteWithElevation<string>(
    "remove_group_member",
    `Remove ${memberSam} from ${groupName}`,
    { groupName, memberSam }
  );
}

export async function createGroup(params: {
  name: string;
  samAccountName: string;
  groupScope: string;
  groupCategory: string;
  description?: string;
  ouPath: string;
}) {
  return invokeWriteWithElevation<string>(
    "create_group",
    `Create group ${params.samAccountName}`,
    params
  );
}

// Directory (OU tree)
export async function getOuTree() {
  return invokeRead<string>("get_ou_tree");
}

export async function getOuContents(ouDn: string) {
  return invokeRead<string>("get_ou_contents", { ouDn });
}

// Reports
export async function runReport(reportType: string, ouScopes?: string[]) {
  return invokeRead<string>("run_report", {
    reportType,
    ouScopes,
    ou_scopes: ouScopes,
  });
}

export function getPreferredElevationUsername() {
  return getStoredElevationUsername();
}

export function setPreferredElevationUsername(username: string) {
  if (typeof window === "undefined") return;
  try {
    const trimmed = username.trim();
    if (trimmed) {
      window.localStorage.setItem(ELEVATION_USERNAME_STORAGE_KEY, trimmed);
    } else {
      window.localStorage.removeItem(ELEVATION_USERNAME_STORAGE_KEY);
    }
  } catch {
    // Ignore storage errors; writes will still work with manual entry in the dialog.
  }
}
