import { app, BrowserWindow, Menu, Tray, ipcMain, nativeImage, shell } from "electron";
import { join } from "node:path";

import { DaemonService } from "../agent/service";
import { DesktopUpdaterService } from "./updater";

const daemon = new DaemonService();
const updater = new DesktopUpdaterService(() => daemon.getSettings(), (next) => daemon.setUpdaterState(next));
let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;

function assetPath(...segments: string[]) {
  return join(__dirname, "..", "renderer", "assets", ...segments);
}

function loadAppIcon() {
  const icon = nativeImage.createFromPath(assetPath("softwarelogo.png"));
  return icon.isEmpty() ? nativeImage.createEmpty() : icon;
}

function createWindow() {
  const isMac = process.platform === "darwin";
  mainWindow = new BrowserWindow({
    width: 860,
    height: 600,
    minWidth: 860,
    minHeight: 560,
    show: false,
    resizable: true,
    frame: false,
    titleBarStyle: isMac ? "hidden" : undefined,
    backgroundColor: "#0f0f0f",
    icon: loadAppIcon(),
    webPreferences: {
      preload: join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile(join(__dirname, "..", "renderer", "index.html"));
  mainWindow.once("ready-to-show", () => mainWindow?.show());
  mainWindow.on("close", (event) => {
    if (!app.isQuiting) {
      event.preventDefault();
      mainWindow?.hide();
    }
  });

  daemon.attachWindow(mainWindow);
}

function createTray() {
  tray = new Tray(loadAppIcon().resize({ width: 18, height: 18 }));
  tray.setToolTip("Hommic Print Daemon");
  tray.on("double-click", () => {
    mainWindow?.show();
    mainWindow?.focus();
  });
  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: "Open Hommic Print Daemon",
        click: () => {
          mainWindow?.show();
          mainWindow?.focus();
        },
      },
      {
        label: "Open SaaS",
        click: () => void shell.openExternal("https://hommic.co.uk"),
      },
      {
        label: "Check for Updates",
        click: () => void updater.checkForUpdates(true),
      },
      {
        label: "Start Background Sync",
        click: () => void daemon.start(),
      },
      {
        label: "Stop Background Sync",
        click: () => daemon.stop(),
      },
      { type: "separator" },
      {
        label: "Quit",
        click: () => {
          app.isQuiting = true;
          app.quit();
        },
      },
    ]),
  );
}

function registerIpc() {
  ipcMain.handle("daemon:get-state", () => daemon.getState());
  ipcMain.handle("daemon:check-connection", () => daemon.checkConnection());
  ipcMain.handle("pair-daemon", async (_event, payload: { pairingCode: string; agentName: string }) =>
    daemon.pair(payload.pairingCode, payload.agentName),
  );
  ipcMain.handle("discover-printers", () => daemon.discoverPrinters());
  ipcMain.handle("quit-app", () => {
    app.isQuiting = true;
    app.quit();
  });
  ipcMain.handle("open-saas", () => shell.openExternal(daemon.getState().merchantSaasUrl));
  ipcMain.handle("daemon:start", () => daemon.start());
  ipcMain.handle("daemon:resync", () => daemon.resync());
  ipcMain.handle("daemon:stop", () => {
    daemon.stop();
    return daemon.getState();
  });
  ipcMain.handle("daemon:unpair", () => daemon.unpair());
  ipcMain.handle("daemon:hide-printer", (_event, tempId: string) => daemon.hidePrinter(tempId));
  ipcMain.handle("daemon:delete-printer", (_event, tempId: string) => daemon.deletePrinter(tempId));
  ipcMain.handle("daemon:save-settings", (_event, payload) => daemon.saveSettings(payload));
  ipcMain.handle("updater:check-now", () => updater.checkForUpdates(true));
  ipcMain.handle("updater:set-auto-enabled", async (_event, enabled: boolean) => {
    await daemon.saveSettings({ autoUpdateEnabled: enabled });
    await updater.setAutoUpdateEnabled(enabled);
    return daemon.getState();
  });
  ipcMain.handle("updater:install-now", () => updater.installDownloadedUpdate());
  ipcMain.handle("updater:open-release-page", () => updater.openReleasePage());
  ipcMain.handle("window:minimize", () => mainWindow?.minimize());
  ipcMain.handle("window:toggle-maximize", () => {
    if (!mainWindow) return false;
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
    return mainWindow.isMaximized();
  });
  ipcMain.handle("window:close", () => {
    if (process.platform === "darwin") {
      mainWindow?.hide();
      return;
    }
    app.isQuiting = true;
    app.quit();
  });
}

declare global {
  namespace Electron {
    interface App {
      isQuiting?: boolean;
    }
  }
}

app.whenReady().then(async () => {
  app.setAppUserModelId("com.hommic.printdaemon");
  registerIpc();
  createWindow();
  createTray();
  await daemon.start();
  await updater.initialize().catch((error: unknown) => {
    daemon.setUpdaterState({
      status: "error",
      message: error instanceof Error ? error.message : "Failed to initialize auto-update.",
    });
  });
});

app.on("window-all-closed", () => {
  // Tray app stays alive until explicitly quit.
});

app.on("activate", () => {
  if (!mainWindow) createWindow();
  mainWindow?.show();
});
