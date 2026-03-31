import { getCurrentWindow } from "@tauri-apps/api/window";

const isTauriWindow =
  typeof window !== "undefined" && Boolean((window as any).__TAURI_INTERNALS__);

function getAppWindow() {
  return isTauriWindow ? getCurrentWindow() : null;
}

export function supportsCustomWindowShell() {
  return isTauriWindow;
}

export async function getWindowMaximizedState() {
  const appWindow = getAppWindow();
  if (!appWindow) return false;
  return appWindow.isMaximized();
}

export async function onWindowResized(
  handler: () => void | Promise<void>
) {
  const appWindow = getAppWindow();
  if (!appWindow) return () => {};
  return appWindow.onResized(() => {
    void handler();
  });
}

export async function minimizeAppWindow() {
  const appWindow = getAppWindow();
  if (!appWindow) return;
  await appWindow.minimize();
}

export async function startAppWindowDragging() {
  const appWindow = getAppWindow();
  if (!appWindow) return;
  await appWindow.startDragging();
}

export async function toggleAppWindowMaximize() {
  const appWindow = getAppWindow();
  if (!appWindow) return;
  await appWindow.toggleMaximize();
}

export async function closeAppWindow() {
  const appWindow = getAppWindow();
  if (!appWindow) return;
  await appWindow.close();
}
