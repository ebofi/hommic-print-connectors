# Hommic Android Print Connector

Android foreground print agent for the Hommic Print Engine.

## Capabilities

- Pair with the Hommic merchant print engine by pairing code
- Keep a foreground service online for heartbeat, WebSocket push, and fallback polling
- Discover Android printer targets:
  - Bluetooth ESC/POS
  - USB OTG ESC/POS
  - LAN/TCP ESC/POS
  - Sunmi built-in printer detection
- Claim print jobs from the existing backend APIs
- Deliver raw ESC/POS bytes to local printers

## Build

1. Open `android-connector` in Android Studio.
2. Let Gradle sync.
3. Build the `app` module or create a signed APK from Android Studio.

## Runtime notes

- Minimum supported Android: 8.0+
- Recommended production hardware: Android 10+
- The connector currently prioritizes `escpos` jobs. HTML/PDF jobs are reported as unsupported.
- Sunmi support is prepared behind a reflection-based driver so the app can build without bundling a vendor AAR into the repo.
