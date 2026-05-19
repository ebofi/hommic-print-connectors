import { execFile } from "node:child_process";
import { promisify } from "node:util";

import type { PrinterDiscoveryRecord } from "../types";

const execFileAsync = promisify(execFile);

type WindowsPrinterRow = {
  Name?: string;
  DriverName?: string;
  PortName?: string;
  ComputerName?: string;
  PrinterStatus?: string | number | null;
  WorkOffline?: boolean | null;
  PaperSize?: string | number | null;
};

function normalizeRows(payload: unknown): WindowsPrinterRow[] {
  if (Array.isArray(payload)) return payload as WindowsPrinterRow[];
  if (payload && typeof payload === "object") return [payload as WindowsPrinterRow];
  return [];
}

function inferPrinterType(row: WindowsPrinterRow): PrinterDiscoveryRecord["type"] {
  const port = String(row.PortName || "").toUpperCase();
  const driver = String(row.DriverName || "").toUpperCase();
  if (isVirtualPrinter(row)) return "browser_pdf";
  if (driver.includes("STAR")) return "star";
  if (port.includes("IP_") || port.includes("TCP") || port.includes("WSD")) return "escpos_network";
  return "escpos_usb";
}

function isVirtualPrinter(row: WindowsPrinterRow) {
  const haystack = `${row.Name || ""} ${row.DriverName || ""} ${row.PortName || ""}`.toLowerCase();
  return ["onenote", "bullzip", "pdf", "xps", "fax", "microsoft print to pdf"].some((needle) => haystack.includes(needle));
}

function isActivePrinter(row: WindowsPrinterRow, includeVirtualPrinters = false) {
  const status = String(row.PrinterStatus ?? "").toLowerCase();
  const numericStatus = Number(row.PrinterStatus);
  if (row.WorkOffline === true) return false;
  if (!includeVirtualPrinters && isVirtualPrinter(row)) return false;
  if (status && !["0", "3", "normal", "idle", "unknown"].includes(status) && !Number.isNaN(numericStatus) && ![0, 3].includes(numericStatus)) {
    return false;
  }
  return true;
}

function inferPaperWidth(row: WindowsPrinterRow): PrinterDiscoveryRecord["paper_width"] {
  const haystack = `${row.Name || ""} ${row.DriverName || ""} ${row.PortName || ""}`.toLowerCase();
  const paperSize = Number(row.PaperSize);
  if ([1, 9, 11, 12, 13].includes(paperSize) || haystack.includes("laser") || haystack.includes("canon")) {
    return "a4";
  }
  if (haystack.includes("58") || haystack.includes("2inch") || haystack.includes("2-inch")) {
    return "58mm";
  }
  if (
    haystack.includes("80") ||
    haystack.includes("thermal") ||
    haystack.includes("receipt") ||
    haystack.includes("escpos") ||
    haystack.includes("pos") ||
    haystack.includes("epson") ||
    haystack.includes("tvs") ||
    haystack.includes("tm-") ||
    haystack.includes("rp ")
  ) {
    return "80mm";
  }
  return "a4";
}

export async function discoverWindowsPrinters(includeVirtualPrinters = false): Promise<PrinterDiscoveryRecord[]> {
  try {
    const { stdout } = await execFileAsync("powershell.exe", [
      "-NoProfile",
      "-Command",
      "$printers = Get-Printer | ForEach-Object { $cfg = Get-PrintConfiguration -PrinterName $_.Name -ErrorAction SilentlyContinue; [pscustomobject]@{ Name = $_.Name; DriverName = $_.DriverName; PortName = $_.PortName; ComputerName = $_.ComputerName; PrinterStatus = $_.PrinterStatus; WorkOffline = $_.WorkOffline; PaperSize = if ($cfg) { $cfg.PaperSize } else { $null } } }; $printers | ConvertTo-Json -Depth 4",
    ]);
    const parsed = JSON.parse(stdout || "[]");
    const rows = normalizeRows(parsed);
    return rows
      .filter((row) => String(row.Name || "").trim())
      .filter((row) => isActivePrinter(row, includeVirtualPrinters))
      .map((row) => ({
        temp_id: `windows:${String(row.Name).trim().toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
        name: String(row.Name).trim(),
        type: inferPrinterType(row),
        connection_mode: "desktop_agent",
        vendor: String(row.DriverName || "").split(" ")[0] || "Windows",
        model: String(row.DriverName || "").trim() || "Windows Printer",
        paper_width: inferPaperWidth(row),
        metadata: {
          windows_printer_name: String(row.Name || "").trim(),
          driver_name: String(row.DriverName || "").trim(),
          port_name: String(row.PortName || "").trim(),
          computer_name: String(row.ComputerName || "").trim(),
          printer_status: row.PrinterStatus ?? "",
          configured_paper_size: row.PaperSize ?? "",
          is_virtual_printer: isVirtualPrinter(row),
          output_mode: isVirtualPrinter(row) ? "preview" : "raw",
        },
      }));
  } catch {
    return [];
  }
}
