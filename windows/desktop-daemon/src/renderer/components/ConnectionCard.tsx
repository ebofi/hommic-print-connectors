import React from "react";

type ConnectionCardProps = {
  pairingCode: string;
  agentName: string;
  paired: boolean;
  running: boolean;
  pairedAgentId: string;
  heartbeatText: string;
  onPair: () => void;
  onDiscoverPrinters: () => void;
  onStartSync: () => void;
  onStopSync: () => void;
  onUnpair: () => void;
};

function Field({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="conn-field">
      <label>{label}</label>
      <div className={`conn-input ${accent ? "is-accent" : ""}`}>{value}</div>
    </div>
  );
}

export function ConnectionCard({
  pairingCode,
  agentName,
  paired,
  running,
  pairedAgentId,
  heartbeatText,
  onPair,
  onDiscoverPrinters,
  onStartSync,
  onStopSync,
  onUnpair,
}: ConnectionCardProps) {
  return (
    <section className="card">
      <div className="card-title">Connection workspace</div>
      <div className="card-sub">Use the pairing code from the merchant print engine, then keep sync running so this PC can claim and print jobs.</div>
      <div className="divider" />
      <div className="status-row">
        <span className={`badge ${running ? "badge-online" : paired ? "badge-preview" : "badge-fallback"}`}>
          {running ? "Agent online" : paired ? "Paired" : "Not paired"}
        </span>
        <span className="status-caption">{pairedAgentId ? `Agent ID ${pairedAgentId}` : "No paired agent yet"}</span>
      </div>
      <div className="conn-grid">
        <Field label="Agent name" value={agentName || "Unnamed Windows PC"} />
        <Field label="Heartbeat" value={heartbeatText} accent={running} />
        <Field label="Pairing code" value={pairingCode || "Enter from merchant panel"} />
        <Field label="Printer discovery" value={paired ? "Ready to sync Windows printers" : "Pair first to sync printers"} />
      </div>
      <div className="pairing-row">
        <button className="btn-primary" onClick={onPair}>
          {paired ? "Repair daemon" : "Pair daemon"}
        </button>
        <button className="btn-secondary" onClick={onDiscoverPrinters}>
          Discover printers
        </button>
      </div>
      <div className="pairing-row pairing-row-secondary">
        <button className="btn-secondary" onClick={running ? onStopSync : onStartSync}>
          {running ? "Stop sync" : "Start sync"}
        </button>
        <button className="btn-secondary" onClick={onUnpair} disabled={!paired}>
          Unpair daemon
        </button>
      </div>
    </section>
  );
}
