const isTauri = !!(window as any).__TAURI_INTERNALS__;

export async function isLaunchAtStartupEnabled(): Promise<boolean> {
  if (!isTauri) {
    return false;
  }

  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<boolean>("is_launch_at_startup_enabled");
}

export async function enableLaunchAtStartup(): Promise<void> {
  if (!isTauri) {
    return;
  }

  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("enable_launch_at_startup");
}

export async function disableLaunchAtStartup(): Promise<void> {
  if (!isTauri) {
    return;
  }

  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("disable_launch_at_startup");
}
