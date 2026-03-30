const isTauri = !!(window as any).__TAURI_INTERNALS__;

export async function isLaunchAtStartupEnabled(): Promise<boolean> {
  if (!isTauri) {
    return false;
  }

  const { isEnabled } = await import("@tauri-apps/plugin-autostart");
  return isEnabled();
}

export async function enableLaunchAtStartup(): Promise<void> {
  if (!isTauri) {
    return;
  }

  const { enable } = await import("@tauri-apps/plugin-autostart");
  await enable();
}

export async function disableLaunchAtStartup(): Promise<void> {
  if (!isTauri) {
    return;
  }

  const { disable } = await import("@tauri-apps/plugin-autostart");
  await disable();
}
