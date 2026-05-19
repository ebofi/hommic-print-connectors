import React from "react";

import type { ConnectionState } from "../types/daemon";

type TitlebarProps = {
  connected: boolean;
  syncing: boolean;
  connectivity: ConnectionState;
  onMinimize: () => void;
  onMaximize: () => void;
  onClose: () => void;
};

export function Titlebar({ connected, syncing, connectivity, onMinimize, onMaximize, onClose }: TitlebarProps) {
  const label = !connected ? "Not paired" : connectivity === "online" && syncing ? "Connected" : connectivity === "offline" ? "Heartbeat stale" : "Disconnected";
  const dotClass = connected && connectivity === "online" && syncing ? "is-connected" : "is-disconnected";

  return (
    <header className="titlebar">
      <div className="titlebar-controls no-drag">
        <button className="traffic-light tc-close" aria-label="Close" onClick={onClose} />
        <button className="traffic-light tc-min" aria-label="Minimize" onClick={onMinimize} />
        <button className="traffic-light tc-max" aria-label="Maximize" onClick={onMaximize} />
      </div>
      <div className="titlebar-title">
        <div className={`titlebar-dot ${dotClass}`} />
        <span>Hommic Print Daemon</span>
      </div>
      <div className="titlebar-status">{label}</div>
    </header>
  );
}
