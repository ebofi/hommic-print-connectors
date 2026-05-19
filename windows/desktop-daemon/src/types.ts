export type PrinterDiscoveryRecord = {
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

export type PairResult = {
  agent_id: string;
  access_token: string;
  heartbeat_interval_seconds: number;
  queue_poll_interval_seconds: number;
};

export type ConnectionCheckResult = {
  internetOk: boolean;
  serverOk: boolean;
  internetMessage: string;
  serverMessage: string;
};

export type PrintJob = {
  id: string;
  printer_device_id?: string | null;
  document_type: string;
  status: string;
  template_profile_id?: string | null;
  template_version_id?: string | null;
  layout_spec_json?: Record<string, unknown>;
  rendered_format: "escpos" | "pdf" | "html" | "image";
  rendered_content?: string | null;
  payload_json: Record<string, unknown>;
  claim_token?: string;
  claim_expires_at?: string | null;
  last_delivery_attempt_at?: string | null;
  connector_ack_at?: string | null;
};

export type RuntimeCompatibility = {
  platform: string;
  architecture: string;
  hostName: string;
  osRelease: string;
  osVersion: string;
  osName: string;
  minimumSupportedWindows: string;
  supported: boolean;
  supportMessage: string;
  powershellVersion: string;
  spoolerStatus: string;
  spoolerStartType: string;
  spoolerAutoStartAttempted: boolean;
  spoolerAutoStartSucceeded: boolean;
  dependencyBootstrapMessage: string;
  issues: string[];
  checkedAt: string;
};

export type DaemonSettings = {
  apiBaseUrl: string;
  merchantSaasUrl: string;
  agentName: string;
  selectedPrinterTempId: string;
  printerStations: Record<string, string>;
  showVirtualPrinters: boolean;
  hiddenPrinterTempIds: string[];
  pairedAgentId: string;
  accessToken: string;
  queuePollIntervalSeconds: number;
  heartbeatIntervalSeconds: number;
  lastHeartbeatAt: string;
  lastPairingCode: string;
  autoUpdateEnabled: boolean;
  autoStart: boolean;
};

export type UpdaterState = {
  appVersion: string;
  autoUpdateEnabled: boolean;
  status:
    | "idle"
    | "checking"
    | "available"
    | "not-available"
    | "downloading"
    | "downloaded"
    | "error"
    | "disabled";
  message: string;
  latestVersion: string;
  downloadedPercent: number;
  releaseName: string;
  releaseNotes: string;
  releasePageUrl: string;
  gitTag: string;
  copyrightNotice: string;
};

export type DaemonState = {
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
  connectivity: "unknown" | "online" | "offline" | "error";
  lastHeartbeatAt: string;
  lastPairingCode: string;
  discoveredPrinters: PrinterDiscoveryRecord[];
  activeJobs: Array<{ id: string; printer: string; status: string }>;
  logs: string[];
  updater: UpdaterState;
  runtimeCompatibility: RuntimeCompatibility | null;
};
