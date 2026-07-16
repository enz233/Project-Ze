# Intent Router

Intent Router is Project-Ze's first multimodal intent boundary. It normalizes typed chat, ASR text, explicit screen requests, camera-awareness events, proactive context events, and debug-panel actions into a structured intent decision.

## First-version boundary

The first version is rule-first and privacy-gated:

- Normal chat remains normal chat.
- Explicit natural-language requests such as “帮我看看这个页面”, “看看屏幕”, “你看看这个”, “这是什么意思” can route to screen summary.
- Explicit target requests such as “指出下载按钮” can route to screen target pointer.
- Camera checks and camera visual queries are one-shot only and require explicit user intent plus camera-awareness configuration. Examples: “看看我在不在” routes to `camera_check_once`; “镜头里有什么 / 看看我手里拿的是什么” routes to `camera_visual_query`.
- LLM fallback may suggest an intent, but local permission policy decides whether sensitive capabilities can run.

## Files

- `src/core/intent-types.ts`: shared request, decision, permission, execution and debug types.
- `src/core/intent-classifier.ts`: rule-first classifier and validated LLM fallback adapter.
- `src/core/intent-router.ts`: permission gate and recent decision debug buffer.
- `src/core/intent-executor.ts`: thin handler-based dispatcher into existing modules.

## Privacy policy

Sensitive capabilities include screen capture, vision, camera frame access, pointer movement and config writes. These require explicit user intent when invoked from normal chat or ASR. Proactive context events cannot trigger screen capture, pointer movement or config writes.

The router does not save camera images or videos and does not perform identity recognition, sensitive-attribute inference, medical judgment or psychological diagnosis. Camera intents require `camera_frame`; `camera_visual_query` also requires `vision` and `llm`.

## Debugging

`IntentRouter.getDebugSnapshot()` returns the recent decision ring buffer. The Debug panel reads it through `intent-router:get-debug-snapshot` and displays source, intent, confidence, reason, capabilities, permission status and executor result.
