# Hommic Print Daemon

Windows-first desktop connector for the Hommic SaaS Print Engine.

## What it does

- pairs a merchant PC to the SaaS Print Engine using a pairing code
- runs in the Windows tray
- discovers installed Windows printers
- heartbeats to the backend
- polls print jobs in real time
- claims jobs and processes them locally
- prepares the project for customer-friendly `.exe` packaging through NSIS

## Scripts

- `npm install`
- `npm run build`
- `npm run dev`
- `npm run dist:win`

## EXE output

Running `npm run dist:win` builds a Windows installer under:

- `desktop-daemon/release/`

The default target is an NSIS installer `.exe`.

## Current implementation scope

- real backend pairing, heartbeat, job polling, and discovered-printer sync
- Windows installed printer discovery through PowerShell `Get-Printer`
- spool-file output and Windows text-printer routing scaffold

## Next hardening steps

- native USB ESC/POS driver integration
- raw byte printing adapters
- Windows auto-start registration
- signed installer
- auto-update channel
