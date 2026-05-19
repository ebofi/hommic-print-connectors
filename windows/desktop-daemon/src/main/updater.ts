import { app, shell } from "electron";

import type { DaemonSettings, UpdaterState } from "../types";

const { NsisUpdater } = require("electron-updater") as {
  NsisUpdater: new (options: { provider: string; url: string }) => {
    autoDownload: boolean;
    autoInstallOnAppQuit: boolean;
    on: (event: string, callback: (...args: any[]) => void) => void;
    checkForUpdates: () => Promise<unknown>;
    quitAndInstall: (isSilent?: boolean, isForceRunAfter?: boolean) => void;
  };
};

type RemoteUpdateConfig = {
  updater_enabled: boolean;
  auto_update_enabled_by_default: boolean;
  provider: string;
  update_channel: string;
  check_interval_minutes: number;
  copyright_notice: string;
  feed_base_url: string;
  latest_version: string;
  release_name: string;
  release_notes: string;
  git_tag: string;
  release_page_url: string;
  published_at: string;
};

export class DesktopUpdaterService {
  private updater: InstanceType<typeof NsisUpdater> | null = null;
  private intervalHandle: NodeJS.Timeout | null = null;
  private config: RemoteUpdateConfig | null = null;

  constructor(
    private readonly getSettings: () => DaemonSettings,
    private readonly setState: (next: Partial<UpdaterState>) => void,
  ) {}

  async initialize() {
    await this.refreshRemoteConfig();
    this.scheduleChecks();
    if (this.getSettings().autoUpdateEnabled) {
      await this.checkForUpdates(false);
    }
  }

  async refreshRemoteConfig() {
    const apiBase = this.getSettings().apiBaseUrl.replace(/\/$/, "");
    const response = await fetch(`${apiBase}/api/desktop-daemon/update-config`, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Failed to load update config (${response.status})`);
    }
    const config = (await response.json()) as RemoteUpdateConfig;
    this.config = config;
    this.setState({
      autoUpdateEnabled: this.getSettings().autoUpdateEnabled,
      latestVersion: config.latest_version || "",
      releaseName: config.release_name || "",
      releaseNotes: config.release_notes || "",
      releasePageUrl: config.release_page_url || "",
      gitTag: config.git_tag || "",
      copyrightNotice: config.copyright_notice || "Copyright (c) Hommic. All rights reserved.",
      status: config.updater_enabled ? "idle" : "disabled",
      message: config.updater_enabled ? "Auto-update is configured." : "Auto-update is disabled by admin.",
    });

    if (!config.updater_enabled) {
      this.updater = null;
      return;
    }

    if (!this.updater || this.config.feed_base_url !== config.feed_base_url) {
      const updater = new NsisUpdater({
        provider: "generic",
        url: config.feed_base_url,
      });
      updater.autoDownload = this.getSettings().autoUpdateEnabled && config.auto_update_enabled_by_default;
      updater.autoInstallOnAppQuit = true;
      this.bindUpdaterEvents(updater);
      this.updater = updater;
    }
  }

  private bindUpdaterEvents(updater: InstanceType<typeof NsisUpdater>) {
    updater.on("checking-for-update", () => {
      this.setState({ status: "checking", message: "Checking for a newer Hommic Print Daemon release..." });
    });
    updater.on("update-available", (info: { version?: string; releaseName?: string | null; releaseNotes?: string | null }) => {
      this.setState({
        status: "available",
        latestVersion: info.version || this.config?.latest_version || "",
        releaseName: String(info.releaseName || this.config?.release_name || ""),
        releaseNotes: typeof info.releaseNotes === "string" ? info.releaseNotes : this.config?.release_notes || "",
        message: "Update found. Downloading in the background...",
      });
    });
    updater.on("update-not-available", () => {
      this.setState({ status: "not-available", message: "You already have the latest daemon version." });
    });
    updater.on("download-progress", (progress: { percent?: number }) => {
      this.setState({
        status: "downloading",
        downloadedPercent: Math.max(0, Math.min(100, Number(progress.percent || 0))),
        message: `Downloading update ${Math.round(Number(progress.percent || 0))}%`,
      });
    });
    updater.on("update-downloaded", () => {
      this.setState({
        status: "downloaded",
        downloadedPercent: 100,
        message: "Update downloaded. It will install automatically when the daemon restarts, or you can install now.",
      });
    });
    updater.on("error", (error: Error) => {
      this.setState({
        status: "error",
        message: error.message || "Auto-update failed.",
      });
    });
  }

  private scheduleChecks() {
    if (this.intervalHandle) clearInterval(this.intervalHandle);
    const minutes = this.config?.check_interval_minutes || 30;
    this.intervalHandle = setInterval(() => {
      if (!this.getSettings().autoUpdateEnabled) return;
      void this.checkForUpdates(false);
    }, Math.max(5, minutes) * 60 * 1000);
  }

  async checkForUpdates(manual = true) {
    try {
      await this.refreshRemoteConfig();
      if (!this.config?.updater_enabled || !this.updater) {
        this.setState({
          status: "disabled",
          message: "Auto-update is currently disabled by admin release settings.",
        });
        return;
      }
      this.updater.autoDownload = this.getSettings().autoUpdateEnabled && this.config.auto_update_enabled_by_default;
      await this.updater.checkForUpdates();
      if (manual) {
        this.setState({
          message: this.getSettings().autoUpdateEnabled
            ? "Checked the update feed."
            : "Checked the update feed. Auto-download is switched off on this PC.",
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Update check failed.";
      this.setState({ status: "error", message });
    }
  }

  async setAutoUpdateEnabled(enabled: boolean) {
    this.setState({
      autoUpdateEnabled: enabled,
      message: enabled ? "Auto-update enabled on this PC." : "Auto-update disabled on this PC.",
    });
    if (this.updater && this.config) {
      this.updater.autoDownload = enabled && this.config.auto_update_enabled_by_default;
    }
  }

  installDownloadedUpdate() {
    this.updater?.quitAndInstall(false, true);
  }

  openReleasePage() {
    if (this.config?.release_page_url) {
      void shell.openExternal(this.config.release_page_url);
    }
  }
}
