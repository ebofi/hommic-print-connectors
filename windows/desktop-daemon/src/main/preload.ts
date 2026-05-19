import { contextBridge, ipcRenderer } from "electron";

type JobUpdate = { id: string; printer: string; status: string };
type HeartbeatEvent = { lastHeartbeatAt: string };

contextBridge.exposeInMainWorld("daemonApi", {
  getState: () => ipcRenderer.invoke("daemon:get-state"),
  checkConnection: () => ipcRenderer.invoke("daemon:check-connection"),
  pairDaemon: (payload: { pairingCode: string; agentName: string }) => ipcRenderer.invoke("pair-daemon", payload),
  discoverPrinters: () => ipcRenderer.invoke("discover-printers"),
  quitApp: () => ipcRenderer.invoke("quit-app"),
  openSaas: () => ipcRenderer.invoke("open-saas"),
  checkForUpdates: () => ipcRenderer.invoke("updater:check-now"),
  setAutoUpdateEnabled: (enabled: boolean) => ipcRenderer.invoke("updater:set-auto-enabled", enabled),
  installUpdateNow: () => ipcRenderer.invoke("updater:install-now"),
  openReleasePage: () => ipcRenderer.invoke("updater:open-release-page"),
  start: () => ipcRenderer.invoke("daemon:start"),
  resync: () => ipcRenderer.invoke("daemon:resync"),
  stop: () => ipcRenderer.invoke("daemon:stop"),
  unpair: () => ipcRenderer.invoke("daemon:unpair"),
  hidePrinter: (tempId: string) => ipcRenderer.invoke("daemon:hide-printer", tempId),
  deletePrinter: (tempId: string) => ipcRenderer.invoke("daemon:delete-printer", tempId),
  saveSettings: (payload: { apiBaseUrl?: string; merchantSaasUrl?: string; agentName?: string; selectedPrinterTempId?: string; printerStations?: Record<string, string>; showVirtualPrinters?: boolean; hiddenPrinterTempIds?: string[] }) =>
    ipcRenderer.invoke("daemon:save-settings", payload),
  minimizeWindow: () => ipcRenderer.invoke("window:minimize"),
  toggleMaximizeWindow: () => ipcRenderer.invoke("window:toggle-maximize"),
  closeWindow: () => ipcRenderer.invoke("window:close"),
  onState: (callback: (state: unknown) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, payload: unknown) => callback(payload);
    ipcRenderer.on("daemon:state", handler);
    return () => ipcRenderer.removeListener("daemon:state", handler);
  },
  onJobUpdate: (callback: (payload: JobUpdate) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, payload: JobUpdate) => callback(payload);
    ipcRenderer.on("job-update", handler);
    return () => ipcRenderer.removeListener("job-update", handler);
  },
  onHeartbeat: (callback: (payload: HeartbeatEvent) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, payload: HeartbeatEvent) => callback(payload);
    ipcRenderer.on("heartbeat", handler);
    return () => ipcRenderer.removeListener("heartbeat", handler);
  },
});
