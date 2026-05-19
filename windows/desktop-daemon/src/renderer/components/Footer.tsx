import React from "react";

type FooterProps = {
  onViewLogs: () => void;
  onOpenSaas: () => void;
  onQuit: () => void;
};

export function Footer({ onViewLogs, onOpenSaas, onQuit }: FooterProps) {
  return (
    <footer className="footer">
      <div className="footer-text">Windows print connector | Merchant-scoped access</div>
      <div className="footer-actions">
        <button className="footer-link" onClick={onViewLogs}>
          View logs
        </button>
        <button className="footer-link" onClick={onOpenSaas}>
          Open merchant portal
        </button>
        <button className="footer-link" onClick={onQuit}>
          Quit
        </button>
      </div>
    </footer>
  );
}
