import type {
  PairResult,
  PrinterDiscoveryRecord,
  PrintJob,
} from "../types";

type JsonObject = Record<string, unknown>;

export class PrintApiClient {
  constructor(private readonly getBaseUrl: () => string, private readonly getToken: () => string) {}

  private async request<T>(path: string, init?: RequestInit, authenticated = true): Promise<T> {
    const headers = new Headers(init?.headers || {});
    headers.set("Content-Type", "application/json");
    if (authenticated) {
      const token = this.getToken();
      if (!token) {
        throw new Error("Daemon is not paired yet.");
      }
      headers.set("X-Print-Agent-Token", token);
    }

    const response = await fetch(`${this.getBaseUrl().replace(/\/$/, "")}${path}`, {
      ...init,
      headers,
    });
    const body = (await response.json().catch(() => ({}))) as JsonObject;
    if (!response.ok) {
      throw new Error(String(body.detail || "Request failed"));
    }
    return body as T;
  }

  pair(pairingCode: string, name: string, appVersion: string, metadata: JsonObject) {
    return this.request<PairResult>(
      "/api/print-agent/pair/verify",
      {
        method: "POST",
        body: JSON.stringify({
          pairing_code: pairingCode,
          name,
          platform: "windows",
          app_version: appVersion,
          metadata,
        }),
      },
      false,
    );
  }

  heartbeat(appVersion: string, metadata: JsonObject) {
    return this.request<{ status: string; last_seen_at: string }>("/api/print-agent/heartbeat", {
      method: "POST",
      body: JSON.stringify({
        app_version: appVersion,
        status: "online",
        metadata,
      }),
    });
  }

  listJobs() {
    return this.request<PrintJob[]>("/api/print-agent/jobs", { method: "GET" });
  }

  claimJob(jobId: string, printerDeviceId?: string) {
    return this.request<PrintJob>(`/api/print-agent/jobs/${jobId}/claim`, {
      method: "POST",
      body: JSON.stringify({ printer_device_id: printerDeviceId || null }),
    });
  }

  updateJobStatus(jobId: string, status: "printing" | "printed" | "failed" | "cancelled", errorMessage?: string, rawResponse?: JsonObject) {
    return this.request<PrintJob>(`/api/print-agent/jobs/${jobId}/status`, {
      method: "POST",
      body: JSON.stringify({
        status,
        error_message: errorMessage || null,
        raw_response: rawResponse || null,
      }),
    });
  }

  syncDiscoveredPrinters(printers: PrinterDiscoveryRecord[]) {
    return this.request<Array<{ id: string; metadata?: Record<string, unknown>; name: string }>>("/api/print-agent/printers/discovered", {
      method: "POST",
      body: JSON.stringify({ printers }),
    });
  }

  updatePrinterStatus(printerId: string, status: "online" | "offline" | "error" | "disabled", paperStatus?: string, rawResponse?: JsonObject) {
    return this.request(`/api/print-agent/printers/${printerId}/status`, {
      method: "POST",
      body: JSON.stringify({
        status,
        paper_status: paperStatus || null,
        raw_response: rawResponse || null,
      }),
    });
  }

  deletePrinter(printerId: string) {
    return this.request<{ ok: boolean }>(`/api/print-agent/printers/${printerId}`, {
      method: "DELETE",
    });
  }

  unpair() {
    return this.request<{ ok: boolean }>("/api/print-agent/unpair", {
      method: "POST",
    });
  }
}
