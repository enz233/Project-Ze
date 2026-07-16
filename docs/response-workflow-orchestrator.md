# Response Workflow Orchestrator

Response Workflow Orchestrator is the boundary that turns already-authorized tool results into normal chat-model replies.

## Current scope

The first implementation handles:

- `screen_summary_response`
- `screen_target_pointer_response`

It does not classify intent and does not grant permissions. `IntentRouter` still owns classification and privacy gates.

## Runtime flow

```txt
IntentRouter / . screen entry
  -> ResponseWorkflowOrchestrator
  -> ScreenAnalyzer or ScreenTargetPointer
  -> WorkflowResponseContext
  -> ChatManager.respondFromWorkflow(...)
  -> normal <item> chat bubbles / TTS fallback
```

## Privacy rule

Raw screen observations are short-lived workflow context. They are not saved to long-term memory by default. The final user-visible model reply may be saved to chat history.

## Module boundaries

- `ScreenAnalyzer` owns screenshot and Vision analysis.
- `ScreenTargetPointer` owns target locating, stability checks, movement, and point visual.
- `ChatManager` owns model wording, `<item>` parsing, TTS fallback, and chat history.
- `BubbleOrchestrator` owns bubble delivery only.
