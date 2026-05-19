import React from "react";

import type { Printer } from "../types/daemon";

type DeviceHealthProps = {
  printers: Printer[];
  selectedPrinterTempId: string;
  printerStations: Record<string, string>;
  showVirtualPrinters: boolean;
  busy: boolean;
  onSelect: (tempId: string) => void;
  onChangeStation: (tempId: string, station: string) => void;
  onToggleVirtualPrinters: (enabled: boolean) => void;
  onHidePrinter: (tempId: string) => void;
  onDeletePrinter: (tempId: string) => void;
  onRescan: () => void;
  detectPrinterBadge: (printer: Printer) => { label: string; className: string };
  printerDescriptor: (printer: Printer) => { port: string; driver: string; width: string };
};

const stationOptions = ["Front Counter", "Kitchen", "Reception", "Delivery", "Bar", "Dispatch", "Pickup"];

export function DeviceHealth({
  printers,
  selectedPrinterTempId,
  printerStations,
  showVirtualPrinters,
  busy,
  onSelect,
  onChangeStation,
  onToggleVirtualPrinters,
  onHidePrinter,
  onDeletePrinter,
  onRescan,
  detectPrinterBadge,
  printerDescriptor,
}: DeviceHealthProps) {
  return (
    <div className="workspace-page">
      <div className="page-header">
        <h1>Printers</h1>
        <p>All printers installed on this PC are available to the daemon.</p>
      </div>
      <div className="page-body">
        <div className="printer-list">
          {printers.length ? (
            printers.map((printer) => {
              const badge = detectPrinterBadge(printer);
              const descriptor = printerDescriptor(printer);
              return (
                <div
                  key={printer.temp_id}
                  className={`printer-card ${selectedPrinterTempId === printer.temp_id ? "selected" : ""}`}
                  onClick={() => onSelect(printer.temp_id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      onSelect(printer.temp_id);
                    }
                  }}
                >
                  <div className="printer-info">
                    <div className="printer-name">
                      {printer.name}
                      {selectedPrinterTempId === printer.temp_id ? <span className="printer-active-tag">Active</span> : null}
                    </div>
                    <div className="printer-meta">
                      {descriptor.port} | {descriptor.driver} | {descriptor.width}
                    </div>
                    <div className="printer-station-row">
                      <span className="printer-station-label">Station</span>
                      <select
                        className="printer-station-select"
                        value={String(printerStations[printer.temp_id] || printer.metadata.station_role || "")}
                        onChange={(event) => {
                          event.stopPropagation();
                          onChangeStation(printer.temp_id, event.target.value);
                        }}
                        onClick={(event) => event.stopPropagation()}
                      >
                        <option value="">Unassigned</option>
                        {stationOptions.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="printer-station-row">
                      <button
                        className="btn-ghost action-button"
                        onClick={(event) => {
                          event.stopPropagation();
                          onHidePrinter(printer.temp_id);
                        }}
                      >
                        Hide on this PC
                      </button>
                      <button
                        className="btn-outline-danger action-button"
                        onClick={(event) => {
                          event.stopPropagation();
                          onDeletePrinter(printer.temp_id);
                        }}
                      >
                        {printer.metadata.synced_printer_device_id ? "Delete from SaaS" : "Remove"}
                      </button>
                    </div>
                  </div>
                  <span className={`badge ${badge.className}`}>{badge.label}</span>
                </div>
              );
            })
          ) : (
            <div className="empty-state">
              No printers found yet. Run a scan to load Windows printers, including Bluetooth printers already paired in Windows.
            </div>
          )}
        </div>
        <div className="page-actions">
          <label className="inline-flex items-center gap-2 text-sm text-neutral-600">
            <input
              type="checkbox"
              checked={showVirtualPrinters}
              onChange={(event) => onToggleVirtualPrinters(event.target.checked)}
            />
            Show virtual printers
          </label>
          <button className="btn-ghost action-button" onClick={onRescan} disabled={busy}>
            {busy ? "Scanning..." : "Rescan"}
          </button>
        </div>
        <div className="hint-card">
          Use a station label like Kitchen, Reception, or Delivery so SaaS can route the right print job to the right workstation. Enable virtual printers only when you want Windows PDF or preview targets to appear alongside physical devices.
        </div>
      </div>
    </div>
  );
}
