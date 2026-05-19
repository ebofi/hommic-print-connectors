import { app, BrowserWindow } from "electron";
import { lookup } from "node:dns/promises";

import { SettingsStore } from "../config/store";
import { discoverWindowsPrinters } from "../discovery/windows-printers";
import { processPrintJob } from "../drivers/print-router";
import { collectWindowsRuntimeTelemetry } from "../system/windows-runtime";
import type { ConnectionCheckResult, DaemonSettings, DaemonState, PrintJob, PrinterDiscoveryRecord, RuntimeCompatibility, UpdaterState } from "../types";
import { PrintApiClient } from "./client";

const APP_VERSION = app.getVersion();
const HEARTBEAT_STALE_MULTIPLIER = 3;
const HEARTBEAT_STALE_MIN_SECONDS = 45;
const REALTIME_FALLBACK_POLL_MS = 2000;

export class DaemonService {
  private readonly store = new SettingsStore();
  private settings: DaemonSettings = this.store.read();
  private readonly api = new PrintApiClient(() => this.settings.apiBaseUrl, () => this.settings.accessToken);
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private jobsTimer: NodeJS.Timeout | null = null;
  private jobsPollInFlight = false;
  private discoveredPrinters: PrinterDiscoveryRecord[] = [];
  private activeJobs: Array<{ id: string; printer: string; status: string }> = [];
  private logs: string[] = [];
  private running = false;
  private window: BrowserWindow | null = null;
  private runtimeCompatibility: RuntimeCompatibility | null = null;
  private realtimeSocket: WebSocket | null = null;
  private realtimeConnected = false;
  private realtimeReconnectTimer: NodeJS.Timeout | null = null;
  private updater: UpdaterState = {
    appVersion: app.getVersion(),
    autoUpdateEnabled: this.settings.autoUpdateEnabled,
    status: "idle",
    message: "Update checks ready.",
    latestVersion: "",
    downloadedPercent: 0,
    releaseName: "",
    releaseNotes: "",
    releasePageUrl: "",
    gitTag: "",
    copyrightNotice: "Copyright (c) Hommic. All rights reserved.",
  };

  attachWindow(window: BrowserWindow) {
    this.window = window;
    this.emitState();
  }

  getSettings() {
    return this.settings;
  }

  getState(): DaemonState {
    const connectivity = !this.settings.accessToken
      ? "unknown"
      : this.isHeartbeatFresh()
        ? "online"
        : this.settings.lastHeartbeatAt
          ? "offline"
          : "unknown";
    return {
      paired: Boolean(this.settings.accessToken),
      running: this.running,
      apiBaseUrl: this.settings.apiBaseUrl,
      merchantSaasUrl: this.settings.merchantSaasUrl,
      agentName: this.settings.agentName,
      selectedPrinterTempId: this.settings.selectedPrinterTempId,
      printerStations: this.settings.printerStations,
      showVirtualPrinters: this.settings.showVirtualPrinters,
      hiddenPrinterTempIds: this.settings.hiddenPrinterTempIds,
      pairedAgentId: this.settings.pairedAgentId,
      connectivity,
      lastHeartbeatAt: this.settings.lastHeartbeatAt,
      lastPairingCode: this.settings.lastPairingCode,
      discoveredPrinters: this.discoveredPrinters,
      activeJobs: this.activeJobs,
      logs: this.logs.slice(0, 100),
      updater: this.updater,
      runtimeCompatibility: this.runtimeCompatibility,
    };
  }

  async saveSettings(next: Partial<DaemonSettings>) {
    this.settings = this.store.write(next);
    if (typeof next.autoUpdateEnabled === "boolean") {
      this.updater = { ...this.updater, autoUpdateEnabled: next.autoUpdateEnabled };
    }
    this.log("Settings updated.");
    if ((typeof next.selectedPrinterTempId === "string" || typeof next.printerStations === "object") && this.settings.accessToken) {
      if (this.discoveredPrinters.length) {
        await this.syncCurrentPrinters().catch(() => undefined);
      }
      await this.sendHeartbeat().catch(() => undefined);
    }
    this.emitState();
    return this.settings;
  }

  setUpdaterState(next: Partial<UpdaterState>) {
    this.updater = { ...this.updater, ...next };
    this.emitState();
  }

  async pair(pairingCode: string, agentName: string) {
    const runtimeCompatibility = await this.refreshRuntimeCompatibility();
    const result = await this.api.pair(pairingCode, agentName, APP_VERSION, {
      host_platform: "windows",
      machine: process.env.COMPUTERNAME || "Windows PC",
      runtime_compatibility: runtimeCompatibility,
    });
    this.settings = this.store.write({
      agentName,
      pairedAgentId: result.agent_id,
      accessToken: result.access_token,
      heartbeatIntervalSeconds: result.heartbeat_interval_seconds,
      queuePollIntervalSeconds: result.queue_poll_interval_seconds,
      lastPairingCode: pairingCode,
    });
    this.log(`Paired successfully as ${agentName}.`);
    await this.start();
    return this.getState();
  }

  async checkConnection(): Promise<ConnectionCheckResult> {
    const apiBase = this.settings.apiBaseUrl.replace(/\/$/, "");
    const apiHost = (() => {
      try {
        return new URL(apiBase).hostname;
      } catch {
        return "";
      }
    })();

    if (!apiHost) {
      return {
        internetOk: false,
        serverOk: false,
        internetMessage: "API host is not configured correctly.",
        serverMessage: "Cannot validate Hommic server address.",
      };
    }

    try {
      await lookup(apiHost);
    } catch (error) {
      const message = error instanceof Error ? error.message : "DNS lookup failed";
      return {
        internetOk: false,
        serverOk: false,
        internetMessage: `Cannot resolve ${apiHost}. ${message}`,
        serverMessage: "Skipped because DNS resolution failed.",
      };
    }

    try {
      const response = await fetch(`${apiBase}/`, {
        method: "GET",
        headers: {
          Accept: "application/json",
        },
      });
      if (!response.ok) {
        return {
          internetOk: true,
          serverOk: false,
          internetMessage: "Internet connection is available.",
          serverMessage: `Hommic API responded with ${response.status}.`,
        };
      }
      return {
        internetOk: true,
        serverOk: true,
        internetMessage: "Internet connection is available.",
        serverMessage: "Hommic API is reachable.",
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Fetch failed";
      return {
        internetOk: true,
        serverOk: false,
        internetMessage: "Internet connection is available.",
        serverMessage: `Cannot reach Hommic API. ${message}`,
      };
    }
  }

  async unpair() {
    this.stop();
    const currentToken = this.settings.accessToken;
    if (currentToken) {
      try {
        await this.api.unpair();
        this.log("Daemon unpaired from SaaS.");
      } catch (error) {
        this.log(`Remote unpair failed: ${error instanceof Error ? error.message : "Unknown error"}`);
      }
    }
    this.settings = this.store.write({
      pairedAgentId: "",
      accessToken: "",
      lastHeartbeatAt: "",
      lastPairingCode: "",
      selectedPrinterTempId: "",
    });
    this.discoveredPrinters = [];
    this.activeJobs = [];
    this.log("Daemon unpaired.");
    this.emitState();
  }

  async discoverPrinters() {
    const hidden = new Set(this.settings.hiddenPrinterTempIds || []);
    this.discoveredPrinters = this.applyPrinterStations(
      (await discoverWindowsPrinters(this.settings.showVirtualPrinters)).filter((printer) => !hidden.has(printer.temp_id)),
    );
    if ((!this.settings.selectedPrinterTempId || hidden.has(this.settings.selectedPrinterTempId)) && this.discoveredPrinters.length) {
      this.settings = this.store.write({ selectedPrinterTempId: this.discoveredPrinters[0].temp_id });
    }
    this.log(`Discovered ${this.discoveredPrinters.length} Windows printers.`);
    if (this.settings.accessToken && this.discoveredPrinters.length) {
      await this.syncCurrentPrinters();
    }
    this.emitState();
    return this.discoveredPrinters;
  }

  async start() {
    if (!this.settings.accessToken || this.running) {
      this.emitState();
      return;
    }
    await this.refreshRuntimeCompatibility();
    this.running = true;
    this.log("Daemon started.");
    await this.discoverPrinters();
    await this.sendHeartbeat();
    this.connectRealtimeChannel();
    await this.pollJobs();
    this.heartbeatTimer = setInterval(() => {
      void this.sendHeartbeat();
    }, Math.max(10, this.settings.heartbeatIntervalSeconds) * 1000);
    this.scheduleNextPoll(750);
    this.emitState();
  }

  async resync() {
    if (!this.settings.accessToken) {
      await this.discoverPrinters();
      return this.getState();
    }
    if (!this.running) {
      await this.start();
      return this.getState();
    }

    this.log("Manual resync started.");
    try {
      await this.discoverPrinters();
      await this.sendHeartbeat();
      if (this.realtimeSocket) {
        try {
          this.realtimeSocket.close();
        } catch {
          // ignore close failures during forced reconnect
        }
        this.realtimeSocket = null;
        this.realtimeConnected = false;
      }
      this.connectRealtimeChannel();
      this.scheduleNextPoll(25);
      await this.pollJobs();
      this.log("Manual resync completed.");
    } catch (error) {
      this.log(`Manual resync failed: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
    this.emitState();
    return this.getState();
  }

  async hidePrinter(tempId: string) {
    const hidden = Array.from(new Set([...(this.settings.hiddenPrinterTempIds || []), tempId]));
    const nextSelected = this.settings.selectedPrinterTempId === tempId ? "" : this.settings.selectedPrinterTempId;
    this.settings = this.store.write({ hiddenPrinterTempIds: hidden, selectedPrinterTempId: nextSelected });
    this.log(`Hidden printer ${tempId} on this PC.`);
    await this.discoverPrinters();
  }

  async deletePrinter(tempId: string) {
    const target = this.discoveredPrinters.find((printer) => printer.temp_id === tempId) || null;
    const syncedPrinterId = String(target?.metadata.synced_printer_device_id || "");
    if (syncedPrinterId && this.settings.accessToken) {
      try {
        await this.api.deletePrinter(syncedPrinterId);
        this.log(`Deleted mapped SaaS printer ${syncedPrinterId}.`);
      } catch (error) {
        this.log(`SaaS delete failed for ${target?.name || tempId}: ${error instanceof Error ? error.message : "Unknown error"}`);
      }
    }
    await this.hidePrinter(tempId);
  }

  stop() {
    this.running = false;
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    if (this.jobsTimer) clearTimeout(this.jobsTimer);
    if (this.realtimeReconnectTimer) clearTimeout(this.realtimeReconnectTimer);
    this.heartbeatTimer = null;
    this.jobsTimer = null;
    this.realtimeReconnectTimer = null;
    this.realtimeConnected = false;
    if (this.realtimeSocket) {
      this.realtimeSocket.close();
      this.realtimeSocket = null;
    }
    this.emitState();
  }

  private async sendHeartbeat() {
    try {
      const runtimeCompatibility = await this.refreshRuntimeCompatibility();
      const selectedPrinter = this.discoveredPrinters.find((entry) => entry.temp_id === this.settings.selectedPrinterTempId) || null;
      const selectedPrinterDeviceId = String(selectedPrinter?.metadata.synced_printer_device_id || "");
      await this.api.heartbeat(APP_VERSION, {
        discovered_printer_count: this.discoveredPrinters.length,
        active_jobs: this.activeJobs.length,
        active_printer_temp_id: this.settings.selectedPrinterTempId || "",
        active_printer_device_id: selectedPrinterDeviceId,
        active_printer_name: selectedPrinter?.name || "",
        active_printer_station: String(selectedPrinter?.metadata.station_role || ""),
        runtime_compatibility: runtimeCompatibility,
      });
      this.settings = this.store.write({ lastHeartbeatAt: new Date().toISOString() });
      this.window?.webContents.send("heartbeat", { lastHeartbeatAt: this.settings.lastHeartbeatAt });
      this.emitState();
    } catch (error) {
      this.log(`Heartbeat failed: ${error instanceof Error ? error.message : "Unknown error"}`);
      this.emitState();
    }
  }

  private async pollJobs() {
    if (this.jobsPollInFlight || !this.running) {
      return;
    }
    this.jobsPollInFlight = true;
    try {
      const jobs = await this.api.listJobs();
      for (const job of jobs) {
        await this.handleJob(job);
      }
      const configuredPollMs = Math.max(1000, this.settings.queuePollIntervalSeconds * 1000);
      const nextDelay = jobs.length > 0 ? 250 : this.realtimeConnected ? Math.min(configuredPollMs, REALTIME_FALLBACK_POLL_MS) : configuredPollMs;
      this.scheduleNextPoll(nextDelay);
      this.emitState();
    } catch (error) {
      this.log(`Job polling failed: ${error instanceof Error ? error.message : "Unknown error"}`);
      this.scheduleNextPoll(Math.max(2000, this.settings.queuePollIntervalSeconds * 1000));
    } finally {
      this.jobsPollInFlight = false;
    }
  }

  private isHeartbeatFresh() {
    if (!this.settings.lastHeartbeatAt) {
      return false;
    }
    const lastHeartbeat = Date.parse(this.settings.lastHeartbeatAt);
    if (Number.isNaN(lastHeartbeat)) {
      return false;
    }
    const maxAgeSeconds = Math.max(HEARTBEAT_STALE_MIN_SECONDS, this.settings.heartbeatIntervalSeconds * HEARTBEAT_STALE_MULTIPLIER);
    return Date.now() - lastHeartbeat <= maxAgeSeconds * 1000;
  }

  private async handleJob(job: PrintJob) {
    const printerRecord = this.discoveredPrinters.find((entry) => String(entry.metadata.synced_printer_device_id || "") === String(job.printer_device_id || ""));
    const printerName = printerRecord?.name || String(job.payload_json.printer_name || "Unmapped printer");
    const runtimeCompatibility = await this.refreshRuntimeCompatibility();
    this.activeJobs = [{ id: job.id, printer: printerName, status: "claiming" }, ...this.activeJobs].slice(0, 25);
    this.window?.webContents.send("job-update", { id: job.id, printer: printerName, status: "claiming" });
    this.emitState();

    try {
      await this.api.claimJob(job.id, job.printer_device_id || undefined);
      this.activeJobs = this.activeJobs.map((row) => (row.id === job.id ? { ...row, status: "printing" } : row));
      this.window?.webContents.send("job-update", { id: job.id, printer: printerName, status: "printing" });
      const result = await processPrintJob({
        ...job,
        payload_json: {
          ...job.payload_json,
          printer_name: printerName,
          windows_printer_name: printerRecord?.metadata.windows_printer_name,
        },
      });
      if (result.ok) {
        await this.api.updateJobStatus(job.id, "printed", undefined, {
          printer_name: printerName,
          artifact_path: result.artifactPath || "",
          message: result.message,
          daemon_version: APP_VERSION,
          runtime_compatibility: runtimeCompatibility,
          driver_result: result.diagnostics || {},
        });
        if (job.printer_device_id) {
          await this.api.updatePrinterStatus(String(job.printer_device_id), "online", undefined, {
            printer_name: printerName,
            daemon_version: APP_VERSION,
            runtime_compatibility: runtimeCompatibility,
            driver_result: result.diagnostics || {},
            last_job_id: job.id,
          });
        }
        this.activeJobs = this.activeJobs.map((row) => (row.id === job.id ? { ...row, status: "printed" } : row));
        this.window?.webContents.send("job-update", { id: job.id, printer: printerName, status: "printed" });
        this.log(`Printed job ${job.id}: ${result.message}`);
        this.scheduleNextPoll(250);
      } else {
        const failureTelemetry = {
          printer_name: printerName,
          daemon_version: APP_VERSION,
          runtime_compatibility: runtimeCompatibility,
          driver_result: result.diagnostics || {},
          last_job_id: job.id,
        };
        await this.api.updateJobStatus(job.id, "failed", result.message, failureTelemetry);
        if (job.printer_device_id) {
          await this.api.updatePrinterStatus(String(job.printer_device_id), "error", undefined, failureTelemetry);
        }
        this.activeJobs = this.activeJobs.map((row) => (row.id === job.id ? { ...row, status: "failed" } : row));
        this.window?.webContents.send("job-update", { id: job.id, printer: printerName, status: "failed" });
        this.log(`Print failed for job ${job.id}: ${result.message}`);
        this.scheduleNextPoll(500);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown print error";
      const failureTelemetry = {
        printer_name: printerName,
        daemon_version: APP_VERSION,
        runtime_compatibility: runtimeCompatibility,
        exception_type: error instanceof Error ? error.name : "UnknownError",
        last_job_id: job.id,
      };
      try {
        await this.api.updateJobStatus(job.id, "failed", message, failureTelemetry);
        if (job.printer_device_id) {
          await this.api.updatePrinterStatus(String(job.printer_device_id), "error", undefined, failureTelemetry);
        }
      } catch {
        // swallow nested status update failures
      }
      this.activeJobs = this.activeJobs.map((row) => (row.id === job.id ? { ...row, status: "failed" } : row));
      this.window?.webContents.send("job-update", { id: job.id, printer: printerName, status: "failed" });
      this.log(`Print exception for job ${job.id}: ${message}`);
      this.scheduleNextPoll(500);
    } finally {
      this.emitState();
    }
  }

  private scheduleNextPoll(delayMs: number) {
    if (!this.running) {
      return;
    }
    if (this.jobsTimer) {
      clearTimeout(this.jobsTimer);
    }
    this.jobsTimer = setTimeout(() => {
      void this.pollJobs();
    }, Math.max(250, delayMs));
  }

  private connectRealtimeChannel() {
    if (!this.running || !this.settings.accessToken) {
      return;
    }
    if (this.realtimeSocket && (this.realtimeSocket.readyState === WebSocket.OPEN || this.realtimeSocket.readyState === WebSocket.CONNECTING)) {
      return;
    }

    const baseUrl = this.settings.apiBaseUrl.replace(/\/$/, "");
    const websocketUrl = `${baseUrl.replace(/^http/i, "ws")}/api/print-agent/ws?token=${encodeURIComponent(this.settings.accessToken)}`;

    try {
      const socket = new WebSocket(websocketUrl);
      this.realtimeSocket = socket;

      socket.addEventListener("open", () => {
        this.realtimeConnected = true;
        this.log("Realtime channel connected.");
        this.scheduleNextPoll(100);
      });

      socket.addEventListener("message", (event) => {
        try {
          const payload = JSON.parse(String(event.data || "{}")) as { event?: string };
          if (payload.event === "jobs_available") {
            this.log("Realtime job event received.");
            this.scheduleNextPoll(25);
            void this.pollJobs();
          }
        } catch {
          // ignore malformed realtime messages
        }
      });

      socket.addEventListener("close", () => {
        this.realtimeConnected = false;
        this.log("Realtime channel closed. Falling back to polling.");
        this.realtimeSocket = null;
        this.scheduleRealtimeReconnect();
      });

      socket.addEventListener("error", () => {
        this.realtimeConnected = false;
        this.log("Realtime channel error. Falling back to polling.");
        this.scheduleRealtimeReconnect();
      });
    } catch (error) {
      this.realtimeConnected = false;
      this.log(`Realtime channel failed to start: ${error instanceof Error ? error.message : "Unknown error"}`);
      this.scheduleRealtimeReconnect();
    }
  }

  private scheduleRealtimeReconnect() {
    if (!this.running) {
      return;
    }
    if (this.realtimeReconnectTimer) {
      clearTimeout(this.realtimeReconnectTimer);
    }
    this.realtimeReconnectTimer = setTimeout(() => {
      this.connectRealtimeChannel();
    }, 3000);
  }

  private applyPrinterStations(printers: PrinterDiscoveryRecord[]) {
    const stationMap = this.settings.printerStations || {};
    return printers.map((printer) => ({
      ...printer,
      metadata: {
        ...printer.metadata,
        station_role: String(stationMap[printer.temp_id] || printer.metadata.station_role || "").trim(),
      },
    }));
  }

  private normalizeComparable(value: unknown) {
    return String(value || "")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");
  }

  private printersMatch(
    entry: PrinterDiscoveryRecord,
    row: { id: string; metadata?: Record<string, unknown>; name: string },
  ) {
    const rowMetadata = row.metadata || {};
    const entryComparable = this.normalizeComparable(entry.name);
    const rowComparable = this.normalizeComparable(row.name);
    const rowTempId = String(rowMetadata.temp_id || "").trim();
    const rowWindowsPrinterName = this.normalizeComparable(rowMetadata.windows_printer_name);
    const rowPortName = this.normalizeComparable(rowMetadata.port_name);
    const entryWindowsPrinterName = this.normalizeComparable(entry.metadata.windows_printer_name);
    const entryPortName = this.normalizeComparable(entry.metadata.port_name);

    if (rowTempId && rowTempId === entry.temp_id) return true;
    if (rowComparable && rowComparable === entryComparable) return true;
    if (rowWindowsPrinterName && rowWindowsPrinterName === entryWindowsPrinterName) return true;
    if (rowWindowsPrinterName && rowWindowsPrinterName === entryComparable) return true;
    if (rowComparable && rowComparable === entryWindowsPrinterName) return true;
    if (rowPortName && entryPortName && rowPortName === entryPortName && rowComparable === entryComparable) return true;
    return false;
  }

  private async syncCurrentPrinters() {
    const synced = await this.api.syncDiscoveredPrinters(this.discoveredPrinters);
    this.discoveredPrinters = this.discoveredPrinters.map((entry) => {
      const matched = synced.find((row) => this.printersMatch(entry, row));
      return matched
        ? {
            ...entry,
            metadata: {
              ...entry.metadata,
              synced_printer_device_id: matched.id,
            },
          }
        : entry;
    });
    this.log("Synced discovered printers to SaaS.");
  }

  private log(message: string) {
    this.logs = [`${new Date().toLocaleString()}: ${message}`, ...this.logs].slice(0, 200);
    this.emitState();
  }

  private async refreshRuntimeCompatibility(force = false) {
    if (this.runtimeCompatibility && !force) {
      return this.runtimeCompatibility;
    }
    try {
      this.runtimeCompatibility = await collectWindowsRuntimeTelemetry();
      const issues = this.runtimeCompatibility.issues;
      if (issues.length) {
        this.log(`Windows compatibility check: ${issues.join(" | ")}`);
      } else {
        this.log(`Windows compatibility check passed for ${this.runtimeCompatibility.osName}.`);
      }
    } catch (error) {
      this.runtimeCompatibility = {
        platform: process.platform,
        architecture: process.arch,
        hostName: process.env.COMPUTERNAME || "Windows PC",
        osRelease: "",
        osVersion: "",
        osName: "Unknown",
        minimumSupportedWindows: "Windows 10",
        supported: false,
        supportMessage: "Compatibility check failed.",
        powershellVersion: "unavailable",
        spoolerStatus: "Unknown",
        spoolerStartType: "Unknown",
        spoolerAutoStartAttempted: false,
        spoolerAutoStartSucceeded: false,
        dependencyBootstrapMessage: "Compatibility telemetry failed to initialize.",
        issues: [error instanceof Error ? error.message : "Unknown compatibility error"],
        checkedAt: new Date().toISOString(),
      };
      this.log(`Compatibility check failed: ${this.runtimeCompatibility.issues[0]}`);
    }
    this.emitState();
    return this.runtimeCompatibility;
  }

  private emitState() {
    this.window?.webContents.send("daemon:state", this.getState());
  }
}
