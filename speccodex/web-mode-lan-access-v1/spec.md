# Web Mode LAN Access v1

## Goal

Allow other computers on the same local network to open Sanaka Web Mode.

## Current v1 behavior

- Web Mode listens on LAN instead of loopback-only.
- Sanaka still opens the browser with the local machine URL first.
- Runtime state exposes:
  - `url`
  - `localUrl`
  - `networkUrl`
- UI may display both local and LAN addresses.

## Explicit non-goals for this pass

- No distinction yet between local device and external device behavior
- No auth token
- No pairing flow
- No allowlist
- No TLS

## Risks

- Any device on the same LAN can access Web Mode
- Future work must add:
  - local/external client distinction
  - session or token gate
  - optional bind scope selection
  - clearer user-facing warning text

## Next version direction

### v2 should add

- Detect whether request comes from loopback or LAN
- Separate local and external capability policy
- Optional one-time access token
- Optional manual “LAN share” toggle
- Better connection status UI
