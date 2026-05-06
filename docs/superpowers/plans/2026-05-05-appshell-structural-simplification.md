# AppShell Structural Simplification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce `AppShell.js` by moving pure state helpers into `appShellState.js`.

**Architecture:** Keep `AppShell` as the React orchestration component for now. Extract only deterministic helper functions and constants, then import them back into AppShell.

**Tech Stack:** React 18, Jest via react-scripts.

---

## Task 1: Extract Pure AppShell State Helpers

**Files:**
- Create: `fronted/src/app/appShellState.js`
- Create: `fronted/src/app/appShellState.test.js`
- Modify: `fronted/src/app/AppShell.js`

- [x] Write failing tests for the new helper module.
- [x] Run the helper test and confirm it fails because the module does not exist.
- [x] Move constants and pure helper functions from `AppShell.js` into `appShellState.js`.
- [x] Import the helpers from `AppShell.js`.
- [x] Run helper and AppShell focused tests.

## Task 2: Remove Unused Extraction Stubs

Review found several extracted hook modules that were not wired into production `AppShell.js`, creating a double-implementation risk outside the current slice.

**Files:**
- Delete: `fronted/src/app/useAppShellBootstrapSync.js`
- Delete: `fronted/src/app/useAppShellBootstrapSync.test.js`
- Delete: `fronted/src/app/useAppShellRunOrchestrationBindings.js`
- Delete: `fronted/src/app/useAppShellRunOrchestrationBindings.test.js`
- Delete: `fronted/src/app/useAppShellVoiceConversationBindings.js`
- Delete: `fronted/src/app/useAppShellVoiceConversationBindings.test.js`

- [x] Deleted unused hook stubs and their isolated tests.
- [x] Confirmed no remaining production or test imports.
