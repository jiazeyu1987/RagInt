# AppShell Structural Simplification Design

## Goal

Reduce `fronted/src/app/AppShell.js` by extracting stable, testable responsibilities without changing user-visible behavior.

## Slice 1 Scope

Move pure AppShell state helpers into a dedicated module:

- tour button mode constants and reducer;
- UI view-mode storage key and initial-mode resolver;
- ASR E2E probe state creation and cloning;
- small text normalization helper;
- tour RAGFlow chat-name constant.

## Architecture

Create `fronted/src/app/appShellState.js` as a pure helper module. `AppShell.js` imports the helpers and keeps React orchestration in place.

This is intentionally not a large component split yet. The first slice creates a safe extraction seam with direct unit tests, then later slices can move larger orchestration groups.

## Behavior

No behavior changes:

- `entry=tour` still forces simple mode.
- Local-storage view mode still normalizes to `simple` or `full`.
- Tour button transitions remain identical.
- ASR probe state remains clone-safe for E2E.

## Testing

Add `fronted/src/app/appShellState.test.js` before implementation. It covers reducer transitions, view-mode initialization, and ASR probe cloning.

Run focused app tests after extraction:

- `npm test -- --runTestsByPath src/app/appShellState.test.js --watchAll=false`
- `npm test -- --runTestsByPath src/app/AppShell.test.js src/app/appShellState.test.js --watchAll=false`

## Follow-Up Slices

1. Extract simple/full UI mode actions into a hook.
2. Extract RagFlow conversation label selection.
3. Extract ASR E2E bridge setup.
4. Extract tour toggle/reset handlers.
