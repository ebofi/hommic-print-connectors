import React from "react";

type DashboardProps = {
  connectionTone: "connected" | "warning" | "disconnected";
  locationName: string;
  heartbeatLabel: string;
  jobsQueued: number;
  jobsToday: number;
  activePrinterName: string;
  activePrinterStation: string;
  syncStatus: string;
  onManagePrinters: () => void;
  onViewQueue: () => void;
  onDisconnect: () => void;
};

export function Dashboard({
  connectionTone,
  locationName,
  heartbeatLabel,
  jobsQueued,
  jobsToday,
  activePrinterName,
  activePrinterStation,
  syncStatus,
  onManagePrinters,
  onViewQueue,
  onDisconnect,
}: DashboardProps) {
  const statusCopy =
    connectionTone === "connected"
      ? `Connected | ${locationName} | Syncing active`
      : connectionTone === "warning"
        ? `Heartbeat stale | ${locationName} | Waiting to reconnect`
        : "Not paired | Complete pairing to start syncing";

  return (
    <div className="workspace-page">
      <div className={`status-bar ${connectionTone}`}>
        <span>{statusCopy}</span>
        {heartbeatLabel ? <span className="status-bar-meta">{heartbeatLabel}</span> : null}
      </div>

      <div className="info-grid">
        <div className="info-card">
          <div className="ic-label">Jobs queued</div>
          <div className="ic-val">{jobsQueued}</div>
        </div>
        <div className="info-card">
          <div className="ic-label">Jobs today</div>
          <div className="ic-val">{jobsToday}</div>
        </div>
        <div className="info-card">
          <div className="ic-label">Active printer</div>
          <div className="ic-val">{activePrinterName}</div>
          <div className="ic-subval">{activePrinterStation}</div>
        </div>
        <div className="info-card">
          <div className="ic-label">Sync status</div>
          <div className="ic-val">{syncStatus}</div>
        </div>
      </div>

      <div className="section-title">Quick actions</div>
      <div className="action-row">
        <button className="btn-ghost action-button" onClick={onManagePrinters}>
          Manage printers
        </button>
        <button className="btn-ghost action-button" onClick={onViewQueue}>
          View queue
        </button>
        <button className="btn-outline-danger action-button" onClick={onDisconnect}>
          Log out
        </button>
      </div>
    </div>
  );
}
