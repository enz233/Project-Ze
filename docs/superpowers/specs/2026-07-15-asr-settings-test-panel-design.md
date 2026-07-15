# ASR Settings Test Panel Design

## Context

Project-Ze already has Voice Input / ASR support in the main chat input and an ASR settings tab. Recent debugging showed that users need clearer feedback for two separate questions:

1. Is the microphone receiving sound locally?
2. Does the current ASR provider configuration actually recognize speech?

The settings page is the right place for this because users already configure Base URL, API Key, model, provider preset, streaming mode, and language there.

## Goals

- Add a local microphone volume test to the ASR settings tab.
- Add a separate 10-second speech recognition test that calls the current ASR configuration.
- Show obvious status, progress, live volume, and recognized text.
- Keep the main chat input behavior unchanged except for clearer recording status text.
- Reuse the existing `window.companion.voiceInput` IPC facade for ASR recognition tests.
- Do not add a new ASR provider or provider-specific Aliyun engine.

## Non-goals

- Do not auto-send test transcripts to chat.
- Do not write test transcripts into the main chat textarea.
- Do not store long-term test audio.
- Do not add wake-word or continuous monitoring.
- Do not change provider presets or config file shape.

## UI design

Add a compact “语音输入测试” section inside the existing ASR settings tab, below required provider fields and before cache settings.

Elements:

- Status line: shows idle/listening/recording/recognizing/done/error.
- Volume meter: horizontal bar driven by local microphone input.
- Progress bar: only active during the 10-second recognition test.
- Button 1: `测试麦克风音量`.
- Button 2: `测试语音识别 10 秒`.
- Result box: read-only textarea or pre-like block that shows partial/final transcript for the recognition test.
- Hint text: recognition test uses the current ASR config and may call the provider API.

## Behavior

### Local microphone volume test

When the user clicks `测试麦克风音量`:

1. Request microphone permission with `navigator.mediaDevices.getUserMedia({ audio: true })`.
2. Create `AudioContext` + `AnalyserNode` from the stream.
3. Use `requestAnimationFrame` to compute a simple RMS/peak volume and update the meter.
4. Show status such as `正在监听麦克风，请说话…`.
5. Clicking again stops the test and releases all microphone tracks and the audio context.

This path does not call ASR APIs and does not save audio.

### 10-second ASR recognition test

When the user clicks `测试语音识别 10 秒`:

1. Collect the current ASR form values.
2. Validate that ASR is enabled and Base URL, API Key, and model are present.
3. If invalid, show the existing ASR validation message and do not start.
4. Request microphone permission.
5. Start `AudioContext` volume visualization and `MediaRecorder` capture.
6. Start a voice input session using existing preload API:
   - `window.companion.voiceInput.start({ source: 'settings-test', mimeType })`
   - `appendAudioChunk(...)` while recording
   - `stop(sessionId)` after about 10 seconds
7. Show progress from 0 to 100% over 10 seconds.
8. Show partial/final transcript in the test result box.
9. Do not call `sendUserMessage` and do not modify the main chat textarea.
10. Stop and clean up microphone stream, timers, animation frames, and audio context on completion, cancellation, or error.

If the user clicks the button during a running recognition test, treat it as stop/cancel.

## Main chat input feedback

Keep the existing main-window voice input flow, but make recording text clearer:

- On start: `正在录音，请说话…`
- On stop/finalizing: `正在识别…`
- On transcript: keep the chat input open and write recognized text into the textarea as already designed.

## Error handling

- Microphone permission denied: show a visible settings-page error and reset controls.
- Missing ASR config fields: show `语音输入未开启：缺少 ...` in the ASR validation area.
- Provider error: show the returned ASR error in the test status and result area.
- Empty final transcript: show `未识别到文字` rather than silently succeeding.
- Repeated clicks: do not create duplicate streams, timers, recorders, or sessions.

## Testing and verification

Automated:

- `npm test`
- `npm run build`

Manual:

1. Open settings with F11.
2. In ASR settings, click `测试麦克风音量` and confirm the volume meter changes while speaking.
3. Stop the microphone test and confirm the meter returns to idle.
4. With incomplete ASR config, click `测试语音识别 10 秒` and confirm validation blocks the test.
5. With complete ASR config, run the 10-second test and confirm progress reaches 100%, the result box shows transcript or provider error, and no chat message is sent.
6. Confirm main-window hold-to-talk still shows obvious recording/finalizing status and keeps the textarea open for recognized text.

## Success criteria

- Users can independently verify local microphone input without consuming ASR quota.
- Users can run a real 10-second ASR recognition test from settings.
- The test UI clearly explains whether failure is microphone, config validation, provider, or no speech.
- Existing ASR config, provider preset, IPC, and main chat behavior remain compatible.
