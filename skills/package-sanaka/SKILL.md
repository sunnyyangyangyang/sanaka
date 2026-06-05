---
name: package-sanaka
description: Use this skill when packaging Sanaka for macOS, Windows, or Linux, or when another AI needs the exact repo-specific release workflow, icon files, QEMU bundling rules, and platform constraints.
---

# Package Sanaka

This skill is for repo-specific packaging work. Use it when the task is to build, package, or explain how to package Sanaka on macOS, Windows, or Linux.

## What matters in this repo

- App name: `Sanaka`
- Version source: [package.json](/Users/steve372dzudo/sanaka/package.json)
- Main Electron entry: [main.js](/Users/steve372dzudo/sanaka/main.js)
- macOS package script: [scripts/package-sanaka-macos.sh](/Users/steve372dzudo/sanaka/scripts/package-sanaka-macos.sh)
- macOS QEMU embed script: [scripts/embed-qemu-macos.sh](/Users/steve372dzudo/sanaka/scripts/embed-qemu-macos.sh)
- Post-pack metadata fix: [build/after-pack.js](/Users/steve372dzudo/sanaka/build/after-pack.js)
- Shared app icon source for packaged builds: [assets/icons/sanakafish.png](/Users/steve372dzudo/sanaka/assets/icons/sanakafish.png)
- macOS icon file: [build/icon.icns](/Users/steve372dzudo/sanaka/build/icon.icns)

## Platform rules

- macOS:
  - Current real packaging path is implemented.
  - QEMU is bundled into the app.
  - Use `npm run pack:mac`.
- Windows:
  - Package with `npm run pack:win`.
  - Current repo uses `electron-builder`.
  - If bundled QEMU is needed, that is separate work. Do not claim it is already embedded unless you verified it in code.
- Linux:
  - Package with `npm run pack:linux`.
  - Current product direction is to let Linux users install QEMU themselves unless the user explicitly changes that decision.

## Required workflow

1. Check repo state first.
   - Run `git status --short`
   - Do not overwrite unrelated user changes.
2. Check package settings.
   - Read [package.json](/Users/steve372dzudo/sanaka/package.json)
   - Confirm `build.mac`, `build.win`, and `build.linux`
3. Validate before packaging.
   - Run `npm run typecheck`
   - Run `npm test` when packaging changes touch runtime or build config
4. Package on the native platform when possible.
   - macOS build on macOS
   - Windows build on Windows
   - Linux build on Linux
5. Report output paths clearly.
   - `release/` is the output root

## Commands

### macOS

```bash
npm run typecheck
npm test
npm run pack:mac
```

Notes:

- `pack:mac` calls the repo script and then embeds QEMU resources.
- If macOS packaging changes, re-check:
  - [scripts/package-sanaka-macos.sh](/Users/steve372dzudo/sanaka/scripts/package-sanaka-macos.sh)
  - [scripts/embed-qemu-macos.sh](/Users/steve372dzudo/sanaka/scripts/embed-qemu-macos.sh)
  - [build/after-pack.js](/Users/steve372dzudo/sanaka/build/after-pack.js)

### Windows

```bash
npm run typecheck
npm test
npm run pack:win
```

Notes:

- Run on Windows for the most reliable result.
- If Electron download or install fails, check proxy settings before changing code.
- Current icon source for Windows packaging is [assets/icons/sanakafish.png](/Users/steve372dzudo/sanaka/assets/icons/sanakafish.png).

### Linux

```bash
npm run typecheck
npm test
npm run pack:linux
```

Notes:

- Current Linux target is `AppImage`.
- Do not say Linux bundles QEMU unless you actually added that work.

## Packaging facts to preserve

- Version display should remain `0.0.1 (beta)` unless the user asks to bump it.
- Copyright should remain `Copyright © 2026 Sanakaprix`.
- Packaged app icon should stay aligned with the fish icon asset.

## If the user asks for bundled QEMU

- macOS already has repo-specific embedding work.
- Windows and Linux do not automatically inherit the macOS embedding path.
- Treat Windows bundling and Linux bundling as separate implementation tasks.

## When to stop and ask

Stop and ask only if:

- the packaging target platform is unclear and the user wants an actual distributable
- signing/notarization is required
- bundling QEMU is requested for Windows or Linux and no platform script exists yet
