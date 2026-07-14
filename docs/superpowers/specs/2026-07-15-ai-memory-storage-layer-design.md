# AI Memory Storage Layer Design

## Context

The architecture cleanup work identified `AIMemory` as a deferred follow-up refactor: split chat history storage, memory profile storage, relationship tracking, and prompt memory rendering into clearer units. Since TTS engine extraction and JSON config storage have been completed, the next bounded refactor should reduce `AIMemory` responsibility without changing chat behavior.

Project documentation currently describes AI memory as handling conversation history persistence, periodic summaries, lightweight user habits, common apps, and recent interaction traces. That makes it an important behavior surface, so the first iteration should extract a storage boundary while preserving the existing public `AIMemory` API used by `ChatManager`, debug UI, and prompt construction.

## Goals

- Start AIMemory layering with a small, safe storage extraction.
- Introduce a `ChatHistoryStore` responsible for chat-history JSON persistence and basic history operations.
- Keep `AIMemory` as the compatibility facade for existing callers in this iteration.
- Preserve current chat history file name, runtime location, message shape, summary cadence, relationship updates, and prompt behavior.
- Reuse `JsonConfigStore<T>` where appropriate for object-shaped JSON persistence.
- Update project documentation so maintainers understand the new memory boundary.

## Non-goals

- Do not fully split all AIMemory responsibilities in one iteration.
- Do not change chat prompt wording, memory summary cadence, or relationship scoring.
- Do not redesign the debug window or settings UI.
- Do not change IPC contracts.
- Do not migrate or rewrite existing user memory files beyond normal read/merge/write behavior.
- Do not introduce a database, schema validation library, or async storage layer.

## Proposed approach

Use a phase-one layering approach:

1. Add a focused `ChatHistoryStore` that owns the persisted chat-history data shape and read/write mechanics.
2. Keep `AIMemory` as the public facade. Existing callers continue using the same `AIMemory` methods.
3. Move only the lowest-risk history persistence operations into the store.
4. Leave relationship tracking, habit extraction, summary generation, and prompt rendering inside `AIMemory` for now unless a tiny adapter is needed to call the new store.

This avoids a broad behavior rewrite while creating the first clear seam for future work.

## Components

### `ChatHistoryStore`

Responsibility: own chat-history storage and simple history list operations.

Expected responsibilities:

- Load persisted chat-history data from Electron `userData/config` using the existing runtime file name.
- Preserve default empty history behavior.
- Append messages or replace history through explicit methods used by `AIMemory`.
- Save updated history.
- Return copies or controlled references in the same way current behavior expects, avoiding accidental behavior changes.

The exact persisted data shape should match the current runtime file. If the existing shape includes more than a message list, the store should preserve that shape and expose only the operations `AIMemory` needs.

### `AIMemory`

Responsibility after this iteration: compatibility facade and higher-level memory behavior.

It should continue to own:

- summary generation cadence and calls to AI services
- relationship tracking
- lightweight habits and common app observations
- prompt memory rendering
- any public API used by `ChatManager`, debug UI, or main-process IPC

It should delegate chat-history persistence to `ChatHistoryStore` but keep method names and return values stable for callers.

### Documentation

Update `PROJECT_INDEX.md` to show that memory now has a first storage seam:

- `ai-memory.ts` remains the high-level memory facade.
- `chat-history-store.ts` owns chat-history persistence.
- Future follow-ups may split memory profile, relationship tracking, and prompt rendering.

## Data flow

Current caller-facing flow should remain stable:

```txt
ChatManager / Debug IPC
→ AIMemory public methods
→ ChatHistoryStore for persisted chat-history operations
→ userData/config/<existing chat history file>
```

Prompt flow should remain stable:

```txt
ChatManager
→ AIMemory builds memory context / prompt additions
→ existing summary, habit, relationship, and recent-trace logic
```

## Error handling

- If chat-history loading fails or JSON is invalid, use the same fallback behavior as today: log an error and continue with safe empty/default memory state.
- If saving fails, log the error and avoid crashing the app.
- If persisted data is missing newer fields, fill them with defaults where the current implementation already does so.
- Do not silently discard existing user history fields that are not part of the newly extracted method surface.

## Testing and verification

Required verification for the implementation plan:

- `npm run build` must pass.
- `npm test` should be run. If the project still has no test script, record the exact `Missing script: "test"` result and do not claim tests passed.
- Verify by search that existing callers still construct/use `AIMemory`, not `ChatHistoryStore` directly.
- Verify by search that the existing runtime chat-history file name is preserved.
- Verify by diff review that prompt text, summary cadence, and relationship scoring logic are unchanged unless explicitly documented.
- Verify `PROJECT_INDEX.md` documents the new storage boundary.

## Commit strategy

Recommended implementation commits:

1. `refactor: add chat history store`
2. `refactor: delegate ai memory history storage`
3. `docs: update ai memory architecture notes`

If the code extraction is small, the first two commits may be combined, but documentation should remain separately reviewable.

## Success criteria

- `AIMemory` public callers keep working without API changes.
- Chat history persists to the same runtime file as before.
- The new `ChatHistoryStore` has one clear responsibility and no prompt/relationship logic.
- Build verification passes, and missing test script status is recorded honestly if unchanged.
- The project index explains the new memory storage boundary and future split direction.
