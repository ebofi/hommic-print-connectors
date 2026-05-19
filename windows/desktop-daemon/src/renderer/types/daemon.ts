export type ConnectionState = "unknown" | "online" | "offline" | "error";

export type Printer = {
  temp_id: string;
  name: string;
  type: "escpos_usb" | "escpos_network" | "star" | "browser_pdf";
  connection_mode: "desktop_agent";
  vendor: string;
  model: string;
  serial_number?: string | null;
  mac_address?: string | null;
  ip_address?: string | null;
  port?: number | null;
  paper_width: "58mm" | "80mm" | "a4";
  metadata: Record<string, unknown>;
};

export type PrintJob = {
  id: string;
  printer: string;
  status: string;
};

export type DaemonViewState = {
  paired: boolean;
  running: boolean;
  apiBaseUrl: string;
  merchantSaasUrl: string;
  agentName: string;
  selectedPrinterTempId: string;
  printerStations: Record<string, string>;
  showVirtualPrinters: boolean;
  hiddenPrinterTempIds: string[];
  pairedAgentId: string;
  connectivity: ConnectionState;
  lastHeartbeatAt: string;
  lastPairingCode: string;
  discoveredPrinters: Printer[];
  activeJobs: PrintJob[];
  logs: string[];
  updater: {
    appVersion: string;
    autoUpdateEnabled: boolean;
    status: "idle" | "checking" | "available" | "not-available" | "downloading" | "downloaded" | "error" | "disabled";
    message: string;
    latestVersion: string;
    downloadedPercent: number;
    releaseName: string;
    releaseNotes: string;
    releasePageUrl: string;
    gitTag: string;
    copyrightNotice: string;
  };
};

export type JobUpdate = {
  id: string;
  printer: string;
  status: string;
};

export type HeartbeatEvent = {
  lastHeartbeatAt: string;
};
