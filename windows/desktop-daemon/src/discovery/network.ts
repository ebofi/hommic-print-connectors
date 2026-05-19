import { Socket } from "node:net";

export async function testNetworkPrinter(host: string, port = 9100, timeoutMs = 1500): Promise<{ ok: boolean; message: string }> {
  return await new Promise((resolve) => {
    const socket = new Socket();
    let settled = false;

    const finish = (ok: boolean, message: string) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve({ ok, message });
    };

    socket.setTimeout(timeoutMs);
    socket.once("connect", () => finish(true, `Connected to ${host}:${port}`));
    socket.once("timeout", () => finish(false, `Connection to ${host}:${port} timed out`));
    socket.once("error", (error) => finish(false, `Connection to ${host}:${port} failed: ${error.message}`));
    socket.connect(port, host);
  });
}
