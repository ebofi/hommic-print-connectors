import os from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type WindowsRuntimeTelemetry = {
  platform: string;
  architecture: string;
  hostName: string;
  osRelease: string;
  osVersion: string;
  osName: string;
  minimumSupportedWindows: string;
  supported: boolean;
  supportMessage: string;
  powershellVersion: string;
  spoolerStatus: string;
  spoolerStartType: string;
  spoolerAutoStartAttempted: boolean;
  spoolerAutoStartSucceeded: boolean;
  dependencyBootstrapMessage: string;
  issues: string[];
  checkedAt: string;
};

type ServiceState = {
  status: string;
  startType: string;
};

function parseWindowsMajor(release: string) {
  const major = Number.parseInt(String(release || "").split(".")[0] || "", 10);
  return Number.isFinite(major) ? major : 0;
}

async function runPowerShell(command: string) {
  return execFileAsync("powershell.exe", ["-NoProfile", "-Command", command], {
    windowsHide: true,
    timeout: 15000,
    maxBuffer: 1024 * 1024,
  });
}

async function readPowerShellVersion() {
  try {
    const { stdout } = await runPowerShell("$PSVersionTable.PSVersion.ToString()");
    return stdout.trim() || "unknown";
  } catch {
    return "unavailable";
  }
}

async function readWindowsCaption() {
  try {
    const { stdout } = await runPowerShell("(Get-CimInstance Win32_OperatingSystem).Caption");
    return stdout.trim() || "Windows";
  } catch {
    return "Windows";
  }
}

async function readSpoolerState(): Promise<ServiceState> {
  try {
    const { stdout } = await runPowerShell(
      "$svc = Get-CimInstance Win32_Service -Filter \"Name='Spooler'\"; if ($null -eq $svc) { throw 'Spooler service not found' }; $svc | Select-Object State, StartMode | ConvertTo-Json -Compress",
    );
    const payload = JSON.parse(stdout.trim()) as { State?: string; StartMode?: string };
    return {
      status: String(payload.State || "Unknown"),
      startType: String(payload.StartMode || "Unknown"),
    };
  } catch {
    return {
      status: "Unknown",
      startType: "Unknown",
    };
  }
}

async function ensureSpoolerRunning(current: ServiceState) {
  if (current.status.toLowerCase() === "running") {
    return { attempted: false, succeeded: true, next: current };
  }

  try {
    await runPowerShell("Start-Service -Name Spooler -ErrorAction Stop");
    const next = await readSpoolerState();
    return {
      attempted: true,
      succeeded: next.status.toLowerCase() === "running",
      next,
    };
  } catch {
    return {
      attempted: true,
      succeeded: false,
      next: current,
    };
  }
}

export async function collectWindowsRuntimeTelemetry(): Promise<WindowsRuntimeTelemetry> {
  const platform = process.platform;
  const architecture = process.arch;
  const hostName = os.hostname();
  const osRelease = os.release();
  const osVersion = typeof os.version === "function" ? os.version() : osRelease;
  const minimumSupportedWindows = "Windows 10";
  const issues: string[] = [];
  const checkedAt = new Date().toISOString();

  if (platform !== "win32") {
    return {
      platform,
      architecture,
      hostName,
      osRelease,
      osVersion,
      osName: os.type(),
      minimumSupportedWindows,
      supported: false,
      supportMessage: "This daemon build is intended for Windows desktop environments only.",
      powershellVersion: "unavailable",
      spoolerStatus: "Unknown",
      spoolerStartType: "Unknown",
      spoolerAutoStartAttempted: false,
      spoolerAutoStartSucceeded: false,
      dependencyBootstrapMessage: "No dependency bootstrap was attempted because the host is not Windows.",
      issues: ["Unsupported platform"],
      checkedAt,
    };
  }

  const osName = await readWindowsCaption();
  const powershellVersion = await readPowerShellVersion();
  const spoolerState = await readSpoolerState();
  const spoolerResult = await ensureSpoolerRunning(spoolerState);
  const supported = parseWindowsMajor(osRelease) >= 10;

  if (!supported) {
    issues.push(`Unsupported Windows version detected. ${minimumSupportedWindows} or newer is required.`);
  }
  if (powershellVersion === "unavailable") {
    issues.push("PowerShell is not available for spooler and print helper commands.");
  }
  if (spoolerResult.next.status.toLowerCase() !== "running") {
    issues.push("Windows Print Spooler is not running.");
  }
  if (spoolerResult.attempted && !spoolerResult.succeeded) {
    issues.push("The daemon could not auto-start the Windows Print Spooler.");
  }

  const supportMessage = supported
    ? `Compatible with ${minimumSupportedWindows} and Windows 11.`
    : `Unsupported operating system. This daemon currently supports ${minimumSupportedWindows} and Windows 11.`;

  return {
    platform,
    architecture,
    hostName,
    osRelease,
    osVersion,
    osName,
    minimumSupportedWindows,
    supported,
    supportMessage,
    powershellVersion,
    spoolerStatus: spoolerResult.next.status,
    spoolerStartType: spoolerResult.next.startType,
    spoolerAutoStartAttempted: spoolerResult.attempted,
    spoolerAutoStartSucceeded: spoolerResult.succeeded,
    dependencyBootstrapMessage:
      "No separate runtime installer is required. The daemon ships its Electron runtime and validates PowerShell plus the Windows Print Spooler in the background.",
    issues,
    checkedAt,
  };
}
