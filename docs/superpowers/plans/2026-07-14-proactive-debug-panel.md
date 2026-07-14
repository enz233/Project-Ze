# Proactive Debug Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task by task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the F3 Debug panel show proactive decision state and micro behavior state in separate readable cards.

**Architecture:** Reuse the existing `get-chat-info` IPC data source. Keep changes mostly inside `src/main/debug.html`, with a small docs update after verification.

**Tech Stack:** Electron HTML debug window, plain JavaScript, CSS grid, existing TypeScript build verification.

## Global Constraints

- Do not change proactive triggering rules.
- Do not change micro behavior execution logic.
- Do not add dependencies.
- Do not add charts or external visualization libraries.
- Build verification command is `npm run build`.

---

## Task 1: Split Proactive and Micro Behavior Debug Cards

**Files:**
- Modify: `src/main/debug.html`

**Interfaces:**
- Consumes: `window.companion.getChatInfo()` returning `info.proactive` and `info.microBehavior`.
- Produces: `formatProactive(proactive)` and `formatMicroBehavior(microBehavior)` rendered into separate cards.

- [ ] Change `.memory-panel` grid columns from `repeat(5, ...)` to `repeat(6, ...)`.
- [ ] Rename the existing `Proactive` card title to `Proactive Decision`.
- [ ] Add a new card with id `microBehaviorView` and title `Micro Behavior`.
- [ ] Add `var microBehaviorView = document.getElementById('microBehaviorView');`.
- [ ] Replace `formatProactive` with a more detailed formatter.
- [ ] Add `formatMicroBehavior`.
- [ ] In `refreshMemoryPanel`, set `microBehaviorView.textContent = formatMicroBehavior(info.microBehavior);`.
- [ ] In the catch branch, also set `microBehaviorView.textContent = msg;`.
- [ ] Run `npm run build` and expect PASS.
- [ ] Commit with `feat: enhance proactive debug panel`.

## Task 2: Update Documentation and Verify

**Files:**
- Modify: `docs/proactive-reaction-component.md`

**Interfaces:**
- Consumes: F3 Debug panel behavior from Task 1.
- Produces: docs note that F3 Debug now shows proactive decision and micro behavior state.

- [ ] Append a Debug panel section to `docs/proactive-reaction-component.md`.
- [ ] Run `npm run build` and expect PASS.
- [ ] Run `git status --short` and ensure only docs are pending before docs commit.
- [ ] Commit with `docs: document proactive debug panel`.
- [ ] Run final `git status --short && git log --oneline -8` and expect clean tree.

## Self-Review

Spec coverage:

- Separate proactive and micro cards: Task 1.
- Existing IPC data source: Task 1.
- No logic changes: Task 1 only touches debug HTML.
- Docs update: Task 2.
- Build verification: both tasks.

Placeholder scan: no placeholders remain.

Type consistency: this plan only consumes plain JS debug data and does not add TypeScript types.
