import React from "react";

import type { Printer } from "../types/daemon";

type PrinterScanScreenProps = {
  printers: Printer[];
  selectedPrinterTempId: string;
  busy: boolean;
  onSelect: (tempId: string) => void;
  onScan: () => void;
  onContinue: () => void;
  onSkip: () => void;
};

function truncateValue(value: string, limit: number) {
  const clean = value.trim();
  if (clean.length <= limit) return clean;
  return `${clean.slice(0, Math.max(0, limit - 1)).trimEnd()}…`;
}

function compactPrinterDetails(printer: Printer) {
  const port = String(printer.metadata.port_name || "Windows printer port").trim();
  const driver = String(printer.metadata.driver_name || printer.model || "Windows printer driver").trim();
  const shortName = truncateValue(printer.name, 34);
  const detailParts = [truncateValue(port, 18)];
  if (driver && driver.toLowerCase() !== port.toLowerCase()) {
    detailParts.push(truncateValue(driver, 28));
  }
  return {
    shortName,
    shortMeta: detailParts.join(" • "),
    fullMeta: `${port} | ${driver}`,
  };
}

function badgeForPrinter(printer: Printer) {
  const name = `${printer.name} ${printer.model}`.toLowerCase();
  const port = String(printer.metadata.port_name || "").toLowerCase();
  if (name.includes("pdf") || name.includes("xps") || name.includes("fax") || name.includes("bullzip")) {
    return { label: "Virtual", className: "badge-preview" };
  }
  if (name.includes("bluetooth") || port.includes("bluetooth") || port.startsWith("bt")) {
    return { label: "Bluetooth", className: "badge-bt" };
  }
  if (printer.type === "escpos_network" || port.includes("ip_") || port.includes("tcp") || port.includes("wsd")) {
    return { label: "Network", className: "badge-online" };
  }
  return { label: "USB", className: "badge-online" };
}

export function PrinterScanScreen({
  printers,
  selectedPrinterTempId,
  busy,
  onSelect,
  onScan,
  onContinue,
  onSkip,
}: PrinterScanScreenProps) {
  return (
    <div className="pair-screen">
      <div className="pair-logo">
        <img className="pair-logo-image" src="./assets/hommic-logo.png" alt="Hommic" />
        <div className="pair-logo-sub">Pairing completed successfully</div>
      </div>
      <div className="pair-card wide">
        <h2>Scan for printers</h2>
        <p>Find printers available on this PC. Includes USB, network, and Bluetooth printers already installed in Windows.</p>
        <button className="btn-primary" onClick={onScan} disabled={busy}>
          {busy ? "Scanning..." : "Scan for printers"}
        </button>
        <div className="hint-card">
          Bluetooth printers that are paired in Windows will appear here.
        </div>
        {printers.length ? (
          <>
            <div className="printer-list scan-results">
              {printers.map((printer) => {
                const badge = badgeForPrinter(printer);
                const details = compactPrinterDetails(printer);
                return (
                  <button
                    key={printer.temp_id}
                    className={`printer-card ${selectedPrinterTempId === printer.temp_id ? "selected" : ""}`}
                    onClick={() => onSelect(printer.temp_id)}
                    title={`${printer.name}\n${details.fullMeta}`}
                  >
                    <div className="printer-info">
                      <div className="printer-name">{details.shortName}</div>
                      <div className="printer-meta">{details.shortMeta}</div>
                    </div>
                    <span className={`badge ${badge.className}`}>{badge.label}</span>
                  </button>
                );
              })}
            </div>
            <div className="page-actions">
              <button className="btn-primary action-button" onClick={onContinue} disabled={!selectedPrinterTempId}>
                Continue
              </button>
            </div>
          </>
        ) : null}
        <button className="skip-link" onClick={onSkip}>
          Skip for now
        </button>
      </div>
    </div>
  );
}
