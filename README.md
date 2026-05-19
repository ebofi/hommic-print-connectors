# Hommic Print Connectors

Platform connectors and device agents for the Hommic Print Engine.

This repository is intended to hold multiple connector targets under one roof so release, pairing, update, and support workflows stay consistent across platforms.

## Platforms

- `windows/desktop-daemon`
  - Electron-based Windows tray daemon
  - NSIS installer packaging
  - Backend pairing, heartbeat, job polling, and desktop auto-update flow

- `android/print-connector`
  - Android print connector app
  - Merchant-side pairing and printer runtime support

## Release model

- Windows installers are released from GitHub Releases
- The Hommic SaaS backend publishes the update feed and `latest.yml`
- Customer PCs download public installers from the GitHub release asset URL

## Recommended tags

- Windows daemon: `v0.1.1`
- Future Android connector tags can use platform-specific notes in the release description

## Notes

- Keep platform build artifacts out of git
- Commit source, scripts, and packaging config
- Publish installer binaries as GitHub release assets instead of committing them into the repo
