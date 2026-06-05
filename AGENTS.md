# Sanaka Agent Guide

This file tells AI agents how to work inside the `Sanaka` repository.

Read this together with [工种.md](/Users/steve372dzudo/sanaka/工种.md).

## Roles

- Frontend AI (`Kimi`, `Gemini`, or similar) owns UI, layout, motion, styling, and renderer-side interaction.
- Backend AI (`GPT`) owns Electron main process, preload, IPC, file rules, runtime, packaging, and stability work.

Default rule:

- If the task is mainly visual or interaction-facing, frontend AI should lead.
- If the task is mainly logic, filesystem, IPC, runtime, build, or packaging, backend AI should lead.

## Handoff

Cross-role requests must go through `xx-want.md`.

Examples:

- `gpt-want.md`: GPT writes this when frontend follow-up is needed.
- `kimi-want.md`: Kimi writes this when backend follow-up is needed.

Handoff docs should be short, concrete, and user-facing in outcome. They should say:

- what problem exists
- what behavior should change
- what the receiving AI needs to do
- how to verify completion

## Working Rules

- Do not casually rewrite the other role's area just because it is faster.
- Small cross-boundary fixes are allowed when needed to unblock a bug, but do not change ownership of the feature.
- If you touch the other side, say so clearly in your handoff or final note.
- Prefer one side owning one problem at a time instead of two AIs half-editing the same feature.

## Frontend Notes

- Avoid exposing internal terms like `.saka`, `machine.svm`, bundle roots, IPC details, or raw QEMU flags to end users unless the screen is explicitly advanced/debug.
- Respect the current product direction: object-first workspace, restrained Material You feel, centered content, and low-noise UI.
- Before using repository design skills, open the matching `SKILL.md` under `skills-src/` and follow only the parts relevant to the task.

## Backend Notes

- Keep platform behavior explicit. If macOS, Windows, and Linux differ, encode the rule clearly instead of hiding it in ad-hoc conditionals.
- Prefer returning structured, user-meaningful errors rather than leaking raw internal failures directly into renderer state.
- Recent items, machine bundles, runtime state, and packaging behavior must remain consistent with the product rules already established in the repo.

## Repository Habits

- Use `rg` for search.
- Use `apply_patch` for manual edits.
- Do not revert unrelated user or collaborator changes.
- Treat the repository as potentially dirty at all times.

## Source Of Truth

For role ownership and collaboration expectations, `工种.md` is the main source of truth.
