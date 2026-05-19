import React from "react";

import type { ConnectionState } from "../types/daemon";

type WorkspaceTab = "dashboard" | "printers" | "queue" | "diagnostics" | "about";

type SidebarProps = {
  activeTab: WorkspaceTab;
  onChange: (tab: WorkspaceTab) => void;
  locationName: string;
  connected: boolean;
  syncing: boolean;
  connectivity: ConnectionState;
  queuedJobsCount: number;
  printerCount: number;
  appVersion: string;
};

function NavItem({
  label,
  active,
  onClick,
  badge,
}: {
  label: string;
  active?: boolean;
  onClick: () => void;
  badge?: string;
}) {
  return (
    <button className={`nav-item ${active ? "active" : ""}`} onClick={onClick}>
      <span>{label}</span>
      {badge ? <span className="sidebar-badge">{badge}</span> : null}
    </button>
  );
}

export function Sidebar({
  activeTab,
  onChange,
  locationName,
  connected,
  syncing,
  connectivity,
  queuedJobsCount,
  printerCount,
  appVersion,
}: SidebarProps) {
  const statusLabel = !connected ? "Not paired" : connectivity === "online" && syncing ? "Connected" : connectivity === "offline" ? "Heartbeat stale" : "Disconnected";
  const statusTone = connected && connectivity === "online" && syncing ? "is-green" : connectivity === "offline" ? "is-amber" : "is-red";

  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <img className="brand-logo" src="./assets/hommic-logo.png" alt="Hommic" />
        <div className="logo-sub">Print Daemon v{appVersion}</div>
      </div>

      <div className="sidebar-section">
        <div className="sidebar-label">Workspace</div>
        <NavItem label="Dashboard" active={activeTab === "dashboard"} onClick={() => onChange("dashboard")} />
        <NavItem label="Printers" active={activeTab === "printers"} onClick={() => onChange("printers")} badge={printerCount ? String(printerCount) : undefined} />
        <NavItem label="Print Queue" active={activeTab === "queue"} onClick={() => onChange("queue")} badge={queuedJobsCount ? String(queuedJobsCount) : undefined} />
      </div>

      <div className="sidebar-section">
        <div className="sidebar-label">System</div>
        <NavItem label="Diagnostics" active={activeTab === "diagnostics"} onClick={() => onChange("diagnostics")} />
        <NavItem label="About & Updates" active={activeTab === "about"} onClick={() => onChange("about")} />
      </div>

      <div className="sidebar-bottom">
        <div className="conn-chip">
          <div className="chip-label">Location</div>
          <div className="chip-val">{locationName}</div>
          <div className="chip-label chip-spacer">Status</div>
          <div className="chip-status">
            <span className={`chip-dot ${statusTone}`} />
            <span>{statusLabel}</span>
          </div>
        </div>
      </div>
    </aside>
  );
}
