import React, { useEffect, useMemo, useState } from "react";

import { AboutCard } from "./components/AboutCard";
import { Dashboard } from "./components/Dashboard";
import { DeviceHealth } from "./components/DeviceHealth";
import { DiagnosticsPage } from "./components/DiagnosticsPage";
import { Footer } from "./components/Footer";
import { JobList } from "./components/JobList";
import { PairScreen } from "./components/PairScreen";
import { PrinterScanScreen } from "./components/PrinterScanScreen";
import { Sidebar } from "./components/Sidebar";
import { Titlebar } from "./components/Titlebar";
import type { DaemonViewState, HeartbeatEvent, JobUpdate, Printer } from "./types/daemon";
import type { ConnectionCheckResult } from "../types";

declare global {
  interface Window {
    daemonApi: {
      getState: () => Promise<DaemonViewState>;
      checkConnection: () => Promise<ConnectionCheckResult>;
      pairDaemon: (payload: { pairingCode: string; agentName: string }) => Promise<DaemonViewState>;
      discoverPrinters: () => Promise<unknown>;
      quitApp: () => Promise<void>;
      openSaas: () => Promise<void>;
      checkForUpdates: () => Promise<void>;
      setAutoUpdateEnabled: (enabled: boolean) => Promise<DaemonViewState>;
      installUpdateNow: () => Promise<void>;
      openReleasePage: () => Promise<void>;
      start: () => Promise<unknown>;
      resync: () => Promise<DaemonViewState>;
      stop: () => Promise<DaemonViewState>;
      unpair: () => Promise<void>;
      hidePrinter: (tempId: string) => Promise<unknown>;
      deletePrinter: (tempId: string) => Promise<unknown>;
      saveSettings: (payload: { apiBaseUrl?: string; merchantSaasUrl?: string; agentName?: string; selectedPrinterTempId?: string; printerStations?: Record<string, string>; showVirtualPrinters?: boolean; hiddenPrinterTempIds?: string[] }) => Promise<unknown>;
      minimizeWindow: () => Promise<void>;
      toggleMaximizeWindow: () => Promise<boolean>;
      closeWindow: () => Promise<void>;
      onState: (callback: (state: DaemonViewState) => void) => () => void;
      onJobUpdate: (callback: (payload: JobUpdate) => void) => () => void;
      onHeartbeat: (callback: (payload: HeartbeatEvent) => void) => () => void;
    };
  }
}

type Screen = "pair" | "connecting" | "scan" | "workspace";
type WorkspaceTab = "dashboard" | "printers" | "queue" | "diagnostics" | "about";
type StepStatus = "pending" | "active" | "done" | "error";

type SetupState = {
  setupComplete: boolean;
  selectedPrinterTempId: string;
};

type ConnectionStep = {
  id: "internet" | "server" | "code" | "register";
  title: string;
  detail: string;
  status: StepStatus;
};

const UI_STORAGE_KEY = "hommic-print-daemon-ui";

const INITIAL_STATE: DaemonViewState = {
  paired: false,
  running: false,
  apiBaseUrl: "https://api.hommic.co.uk",
  merchantSaasUrl: "https://hommic.co.uk",
  agentName: "Front Counter PC",
  selectedPrinterTempId: "",
  printerStations: {},
  showVirtualPrinters: false,
  hiddenPrinterTempIds: [],
  pairedAgentId: "",
  connectivity: "unknown",
  lastHeartbeatAt: "",
  lastPairingCode: "",
  discoveredPrinters: [],
  activeJobs: [],
  logs: [],
  updater: {
    appVersion: "0.1.1",
    autoUpdateEnabled: true,
    status: "idle",
    message: "Update checks ready.",
    latestVersion: "",
    downloadedPercent: 0,
    releaseName: "",
    releaseNotes: "",
    releasePageUrl: "",
    gitTag: "",
    copyrightNotice: "Copyright (c) Hommic. All rights reserved.",
  },
};

const BASE_STEPS: ConnectionStep[] = [
  { id: "internet", title: "Checking internet", detail: "Waiting to start", status: "pending" },
  { id: "server", title: "Reaching Hommic servers", detail: "Waiting to start", status: "pending" },
  { id: "code", title: "Validating pairing code", detail: "Waiting to start", status: "pending" },
  { id: "register", title: "Registering location", detail: "Waiting to start", status: "pending" },
];

function readSetupState(): SetupState {
  try {
    const raw = window.localStorage.getItem(UI_STORAGE_KEY);
    if (!raw) return { setupComplete: false, selectedPrinterTempId: "" };
    const parsed = JSON.parse(raw) as Partial<SetupState>;
    return {
      setupComplete: Boolean(parsed.setupComplete),
      selectedPrinterTempId: String(parsed.selectedPrinterTempId || ""),
    };
  } catch {
    return { setupComplete: false, selectedPrinterTempId: "" };
  }
}

function writeSetupState(next: SetupState) {
  window.localStorage.setItem(UI_STORAGE_KEY, JSON.stringify(next));
}

function clearSetupState() {
  window.localStorage.removeItem(UI_STORAGE_KEY);
}

function formatRelativeHeartbeat(lastHeartbeatAt: string) {
  if (!lastHeartbeatAt) return "";
  const elapsedSeconds = Math.max(0, Math.floor((Date.now() - new Date(lastHeartbeatAt).getTime()) / 1000));
  if (elapsedSeconds < 10) return "Last heartbeat just now";
  if (elapsedSeconds < 60) return `Last heartbeat ${elapsedSeconds}s ago`;
  const minutes = Math.floor(elapsedSeconds / 60);
  if (minutes < 60) return `Last heartbeat ${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `Last heartbeat ${hours}h ago`;
}

function getConnectionTone(state: DaemonViewState): "connected" | "warning" | "disconnected" {
  if (!state.paired) return "disconnected";
  if (state.connectivity === "online" && state.running) return "connected";
  if (state.connectivity === "offline" || state.connectivity === "error") return "warning";
  return state.running ? "warning" : "disconnected";
}

function getSyncStatus(state: DaemonViewState) {
  if (!state.paired) return "Logged out";
  if (state.connectivity === "online" && state.running) return "Running";
  if (state.connectivity === "offline") return "Heartbeat stale";
  if (state.connectivity === "error") return "Server error";
  return state.running ? "Reconnecting" : "Paused";
}

function formatPairingCode(raw: string) {
  const clean = raw.replace(/[^A-Z0-9]/gi, "").toUpperCase();
  if (!clean) return "";
  if (clean.length <= 4) return clean;
  return `${clean.slice(0, 4)} - ${clean.slice(4, 8)}`;
}

function detectPrinterBadge(printer: Printer) {
  const name = `${printer.name} ${printer.vendor} ${printer.model}`.toLowerCase();
  const port = String(printer.metadata.port_name || "").toLowerCase();
  if (name.includes("pdf") || name.includes("xps") || name.includes("fax") || name.includes("onenote") || name.includes("bullzip")) {
    return { label: "Virtual", className: "badge-preview" };
  }
  if (name.includes("bluetooth") || port.includes("bluetooth") || port.startsWith("bt")) {
    return { label: "Bluetooth", className: "badge-bt" };
  }
  if (printer.type === "escpos_network" || port.includes("ip_") || port.includes("tcp") || port.includes("wsd")) {
    return { label: "Network", className: "badge-online" };
  }
  return { label: "USB", className: "badge-online" };
}

function printerDescriptor(printer: Printer) {
  const port = String(printer.metadata.port_name || "").trim();
  const driver = String(printer.metadata.driver_name || printer.model || "").trim();
  const width = printer.paper_width || "80mm";
  return {
    port: port || "Windows printer port",
    driver: driver || "Windows printer driver",
    width,
  };
}

function printerStationLabel(printer: Printer, stationMap: Record<string, string>) {
  return String(stationMap[printer.temp_id] || printer.metadata.station_role || "").trim();
}

function normalizeUpdateMessage(status: DaemonViewState["updater"]["status"], message: string) {
  if (status === "error" && /404/.test(message)) {
    return "Update information is not available right now.";
  }
  return message || "Update checks ready.";
}

export default function App() {
  const [state, setState] = useState<DaemonViewState>(INITIAL_STATE);
  const [screen, setScreen] = useState<Screen>("pair");
  const [activeTab, setActiveTab] = useState<WorkspaceTab>("dashboard");
  const [setupState, setSetupState] = useState<SetupState>({ setupComplete: false, selectedPrinterTempId: "" });
  const [locationNameDraft, setLocationNameDraft] = useState("Front Counter");
  const [pairingCodeDraft, setPairingCodeDraft] = useState("");
  const [steps, setSteps] = useState<ConnectionStep[]>(BASE_STEPS);
  const [pairingError, setPairingError] = useState("");
  const [showLogs, setShowLogs] = useState(false);
  const [scanBusy, setScanBusy] = useState(false);
  const [resyncBusy, setResyncBusy] = useState(false);

  useEffect(() => {
    const localSetup = readSetupState();
    setSetupState(localSetup);

    void window.daemonApi.getState().then((nextState) => {
      setState(nextState);
      setLocationNameDraft(nextState.agentName || "Front Counter");
      setPairingCodeDraft(nextState.lastPairingCode || "");
      if (nextState.selectedPrinterTempId && !localSetup.selectedPrinterTempId) {
        const nextSetup = { ...localSetup, selectedPrinterTempId: nextState.selectedPrinterTempId };
        setSetupState(nextSetup);
        writeSetupState(nextSetup);
      }
      if (!nextState.selectedPrinterTempId && localSetup.selectedPrinterTempId) {
        void window.daemonApi.saveSettings({ selectedPrinterTempId: localSetup.selectedPrinterTempId });
      }
      if (!nextState.paired) {
        setScreen("pair");
      } else if (!localSetup.setupComplete) {
        setScreen("scan");
      } else {
        setScreen("workspace");
      }
    });

    const unsubState = window.daemonApi.onState((nextState) => {
      setState(nextState);
      setLocationNameDraft((current) => current || nextState.agentName || "Front Counter");
      if (nextState.selectedPrinterTempId) {
        setSetupState((current) => {
          if (current.selectedPrinterTempId === nextState.selectedPrinterTempId) return current;
          const nextSetup = { ...current, selectedPrinterTempId: nextState.selectedPrinterTempId };
          writeSetupState(nextSetup);
          return nextSetup;
        });
      }
      if (!nextState.paired) {
        setScreen("pair");
      }
    });
    const unsubJobs = window.daemonApi.onJobUpdate((job) => {
      setState((current) => {
        const remaining = current.activeJobs.filter((entry) => entry.id !== job.id);
        return { ...current, activeJobs: [job, ...remaining].slice(0, 25) };
      });
    });
    const unsubHeartbeat = window.daemonApi.onHeartbeat((heartbeat) => {
      setState((current) => ({ ...current, lastHeartbeatAt: heartbeat.lastHeartbeatAt, connectivity: "online" }));
    });

    return () => {
      unsubState();
      unsubJobs();
      unsubHeartbeat();
    };
  }, []);

  const heartbeatLabel = useMemo(() => formatRelativeHeartbeat(state.lastHeartbeatAt), [state.lastHeartbeatAt]);
  const pairingCodeDisplay = useMemo(() => formatPairingCode(state.lastPairingCode), [state.lastPairingCode]);
  const selectedPrinter = useMemo(
    () => state.discoveredPrinters.find((printer) => printer.temp_id === setupState.selectedPrinterTempId) || null,
    [setupState.selectedPrinterTempId, state.discoveredPrinters],
  );
  const selectedPrinterStation = useMemo(
    () => (selectedPrinter ? printerStationLabel(selectedPrinter, state.printerStations || {}) : ""),
    [selectedPrinter, state.printerStations],
  );
  const jobsQueued = useMemo(
    () => state.activeJobs.filter((job) => job.status === "claiming" || job.status === "printing").length,
    [state.activeJobs],
  );
  const jobsToday = useMemo(
    () => state.logs.filter((line) => /Printed job|Print failed|Print exception/.test(line)).length,
    [state.logs],
  );
  const normalizedUpdaterMessage = useMemo(
    () => normalizeUpdateMessage(state.updater.status, state.updater.message),
    [state.updater.status, state.updater.message],
  );
  const latestPublished = useMemo(() => {
    if (state.updater.latestVersion) return state.updater.latestVersion;
    if (state.updater.status === "error" && /404/.test(state.updater.message)) return "Could not load";
    return "";
  }, [state.updater.latestVersion, state.updater.message, state.updater.status]);

  async function runPairingFlow() {
    if (!locationNameDraft.trim() || !pairingCodeDraft.trim()) {
      setPairingError("Enter both the location name and pairing code.");
      return;
    }

    setPairingError("");
    setScreen("connecting");
    setSteps(BASE_STEPS);

    const updateStep = (id: ConnectionStep["id"], status: StepStatus, detail: string) => {
      setSteps((current) => current.map((step) => (step.id === id ? { ...step, status, detail } : step)));
    };

    try {
      updateStep("internet", "active", "Checking connectivity");
      const connection = await window.daemonApi.checkConnection();
      if (!connection.internetOk) {
        updateStep("internet", "error", connection.internetMessage);
        throw new Error(connection.internetMessage);
      }
      updateStep("internet", "done", connection.internetMessage);

      updateStep("server", "active", "Contacting Hommic");
      if (!connection.serverOk) {
        updateStep("server", "error", connection.serverMessage);
        throw new Error(connection.serverMessage);
      }
      updateStep("server", "done", connection.serverMessage);

      updateStep("code", "active", "Validating pairing code");
      const pairedState = await window.daemonApi.pairDaemon({
        pairingCode: pairingCodeDraft.trim(),
        agentName: locationNameDraft.trim(),
      });
      setState(pairedState);
      updateStep("code", "done", "Pairing code accepted");

      updateStep("register", "active", "Saving this location");
      const nextSetup = { setupComplete: false, selectedPrinterTempId: "" };
      writeSetupState(nextSetup);
      setSetupState(nextSetup);
      updateStep("register", "done", `Registered as ${locationNameDraft.trim()}`);
      setScreen("scan");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Connection failed.";
      if (/pair|invalid|expired|code/i.test(message)) {
        updateStep("code", "error", message);
      } else if (/reach Hommic|Hommic API|responded with|DNS/i.test(message)) {
        updateStep("server", "error", message);
      } else if (/internet|network|resolve/i.test(message)) {
        updateStep("internet", "error", message);
      } else {
        updateStep("register", "error", message);
      }
      setPairingError(message);
    }
  }

  async function runPrinterScan() {
    setScanBusy(true);
    try {
      const results = (await window.daemonApi.discoverPrinters()) as Printer[];
      if (!setupState.selectedPrinterTempId && results.length) {
        const nextSetup = { ...setupState, selectedPrinterTempId: results[0].temp_id };
        setSetupState(nextSetup);
        writeSetupState(nextSetup);
        void window.daemonApi.saveSettings({ selectedPrinterTempId: results[0].temp_id });
      }
      const refreshedState = await window.daemonApi.getState();
      setState(refreshedState);
    } finally {
      setScanBusy(false);
    }
  }

  function finishSetup(skipSelection = false) {
    const nextSetup = {
      setupComplete: true,
      selectedPrinterTempId: skipSelection ? "" : setupState.selectedPrinterTempId,
    };
    writeSetupState(nextSetup);
    setSetupState(nextSetup);
    void window.daemonApi.saveSettings({ selectedPrinterTempId: nextSetup.selectedPrinterTempId });
    setScreen("workspace");
    setActiveTab("dashboard");
  }

  async function disconnectDaemon() {
    const confirmed = window.confirm("Disconnect this daemon from Hommic?");
    if (!confirmed) return;
    clearSetupState();
    setSetupState({ setupComplete: false, selectedPrinterTempId: "" });
    await window.daemonApi.unpair();
    setScreen("pair");
    setActiveTab("dashboard");
    setShowLogs(false);
    setSteps(BASE_STEPS);
    setPairingError("");
  }

  const connectionTone = getConnectionTone(state);
  const syncStatus = getSyncStatus(state);

  return (
    <div className="app-shell">
      <Titlebar
        connected={state.paired}
        syncing={state.running}
        connectivity={state.connectivity}
        onMinimize={() => void window.daemonApi.minimizeWindow()}
        onMaximize={() => void window.daemonApi.toggleMaximizeWindow()}
        onClose={() => void window.daemonApi.closeWindow()}
      />
      <div className="main">
        {screen === "workspace" ? (
          <Sidebar
            activeTab={activeTab}
            onChange={setActiveTab}
            locationName={state.agentName || "Unassigned"}
            connected={state.paired}
            syncing={state.running}
            connectivity={state.connectivity}
            queuedJobsCount={jobsQueued}
            printerCount={state.discoveredPrinters.length}
            appVersion={state.updater.appVersion}
          />
        ) : null}
        <div className="content">
          {screen === "pair" ? (
            <PairScreen
              locationName={locationNameDraft}
              pairingCode={pairingCodeDraft}
              error={pairingError}
              onLocationNameChange={setLocationNameDraft}
              onPairingCodeChange={setPairingCodeDraft}
              onSubmit={() => void runPairingFlow()}
            />
          ) : null}

          {screen === "connecting" ? (
            <PairScreen
              locationName={locationNameDraft}
              pairingCode={pairingCodeDraft}
              error={pairingError}
              steps={steps}
              onRetry={() => void runPairingFlow()}
              onBack={() => {
                setScreen("pair");
                setSteps(BASE_STEPS);
              }}
              onLocationNameChange={setLocationNameDraft}
              onPairingCodeChange={setPairingCodeDraft}
              onSubmit={() => void runPairingFlow()}
              mode="connecting"
            />
          ) : null}

          {screen === "scan" ? (
            <PrinterScanScreen
              printers={state.discoveredPrinters}
              selectedPrinterTempId={setupState.selectedPrinterTempId}
              busy={scanBusy}
              onSelect={(tempId) => {
                const nextSetup = { ...setupState, selectedPrinterTempId: tempId };
                setSetupState(nextSetup);
                writeSetupState(nextSetup);
                void window.daemonApi.saveSettings({ selectedPrinterTempId: tempId });
              }}
              onScan={() => void runPrinterScan()}
              onContinue={() => finishSetup(false)}
              onSkip={() => finishSetup(true)}
            />
          ) : null}

          {screen === "workspace" && activeTab === "dashboard" ? (
            <Dashboard
              connectionTone={connectionTone}
              locationName={state.agentName || "Unassigned"}
              heartbeatLabel={heartbeatLabel}
              jobsQueued={jobsQueued}
              jobsToday={jobsToday}
              activePrinterName={selectedPrinter?.name || "Not selected yet"}
              activePrinterStation={selectedPrinterStation || "Unassigned"}
              syncStatus={syncStatus}
              onManagePrinters={() => setActiveTab("printers")}
              onViewQueue={() => setActiveTab("queue")}
              onDisconnect={() => void disconnectDaemon()}
            />
          ) : null}

          {screen === "workspace" && activeTab === "printers" ? (
            <DeviceHealth
              printers={state.discoveredPrinters}
              selectedPrinterTempId={setupState.selectedPrinterTempId}
              printerStations={state.printerStations || {}}
              showVirtualPrinters={state.showVirtualPrinters}
              onSelect={(tempId) => {
                const nextSetup = { ...setupState, selectedPrinterTempId: tempId };
                setSetupState(nextSetup);
                writeSetupState(nextSetup);
                void window.daemonApi.saveSettings({ selectedPrinterTempId: tempId });
              }}
              onChangeStation={(tempId, station) => {
                const nextStations = { ...(state.printerStations || {}) };
                if (station) nextStations[tempId] = station;
                else delete nextStations[tempId];
                setState((current) => ({ ...current, printerStations: nextStations }));
                void window.daemonApi.saveSettings({ printerStations: nextStations });
              }}
              onToggleVirtualPrinters={(enabled) => {
                setState((current) => ({ ...current, showVirtualPrinters: enabled }));
                void window.daemonApi.saveSettings({ showVirtualPrinters: enabled }).then(() => {
                  void runPrinterScan();
                });
              }}
              onHidePrinter={(tempId) => {
                void window.daemonApi.hidePrinter(tempId).then(() => {
                  if (setupState.selectedPrinterTempId === tempId) {
                    const nextSetup = { ...setupState, selectedPrinterTempId: "" };
                    setSetupState(nextSetup);
                    writeSetupState(nextSetup);
                  }
                });
              }}
              onDeletePrinter={(tempId) => {
                void window.daemonApi.deletePrinter(tempId).then(() => {
                  if (setupState.selectedPrinterTempId === tempId) {
                    const nextSetup = { ...setupState, selectedPrinterTempId: "" };
                    setSetupState(nextSetup);
                    writeSetupState(nextSetup);
                  }
                });
              }}
              onRescan={() => void runPrinterScan()}
              busy={scanBusy}
              detectPrinterBadge={detectPrinterBadge}
              printerDescriptor={printerDescriptor}
            />
          ) : null}

          {screen === "workspace" && activeTab === "queue" ? <JobList jobs={state.activeJobs} /> : null}

          {screen === "workspace" && activeTab === "diagnostics" ? (
            <DiagnosticsPage
              connected={state.paired}
              syncing={state.running}
              heartbeatLabel={heartbeatLabel}
              lastHeartbeatAt={state.lastHeartbeatAt}
              logs={state.logs}
              printerCount={state.discoveredPrinters.length}
              busy={resyncBusy}
              onResync={async () => {
                setResyncBusy(true);
                try {
                  const nextState = await window.daemonApi.resync();
                  setState(nextState);
                } finally {
                  setResyncBusy(false);
                }
              }}
            />
          ) : null}

          {screen === "workspace" && activeTab === "about" ? (
            <AboutCard
              currentVersion={state.updater.appVersion}
              latestVersion={latestPublished}
              copyrightNotice={state.updater.copyrightNotice}
              gitTag={state.updater.gitTag}
              status={state.updater.status}
              message={normalizedUpdaterMessage}
              progress={state.updater.downloadedPercent}
              autoUpdateEnabled={state.updater.autoUpdateEnabled}
              onToggleAutoUpdate={(enabled) => void window.daemonApi.setAutoUpdateEnabled(enabled).then(setState)}
              onCheckForUpdates={() => void window.daemonApi.checkForUpdates()}
              onInstallNow={() => void window.daemonApi.installUpdateNow()}
              onOpenReleasePage={() => void window.daemonApi.openReleasePage()}
            />
          ) : null}
        </div>
      </div>
      <Footer onViewLogs={() => setShowLogs((current) => !current)} onOpenSaas={() => void window.daemonApi.openSaas()} onQuit={() => void window.daemonApi.quitApp()} />
      {showLogs ? (
        <div className="logs-drawer">
          <div className="logs-drawer-head">
            <div>Daemon logs</div>
            <button className="footer-link" onClick={() => setShowLogs(false)}>
              Close
            </button>
          </div>
          <pre className="logs-panel">{state.logs.join("\n") || "No logs yet."}</pre>
        </div>
      ) : null}
    </div>
  );
}
