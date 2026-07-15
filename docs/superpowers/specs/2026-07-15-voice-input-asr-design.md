# Voice Input ASR Design

## Context

Project-Ze v0.3 begins the Interactive phase. The first task is voice input: users can speak instead of typing, and the recognized text enters the existing right-click chat input path.

Current documented context:

- `README.md` lists `Voice Input (ASR)` under v0.3.
- `docs/chat-experience-enhancement.md` defines the current right-click textarea, `Enter` send behavior, and chat status phases.
- `PROJECT_INDEX.md` documents the current architecture: renderer input, preload IPC, main process orchestration, `JsonConfigStore<T>` for runtime config, and TTS engine abstraction.
- v0.2.17 already moved the codebase toward bounded engines and storage boundaries, so ASR should follow the same pattern instead of hardcoding one provider into UI or chat code.

## Goals

- Add voice input to the existing chat input instead of creating a new chat panel.
- Support two interaction modes:
  - Mic button: click once to start recording, click again to stop.
  - Keyboard shortcut: hold-to-talk, release to stop.
- Streaming is required: partial recognition should update the textarea while the user is speaking.
- Final transcript should be equivalent to typed text.
- Default send behavior is safe: after recognition ends, text stays in the textarea and the user presses `Enter` to send.
- Add a setting for optional auto-send after final transcript.
- Call external ASR APIs through a provider abstraction.
- Reserve interfaces for audio cache/reuse, because recorded audio may later be used for memory, emotion, debugging, or other multimodal features.
- Document module responsibilities, interfaces, config shape, and boundaries.

## Non-goals

- Do not build a separate voice chat panel.
- Do not add wake word detection in this iteration.
- Do not add local/offline ASR in this iteration.
- Do not add voice identity, speaker recognition, or emotion analysis yet.
- Do not send recognized text automatically by default.
- Do not couple ASR provider logic to renderer UI.
- Do not store long-term raw audio by default.

## Recommended approach

Use an ASR engine abstraction with a streaming-first pipeline.

```txt
Renderer chat input
  → mic button / hold-to-talk shortcut
  → browser MediaRecorder / audio chunk capture
  → preload IPC bridge
  → VoiceInputManager
  → ASREngine.stream(...)
  → partial/final transcript events
  → renderer updates textarea
  → existing Enter send path
```

### Alternative approaches considered

| Approach | Pros | Cons | Decision |
|---|---|---|---|
| Single OpenAI-compatible ASR call | Fastest to implement | Poor future compatibility; weak streaming story | Reject |
| Provider-specific first implementation | Can optimize for one vendor | Pollutes architecture with provider details | Reject |
| `ASREngine` abstraction with streaming-first interface | Matches TTS architecture; supports multiple vendors; keeps UI stable | More design upfront | Choose |

## User interaction

### Mic button

- The existing right-click input remains the main entry.
- Add a small mic button near the textarea/send area.
- First click starts recording.
- Second click stops recording.
- While recording, the input area shows a clear recording state.
- Partial ASR text updates the textarea continuously.
- Final transcript leaves the textarea editable.
- If auto-send is enabled, final transcript triggers the existing send path after recognition completes.

### Keyboard shortcut

- Add a hold-to-talk shortcut.
- Key down starts recording if input is open and not already recording.
- Key up stops recording.
- Shortcut should be configurable later; first version may document a fixed default if no keybinding system exists.
- Shortcut and mic button enter the same `VoiceInputSession` state machine.

### Send behavior

- Default: final transcript is inserted into the textarea; user presses `Enter` to send.
- Optional setting: `autoSendFinalTranscript` sends after final transcript.
- If recognition fails, keep any partial text in the textarea and show an error status instead of discarding user input.

## Runtime states

Extend chat/voice UI status without replacing current chat statuses.

Recommended voice phases:

| Phase | Meaning |
|---|---|
| `voice-idle` | no active voice session |
| `voice-recording` | capturing microphone audio |
| `voice-transcribing` | ASR stream active and returning partial text |
| `voice-finalizing` | recording stopped, waiting for final transcript |
| `voice-error` | microphone or ASR failed |

These can be mapped to the existing lightweight chat status capsule, or rendered as a small mic-specific state next to the input.

## Core components

### `VoiceInputManager`

Responsibility: orchestrate one voice input session.

Expected responsibilities:

- start/stop a voice session
- receive audio chunks from renderer/preload
- pass chunks to the selected `ASREngine`
- emit partial/final transcript events
- write short-lived audio cache entries through `VoiceAudioCache`
- expose debug/session status for future F3 panel use

Proposed interface:

```ts
interface VoiceInputManager {
  startSession(options: VoiceInputStartOptions): Promise<VoiceInputSessionInfo>;
  appendAudioChunk(sessionId: string, chunk: VoiceAudioChunk): Promise<void>;
  stopSession(sessionId: string): Promise<void>;
  cancelSession(sessionId: string): Promise<void>;
  getStatus(): VoiceInputDebugSnapshot;
}
```

### `ASREngine`

Responsibility: provider-specific speech recognition behind a stable interface.

Streaming is the main contract:

```ts
interface ASREngine {
  readonly provider: string;
  supportsStreaming(config: ASRConfig): boolean;
  stream(input: ASRStreamInput): AsyncIterable<ASRTranscriptEvent>;
}
```

Transcript event shape:

```ts
type ASRTranscriptEvent =
  | { type: 'partial'; text: string; sessionId: string }
  | { type: 'final'; text: string; sessionId: string; audioRef?: string }
  | { type: 'error'; message: string; sessionId: string; recoverable: boolean };
```

### Provider engines

First implementation should include an OpenAI-compatible ASR engine and leave room for provider-specific engines.

```txt
asr-engine.ts            shared interfaces + createASREngine(config)
asr-openai-compatible.ts OpenAI-compatible realtime/streaming provider
asr-*.ts                 future providers, e.g. Aliyun or other cloud ASR
```

The manager should not know vendor-specific URL paths, auth headers, or event formats.

### `VoiceAudioCache`

Responsibility: short-lived audio cache and audio reference management.

Why it exists:

- ASR providers need audio chunks.
- Later modules may reuse audio for debugging, memory, emotion, or multimodal context.
- The current feature should not force long-term audio retention.

Initial policy:

- Cache audio per session under Electron `userData/cache/voice-input/` or equivalent runtime path.
- Default retention is short and bounded.
- Store metadata separately from raw audio.
- Do not commit audio cache to the repo.
- Final transcript can include `audioRef` for future internal use.

Suggested interface:

```ts
interface VoiceAudioCache {
  createSession(sessionId: string): Promise<VoiceAudioCacheEntry>;
  appendChunk(sessionId: string, chunk: VoiceAudioChunk): Promise<void>;
  finalize(sessionId: string): Promise<VoiceAudioRef>;
  discard(sessionId: string): Promise<void>;
  cleanupExpired(): Promise<void>;
}
```

## Configuration

Add ASR runtime config using `JsonConfigStore<T>`, following current config security rules.

Recommended file names:

```txt
userData/config/asr.json          runtime config
src/config/asr.example.json       safe committed example
```

Suggested config shape:

```ts
interface ASRConfig {
  enabled: boolean;
  provider: 'openai-compatible' | 'aliyun' | 'custom';
  baseUrl: string;
  apiKey: string;
  model: string;
  streamingMode: 'realtime' | 'chunked-fallback';
  language?: string;
  autoSendFinalTranscript: boolean;
  cache: {
    enabled: boolean;
    retentionMinutes: number;
    maxSessionBytes: number;
  };
}
```

Safe defaults:

- `enabled: false`
- `apiKey: ''`
- `autoSendFinalTranscript: false`
- `cache.enabled: true`
- short retention window

## Settings UI

Add an ASR/Voice Input section to the existing settings window.

Fields:

- enable voice input
- provider
- base URL
- API key
- model
- streaming mode
- language
- auto-send final transcript
- audio cache enable/retention/max size
- test connection / test recognition path

Validation:

- If voice input is enabled, require provider, base URL, model, and API key when provider requires auth.
- If selected provider does not support realtime streaming, warn that the experience will use chunked fallback if implemented.
- Do not write real API keys to example files or docs.

## IPC and data flow

Renderer should not call ASR providers directly.

Recommended IPC channels:

| Direction | Channel | Payload |
|---|---|---|
| renderer → main | `voice-input-start` | config/session options |
| renderer → main | `voice-input-audio-chunk` | sessionId, chunk metadata, audio bytes/base64 |
| renderer → main | `voice-input-stop` | sessionId |
| renderer → main | `voice-input-cancel` | sessionId |
| main → renderer | `voice-input-status` | phase/message/sessionId |
| main → renderer | `voice-input-transcript` | partial/final text/sessionId/audioRef |

Preload exposes a small `window.companion.voiceInput` facade rather than leaking raw IPC calls throughout renderer code.

## Streaming behavior

The UI needs streaming even when providers differ.

Engine capabilities:

- `realtime`: provider accepts ongoing audio chunks and emits transcript events.
- `chunked-fallback`: manager batches short chunks and sends repeated recognition calls; UI still receives incremental updates, but docs should label it as fallback quality.

First implementation should prioritize a true realtime path. Chunked fallback can be a later implementation detail if the first selected provider does not support realtime.

## Error handling

- Microphone permission denied: show `voice-error`, keep input editable.
- Provider config missing: show config error and link user to F11 settings.
- Stream disconnects: stop session, keep last partial transcript, show recoverable error.
- Empty final transcript: do not auto-send even if auto-send is enabled.
- User cancels session: discard current audio cache unless debugging retention is explicitly enabled.
- Over-size audio session: stop recording and show a size limit error.

## Documentation updates required during implementation

Implementation must update:

- `README.md`: mark Voice Input as available and document mic/shortcut usage.
- `PROJECT_INDEX.md`: add ASR modules, IPC channels, config files, and common modification notes.
- `VERSION.md`: add v0.3.x entry.
- `docs/chat-experience-enhancement.md`: add voice input interaction and status flow.
- `docs/configuration-security.md`: add `asr.example.json` safe file and runtime `asr.json` ignore rule.
- A dedicated voice input doc if the module grows beyond the chat doc.

## Testing and verification

Required verification:

- `npm run build` must pass.
- `npm test` should be run; if still missing, record the exact missing script result.
- Verify settings can save/load ASR config without committing real secrets.
- Verify mic button start/stop fills the existing textarea.
- Verify hold-to-talk starts on key down and stops on key up.
- Verify default final transcript does not auto-send.
- Verify optional auto-send uses the existing text send path.
- Verify partial transcript updates do not erase user edits unexpectedly.
- Verify audio cache files are runtime-only and ignored by git.

## Open implementation decisions

These should be resolved in the implementation plan, not by changing this design:

- Exact default hold-to-talk shortcut.
- Exact first OpenAI-compatible realtime protocol path, based on the provider chosen for testing.
- Whether first implementation includes chunked fallback or only reserves the interface.
- Whether voice status appears inside the existing chat status capsule or as a mic-specific indicator.

## Success criteria

- User can open the existing chat input, click the mic button, speak, stop, edit the transcript, and press `Enter` to send.
- User can hold a shortcut to speak and release to stop.
- Partial text appears while speaking when provider streaming is available.
- ASR config is stored in runtime config, with safe example config in repo.
- ASR provider logic is isolated behind `ASREngine`.
- Recorded audio has a cache/reference boundary for future reuse.
- Documentation explains the module, interfaces, config, data flow, and boundaries.