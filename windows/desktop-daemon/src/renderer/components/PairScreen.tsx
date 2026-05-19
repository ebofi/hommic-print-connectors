import React from "react";

type StepStatus = "pending" | "active" | "done" | "error";

type ConnectionStep = {
  id: "internet" | "server" | "code" | "register";
  title: string;
  detail: string;
  status: StepStatus;
};

type PairScreenProps = {
  locationName: string;
  pairingCode: string;
  error?: string;
  mode?: "pair" | "connecting";
  steps?: ConnectionStep[];
  onLocationNameChange: (value: string) => void;
  onPairingCodeChange: (value: string) => void;
  onSubmit: () => void;
  onRetry?: () => void;
  onBack?: () => void;
};

function stepGlyph(status: StepStatus) {
  if (status === "active") return "...";
  if (status === "done") return "OK";
  if (status === "error") return "X";
  return "-";
}

export function PairScreen({
  locationName,
  pairingCode,
  error,
  mode = "pair",
  steps = [],
  onLocationNameChange,
  onPairingCodeChange,
  onSubmit,
  onRetry,
  onBack,
}: PairScreenProps) {
  if (mode === "connecting") {
    const hasCodeError = steps.some((step) => step.id === "code" && step.status === "error");

    return (
      <div className="pair-screen">
        <div className="pair-logo">
          <img className="pair-logo-image" src="./assets/hommic-logo.png" alt="Hommic" />
          <div className="pair-logo-sub">Connecting this Windows print connector</div>
        </div>
        <div className="pair-card wide">
          <h2>Connecting to Hommic</h2>
          <p>We are validating the pairing code and preparing this PC for live printer syncing.</p>
          <div className="connect-steps">
            {steps.map((step) => (
              <div className="step-item" key={step.id}>
                <div className={`step-icon ${step.status}`}>{stepGlyph(step.status)}</div>
                <div className="step-info">
                  <div className="step-title">{step.title}</div>
                  <div className="step-detail">{step.detail}</div>
                </div>
              </div>
            ))}
          </div>
          {error ? <div className="error-banner">{error}</div> : null}
          {error ? (
            <div className="page-actions">
              {hasCodeError ? (
                <button className="btn-ghost action-button" onClick={onBack}>
                  Back
                </button>
              ) : null}
              <button className="btn-primary action-button" onClick={onRetry}>
                Retry
              </button>
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="pair-screen">
      <div className="pair-logo">
        <img className="pair-logo-image" src="./assets/hommic-logo.png" alt="Hommic" />
        <div className="pair-logo-sub">Windows print connector setup</div>
      </div>
      <div className="pair-card">
        <h2>Pair this device</h2>
        <p>Enter the pairing code from your Hommic merchant panel and name this location so merchants can identify this PC.</p>
        <div className="field-group">
          <div className="field-label">Location name</div>
          <input className="field-input" value={locationName} onChange={(event) => onLocationNameChange(event.target.value)} placeholder="e.g. Front Counter, Kitchen, Bar POS" />
        </div>
        <div className="field-group">
          <div className="field-label">Pairing code</div>
          <input className="field-input" value={pairingCode} onChange={(event) => onPairingCodeChange(event.target.value.toUpperCase())} placeholder="Enter code from Hommic merchant panel" />
        </div>
        {error ? <div className="error-banner compact">{error}</div> : null}
        <button className="btn-primary" onClick={onSubmit}>
          Pair to Hommic
        </button>
      </div>
    </div>
  );
}
