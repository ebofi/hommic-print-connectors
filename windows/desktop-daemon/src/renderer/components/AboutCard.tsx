import React from "react";

type AboutCardProps = {
  currentVersion: string;
  latestVersion: string;
  copyrightNotice: string;
  gitTag: string;
  status: string;
  message: string;
  progress: number;
  autoUpdateEnabled: boolean;
  onToggleAutoUpdate: (enabled: boolean) => void;
  onCheckForUpdates: () => void;
  onInstallNow: () => void;
  onOpenReleasePage: () => void;
};

function statusLabel(status: string) {
  if (status === "error") return "Unavailable";
  if (status === "not-available") return "Up to date";
  return status.replace(/-/g, " ");
}

export function AboutCard({
  currentVersion,
  latestVersion,
  copyrightNotice,
  gitTag,
  status,
  message,
  progress,
  autoUpdateEnabled,
  onToggleAutoUpdate,
  onCheckForUpdates,
  onInstallNow,
  onOpenReleasePage,
}: AboutCardProps) {
  const badgeClass = status === "downloaded" || status === "available" ? "badge-online" : status === "error" ? "badge-offline" : "badge-preview";

  return (
    <div className="workspace-page">
      <div className="page-header">
        <h1>About & Updates</h1>
        <p>Version information and update controls for this Windows connector.</p>
      </div>
      <div className="page-body">
        <div className="info-grid">
          <div className="info-card">
            <div className="ic-label">Current version</div>
            <div className="ic-val">v{currentVersion}</div>
          </div>
          <div className="info-card">
            <div className="ic-label">Latest published</div>
            <div className="ic-val">{latestVersion ? (/^\d/.test(latestVersion) ? `v${latestVersion}` : latestVersion) : "Not published yet"}</div>
          </div>
          <div className="info-card">
            <div className="ic-label">Git release tag</div>
            <div className="ic-val">{gitTag || "No tag attached"}</div>
          </div>
          <div className="info-card">
            <div className="ic-label">Copyright</div>
            <div className="ic-val small-copy">{copyrightNotice}</div>
          </div>
        </div>

        <div className="update-panel">
          <div className="update-row">
            <span className={`badge ${badgeClass}`}>{statusLabel(status)}</span>
            <span className="update-message">{message}</span>
          </div>
          {status === "downloading" ? (
            <div className="progress-track">
              <div className="progress-fill" style={{ width: `${Math.max(3, progress)}%` }} />
            </div>
          ) : null}
          <div className="toggle-row">
            <button type="button" className={`toggle-pill ${autoUpdateEnabled ? "is-on" : ""}`} onClick={() => onToggleAutoUpdate(!autoUpdateEnabled)}>
              <span className="toggle-thumb" />
            </button>
            <div>
              <div className="mini-label">Auto update</div>
              <div className="small-copy">{autoUpdateEnabled ? "Enabled on this PC by default" : "Disabled on this PC"}</div>
            </div>
          </div>
          <div className="page-actions">
            <button className="btn-primary action-button" onClick={onCheckForUpdates}>
              Check for update
            </button>
            {status === "downloaded" ? (
              <button className="btn-ghost action-button" onClick={onInstallNow}>
                Install now
              </button>
            ) : (
              <button className="btn-ghost action-button" onClick={onOpenReleasePage}>
                Open release page
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
