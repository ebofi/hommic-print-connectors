import { app } from "electron";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import type { DaemonSettings } from "../types";

const defaultSettings: DaemonSettings = {
  apiBaseUrl: "https://api.hommic.co.uk",
  merchantSaasUrl: "https://hommic.co.uk",
  agentName: "Front Counter PC",
  selectedPrinterTempId: "",
  printerStations: {},
  showVirtualPrinters: false,
  hiddenPrinterTempIds: [],
  pairedAgentId: "",
  accessToken: "",
  queuePollIntervalSeconds: 3,
  heartbeatIntervalSeconds: 15,
  lastHeartbeatAt: "",
  lastPairingCode: "",
  autoUpdateEnabled: true,
  autoStart: true,
};

export class SettingsStore {
  private readonly directory: string;
  private readonly filePath: string;

  constructor() {
    this.directory = join(app.getPath("userData"), "config");
    this.filePath = join(this.directory, "settings.json");
  }

  read(): DaemonSettings {
    if (!existsSync(this.filePath)) {
      return { ...defaultSettings };
    }
    try {
      const raw = readFileSync(this.filePath, "utf-8");
      return { ...defaultSettings, ...JSON.parse(raw) };
    } catch {
      return { ...defaultSettings };
    }
  }

  write(next: Partial<DaemonSettings>): DaemonSettings {
    if (!existsSync(this.directory)) {
      mkdirSync(this.directory, { recursive: true });
    }
    const current = this.read();
    const merged = { ...current, ...next };
    writeFileSync(this.filePath, JSON.stringify(merged, null, 2), "utf-8");
    return merged;
  }
}
