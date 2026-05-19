import { app } from "electron";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import type { PrintJob } from "../types";

const execFileAsync = promisify(execFile);

type PrintDiagnostics = Record<string, unknown>;

class PrintExecutionError extends Error {
  diagnostics: PrintDiagnostics;

  constructor(message: string, diagnostics: PrintDiagnostics) {
    super(message);
    this.name = "PrintExecutionError";
    this.diagnostics = diagnostics;
  }
}

function outputDirectory() {
  const directory = join(app.getPath("userData"), "spool");
  if (!existsSync(directory)) {
    mkdirSync(directory, { recursive: true });
  }
  return directory;
}

async function printTextToWindowsPrinter(printerName: string, content: string) {
  const filePath = join(outputDirectory(), `print-${Date.now()}.txt`);
  writeFileSync(filePath, content, "utf-8");
  await execFileAsync("powershell.exe", [
    "-NoProfile",
    "-Command",
    `Get-Content -LiteralPath '${filePath.replace(/'/g, "''")}' | Out-Printer -Name '${printerName.replace(/'/g, "''")}'`,
  ]);
  return filePath;
}

function serializeExecError(error: unknown, diagnostics: PrintDiagnostics) {
  if (!(error instanceof Error)) {
    return {
      message: "Unknown print execution error",
      diagnostics,
    };
  }
  const execError = error as Error & {
    code?: string | number;
    signal?: string;
    stdout?: string;
    stderr?: string;
    cmd?: string;
  };
  return {
    message: execError.message || "Print execution error",
    diagnostics: {
      ...diagnostics,
      exit_code: execError.code ?? "",
      signal: execError.signal ?? "",
      stdout: String(execError.stdout || "").trim(),
      stderr: String(execError.stderr || "").trim(),
      command: String(execError.cmd || "").trim(),
    },
  };
}

async function printRawToWindowsPrinter(printerName: string, content: Buffer) {
  const filePath = join(outputDirectory(), `print-${Date.now()}.bin`);
  writeFileSync(filePath, content);
  const payloadBase64 = content.toString("base64");
  const printerNameEncoded = printerName.replace(/'/g, "''");
  const script = `
$printerName = '${printerNameEncoded}'
$payloadBase64 = '${payloadBase64}'
$source = @"
using System;
using System.Runtime.InteropServices;

public static class RawPrinterHelper
{
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Ansi)]
    public class DOCINFOA
    {
        [MarshalAs(UnmanagedType.LPStr)]
        public string pDocName;
        [MarshalAs(UnmanagedType.LPStr)]
        public string pOutputFile;
        [MarshalAs(UnmanagedType.LPStr)]
        public string pDataType;
    }

    [DllImport("winspool.drv", EntryPoint = "OpenPrinterW", SetLastError = true, CharSet = CharSet.Unicode)]
    public static extern bool OpenPrinter(string szPrinter, out IntPtr hPrinter, IntPtr pd);

    [DllImport("winspool.drv", SetLastError = true)]
    public static extern bool ClosePrinter(IntPtr hPrinter);

    [DllImport("winspool.drv", EntryPoint = "StartDocPrinterA", SetLastError = true, CharSet = CharSet.Ansi)]
    public static extern int StartDocPrinter(IntPtr hPrinter, Int32 level, DOCINFOA di);

    [DllImport("winspool.drv", SetLastError = true)]
    public static extern bool EndDocPrinter(IntPtr hPrinter);

    [DllImport("winspool.drv", SetLastError = true)]
    public static extern bool StartPagePrinter(IntPtr hPrinter);

    [DllImport("winspool.drv", SetLastError = true)]
    public static extern bool EndPagePrinter(IntPtr hPrinter);

    [DllImport("winspool.drv", SetLastError = true)]
    public static extern bool WritePrinter(IntPtr hPrinter, IntPtr pBytes, Int32 dwCount, out Int32 dwWritten);
}
"@
Add-Type -TypeDefinition $source | Out-Null
$bytes = [Convert]::FromBase64String($payloadBase64)
$docInfo = New-Object RawPrinterHelper+DOCINFOA
$docInfo.pDocName = 'Hommic Print Job'
$docInfo.pOutputFile = $null
$docInfo.pDataType = 'RAW'
$printer = [IntPtr]::Zero
if (-not [RawPrinterHelper]::OpenPrinter($printerName, [ref]$printer, [IntPtr]::Zero)) {
  throw ("OpenPrinter failed (Win32=" + [Runtime.InteropServices.Marshal]::GetLastWin32Error() + ")")
}
try {
  $jobId = [RawPrinterHelper]::StartDocPrinter($printer, 1, $docInfo)
  if ($jobId -le 0) { throw ("StartDocPrinter failed (Win32=" + [Runtime.InteropServices.Marshal]::GetLastWin32Error() + ")") }
  if (-not [RawPrinterHelper]::StartPagePrinter($printer)) { throw ("StartPagePrinter failed (Win32=" + [Runtime.InteropServices.Marshal]::GetLastWin32Error() + ")") }
  $ptr = [System.Runtime.InteropServices.Marshal]::AllocCoTaskMem($bytes.Length)
  try {
    [System.Runtime.InteropServices.Marshal]::Copy($bytes, 0, $ptr, $bytes.Length)
    $written = 0
    if (-not [RawPrinterHelper]::WritePrinter($printer, $ptr, $bytes.Length, [ref]$written)) { throw ("WritePrinter failed (Win32=" + [Runtime.InteropServices.Marshal]::GetLastWin32Error() + ")") }
  } finally {
    if ($ptr -ne [IntPtr]::Zero) { [System.Runtime.InteropServices.Marshal]::FreeCoTaskMem($ptr) }
  }
  [RawPrinterHelper]::EndPagePrinter($printer) | Out-Null
  [RawPrinterHelper]::EndDocPrinter($printer) | Out-Null
} finally {
  if ($printer -ne [IntPtr]::Zero) { [RawPrinterHelper]::ClosePrinter($printer) | Out-Null }
}
`;
  try {
    await execFileAsync("powershell.exe", ["-NoProfile", "-Command", script], {
      windowsHide: true,
      timeout: 30000,
      maxBuffer: 1024 * 1024 * 2,
    });
  } catch (error) {
    const serialized = serializeExecError(error, {
      transport: "windows_raw_spool",
      printer_name: printerName,
      artifact_path: filePath,
    });
    throw new PrintExecutionError(serialized.message, serialized.diagnostics);
  }
  return filePath;
}

export async function processPrintJob(
  job: PrintJob,
): Promise<{ ok: boolean; message: string; artifactPath?: string; diagnostics?: PrintDiagnostics }> {
  const rendered = String(job.rendered_content || "");
  const printerName = String(job.payload_json.windows_printer_name || job.payload_json.printer_name || "");

  if (!rendered) {
    return { ok: false, message: "Job has no rendered content." };
  }

  try {
    if (job.rendered_format === "escpos") {
      const decoded = Buffer.from(rendered, "base64");
      if (printerName) {
        const artifactPath = await printRawToWindowsPrinter(printerName, decoded);
        return {
          ok: true,
          message: `Sent raw ESC/POS job to Windows printer ${printerName}`,
          artifactPath,
          diagnostics: {
            transport: "windows_raw_spool",
            printer_name: printerName,
            bytes_sent: decoded.length,
          },
        };
      }
      const artifactPath = join(outputDirectory(), `escpos-${job.id}.bin`);
      writeFileSync(artifactPath, decoded);
      return {
        ok: true,
        message: "Saved ESC/POS payload to spool file because no Windows printer name was mapped.",
        artifactPath,
        diagnostics: {
          transport: "spool_file_only",
          bytes_saved: decoded.length,
        },
      };
    }

    if (job.rendered_format === "html" || job.rendered_format === "pdf") {
      const extension = job.rendered_format === "html" ? "html" : "pdf.html";
      const artifactPath = join(outputDirectory(), `${job.id}.${extension}`);
      writeFileSync(artifactPath, rendered, "utf-8");
      return {
        ok: true,
        message: `Saved ${job.rendered_format.toUpperCase()} preview to spool directory.`,
        artifactPath,
        diagnostics: {
          transport: "preview_file",
          rendered_format: job.rendered_format,
        },
      };
    }

    return { ok: false, message: `Unsupported rendered format: ${job.rendered_format}` };
  } catch (error) {
    if (error instanceof PrintExecutionError) {
      return {
        ok: false,
        message: error.message,
        diagnostics: error.diagnostics,
      };
    }
    const serialized = serializeExecError(error, {
      transport: "windows_print_router",
      printer_name: printerName,
    });
    return {
      ok: false,
      message: serialized.message,
      diagnostics: serialized.diagnostics,
    };
  }
}
