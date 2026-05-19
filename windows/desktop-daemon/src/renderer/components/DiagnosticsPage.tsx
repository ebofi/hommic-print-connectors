import React from "react";

type DiagnosticsPageProps = {
  connected: boolean;
  syncing: boolean;
  heartbeatLabel: string;
  lastHeartbeatAt: string;
  logs: string[];
  printerCount: number;
  busy: boolean;
  onResync: () => void | Promise<void>;
};

export function DiagnosticsPage({
  connected,
  syncing,
  heartbeatLabel,
  lastHeartbeatAt,
  logs,
  printerCount,
  busy,
  onResync,
}: DiagnosticsPageProps) {
  return (
    <div className="workspace-page">
      <div className="page-header">
        <div>
          <h1>Diagnostics</h1>
          <p>Connection health, heartbeat state, and recent daemon logs.</p>
        </div>
        <button className="btn-primary action-button" onClick={() => void onResync()} disabled={busy}>
          {busy ? "Resyncing..." : "Resync now"}
        </button>
      </div>
      <div className="page-body">
        <div className="info-grid">
          <div className="info-card">
            <div className="ic-label">Connection</div>
            <div className="ic-val">{connected ? "Connected" : "Not paired"}</div>
          </div>
          <div className="info-card">
            <div className="ic-label">Sync</div>
            <div className="ic-val">{syncing ? "Running" : "Paused"}</div>
          </div>
          <div className="info-card">
            <div className="ic-label">Heartbeat</div>
            <div className="ic-val">{heartbeatLabel || "Not available yet"}</div>
          </div>
          <div className="info-card">
            <div className="ic-label">Discovered printers</div>
            <div className="ic-val">{printerCount}</div>
          </div>
        </div>
        <div className="hint-card">{lastHeartbeatAt ? `Last heartbeat timestamp: ${lastHeartbeatAt}` : "Heartbeat will appear after the daemon completes its first sync."}</div>
        <div className="section-title">Recent logs</div>
        <pre className="diagnostics-log">{logs.join("\n") || "No logs yet."}</pre>
      </div>
    </div>
  );
}
