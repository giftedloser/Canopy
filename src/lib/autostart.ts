import { invoke } from "@tauri-apps/api/core";

const isTauri = !!(window as any).__TAURI_INTERNALS__;

export async function isLaunchAtStartupEnabled(): Promise<boolean> {
  if (!isTauri) {
    return false;
  }

  return invoke<boolean>("is_launch_at_startup_enabled");
}

export async function enableLaunchAtStartup(): Promise<void> {
  if (!isTauri) {
    return;
  }

  await invoke("enable_launch_at_startup");
}

export async function disableLaunchAtStartup(): Promise<void> {
  if (!isTauri) {
    return;
  }

  await invoke("disable_launch_at_startup");
}
