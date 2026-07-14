# Configuration Security Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task by task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Clean repository configuration boundaries so real local secrets, chat history, and memory are not tracked while safe example files document the expected shapes.

**Architecture:** Do not change runtime config managers. Keep real config under Electron `userData/config` or ignored local files, and add tracked example JSON plus developer docs.

**Tech Stack:** Git, JSON config examples, Electron app existing config managers, TypeScript build verification.

## Global Constraints

- Do not change application runtime logic.
- Do not delete user local real config files.
- Do not commit real API keys, chat contents, or personal memory.
- Do not rewrite git history in this task.
- Build verification command is `npm run build`.

---

## Task 1: Add Safe Example Configs and Stop Tracking Real Chat History

**Files:**
- Modify: `.gitignore`
- Remove from git index only: `src/config/chat-history.json`
- Create: `src/config/ai-config.example.json`
- Create: `src/config/tts.example.json`
- Create: `src/config/chat-history.example.json`
- Create: `src/config/ai-memory.example.json`
- Create: `src/config/appearance.example.json`

**Interfaces:**
- Consumes: existing config field names from `src/core/ai-config.ts`, `src/core/tts-config.ts`, `src/core/appearance-config.ts`, `src/core/ai-memory.ts`.
- Produces: tracked, sanitized examples for developer onboarding.

- [ ] Run `git rm --cached src/config/chat-history.json` so the file remains local but is no longer tracked.
- [ ] Update `.gitignore` to keep ignoring real config files and explicitly allow `*.example.json`.
- [ ] Create `src/config/ai-config.example.json` with empty API key fields and safe default endpoints.
- [ ] Create `src/config/tts.example.json` with empty TTS API key fields.
- [ ] Create `src/config/chat-history.example.json` with empty message array.
- [ ] Create `src/config/ai-memory.example.json` with empty memory fields and neutral relationship values.
- [ ] Create `src/config/appearance.example.json` with default appearance values.
- [ ] Run `npm run build` and expect PASS.
- [ ] Commit with `chore: add safe config examples`.

## Task 2: Add Configuration Security Documentation

**Files:**
- Create: `docs/configuration-security.md`

**Interfaces:**
- Consumes: example files from Task 1.
- Produces: developer-facing policy for local config, examples, runtime config path, and key rotation warning.

- [ ] Write `docs/configuration-security.md` explaining:
  - real configs are ignored;
  - example configs are safe to commit;
  - runtime configs are written to Electron `userData/config`;
  - if a real API key was ever exposed, rotate it;
  - do not commit chat history or memory.
- [ ] Run `npm run build` and expect PASS.
- [ ] Run `git status --short` and confirm only docs file remains pending for this task.
- [ ] Commit with `docs: document configuration security`.

## Task 3: Final Verification

**Files:**
- No source changes expected.

**Interfaces:**
- Produces: clean working tree and recent commit list.

- [ ] Run `npm test`; if missing script, record that the project has no test script.
- [ ] Run `npm run build` and expect PASS.
- [ ] Run `git status --short && git log --oneline -8` and expect clean working tree.

## Self-Review

Spec coverage:

- Stop tracking real chat history: Task 1.
- Add safe examples: Task 1.
- Update ignore policy: Task 1.
- Add docs: Task 2.
- Warn about key rotation: Task 2.
- Build and final verification: Tasks 1-3.

Placeholder scan: no placeholders remain.

Type consistency: example files follow field names from existing config managers.
