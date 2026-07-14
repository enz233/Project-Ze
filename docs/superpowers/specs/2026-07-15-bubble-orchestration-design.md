# Bubble Orchestration Design

## Context

The architecture cleanup work identified Bubble orchestration as the remaining deferred follow-up after TTS engine extraction, generic JSON config storage, and the first AI memory storage split. The current project index describes multiple bubble sources: renderer state/interaction bubbles, main-process bubbles, proactive reactions through `BubbleManager.tryShowProactiveBubble`, and chat/TTS flows that can also display text.

The next bounded iteration should not rewrite every bubble path. It should introduce a clear orchestration boundary for main-process bubble requests while preserving current visible behavior and leaving renderer-local state/interaction bubbles untouched unless they already pass through main-process IPC.

## Goals

- Introduce a small `BubbleOrchestrator` as the main-process boundary for queued/prioritized bubble requests.
- Keep `BubbleManager` responsible for the actual Electron window delivery and existing status gates.
- Preserve current proactive response path: `ObserverManager → ContextCollector → ProactiveReactionSystem → MicroBehaviorManager → BubbleManager.tryShowProactiveBubble`.
- Move only low-risk main-process bubble arbitration into the orchestrator first.
- Preserve current visible behavior for chat bubbles, proactive bubbles, activity bubbles, greetings, cooldowns, and TTS fallback.
- Update project documentation so future bubble work has a clear target boundary.

## Non-goals

- Do not redesign renderer bubble layout, CSS, or animation timing.
- Do not rewrite chat rendering, TTS playback, or proactive decision logic.
- Do not change IPC channel names unless a compile-time mismatch exposes an existing bug.
- Do not remove existing `BubbleManager` status gates or proactive cooldown behavior.
- Do not introduce a large event bus or external queue dependency.
- Do not attempt full cross-process orchestration of renderer-local state bubbles in this iteration.

## Proposed approach

Add a lightweight main-process orchestration layer that accepts typed bubble requests and forwards them to `BubbleManager` according to simple priority and source rules.

The first implementation should be intentionally small:

```ts
export type BubbleSource = 'chat' | 'proactive' | 'activity' | 'system';
export type BubblePriority = 'low' | 'normal' | 'high';

export interface BubbleRequest {
  text: string;
  source: BubbleSource;
  priority?: BubblePriority;
  ttlMs?: number;
}
```

`BubbleOrchestrator` should expose methods such as:

```ts
show(request: BubbleRequest): boolean;
tryShowProactive(text: string): boolean;
```

The orchestrator should not decide whether the AI should speak or whether a proactive candidate is valuable. Those decisions stay in existing systems. It only arbitrates bubble display requests that already reached the bubble layer.

## Components

### `BubbleOrchestrator`

Responsibility: main-process bubble request arbitration.

It should own:

- request source labeling
- priority defaults
- optional short in-memory queue or immediate dispatch policy
- deduplication or simple replacement rules if needed to preserve current behavior
- a stable API for future callers

It should not own:

- Electron window positioning
- renderer DOM logic
- AI decision logic
- proactive candidate scoring
- TTS playback or subtitle behavior

### `BubbleManager`

Responsibility after this iteration: actual bubble delivery and existing gates.

It should continue to own:

- `mainWindow.webContents.send('show-bubble', text)` or current equivalent delivery
- existing state/status checks
- current proactive cooldown behavior unless explicitly moved behind an equivalent orchestrator call
- activity monitoring if not yet split further

### Call sites

Only low-risk main-process call sites should be routed through the orchestrator in the first iteration. Existing external/public behavior should remain stable. If a call site already uses `BubbleManager.tryShowProactiveBubble`, it may remain as-is or be wrapped by `BubbleOrchestrator.tryShowProactive()` if that preserves the same return value and cooldown behavior.

## Data flow

Current main-process proactive flow should remain logically stable:

```txt
ObserverManager
→ ProactiveReactionSystem
→ MicroBehaviorManager
→ BubbleOrchestrator.tryShowProactive(text)
→ BubbleManager.tryShowProactiveBubble(text, source)
→ renderer show-bubble IPC
```

General main-process bubble request flow:

```txt
main-process caller
→ BubbleOrchestrator.show({ text, source, priority })
→ BubbleManager delivery method
→ renderer show-bubble IPC
```

Renderer-local state/interaction bubble flow remains unchanged in this iteration unless it already goes through main-process bubble IPC.

## Error handling

- Empty or whitespace-only bubble text should be rejected and return `false`.
- If `BubbleManager` rejects a bubble due to status gate or cooldown, the orchestrator should return `false` without retry storms.
- If the window is missing or destroyed, preserve existing `BubbleManager` behavior.
- If a future queue item expires past `ttlMs`, drop it silently or with a debug log; do not display stale bubbles.

## Testing and verification

Required verification for the implementation plan:

- `npm run build` must pass.
- `npm test` should be run. If the project still has no test script, record the exact `Missing script: "test"` result and do not claim tests passed.
- Verify by search that current proactive path still exists and still reaches `BubbleManager.tryShowProactiveBubble` or an orchestrator wrapper with the same behavior.
- Verify by search that renderer `show-bubble` IPC contract is unchanged.
- Verify by diff review that renderer CSS/layout and TTS playback files are unchanged unless directly required by compilation.
- Verify `PROJECT_INDEX.md` documents the orchestrator boundary.

## Commit strategy

Recommended implementation commits:

1. `refactor: add bubble orchestrator`
2. `refactor: route proactive bubbles through orchestrator`
3. `docs: update bubble orchestration notes`

If the code change is smaller than expected, the first two commits may be combined, but documentation should remain separately reviewable.

## Success criteria

- A new `BubbleOrchestrator` boundary exists and is used by at least one main-process bubble path.
- Current proactive bubble behavior and cooldowns are preserved.
- Renderer bubble display contract remains stable.
- Build verification passes, and missing test script status is recorded honestly if unchanged.
- The project index explains the new bubble orchestration boundary and what remains in `BubbleManager`.
