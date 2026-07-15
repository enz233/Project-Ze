# ASR Provider Presets Design

## Context

Project-Ze already has v0.3 voice input ASR on `master`:

- `ASRConfig` stores runtime voice input settings through `JsonConfigStore<T>`.
- `ASREngine` isolates provider details behind `stream(...)`.
- `OpenAICompatibleASREngine` is the only implemented ASR engine.
- The settings UI currently exposes only one provider option and rejects non-`openai-compatible` providers.

The next improvement is to add more selectable supplier options, starting with 阿里百炼 / DashScope, without destabilizing the existing voice input flow.

## Goals

- Add a provider preset layer for ASR settings.
- Add 阿里百炼 / DashScope as a selectable ASR preset.
- Keep the actual engine implementation on the existing OpenAI-compatible path for this iteration.
- Preserve editable Base URL, path, model, language, streaming mode, cache, and auto-send fields.
- Avoid committing real API keys or unverified model credentials.
- Document the compatibility boundary clearly: presets are configuration templates, not guaranteed provider-specific protocol implementations.

## Non-goals

- Do not add a dedicated 阿里百炼 ASR engine in this iteration.
- Do not claim every 百炼 model supports the current realtime or transcription endpoint.
- Do not hardcode an unverified 百炼 ASR model as a guaranteed default.
- Do not change renderer microphone capture, IPC channel names, or `VoiceInputManager` responsibilities.
- Do not add a new ASR test framework.

## Recommended approach

Use a two-layer provider model:

```txt
providerPreset = user-facing settings template
provider       = actual ASR engine family
```

For this iteration:

```txt
阿里百炼 / DashScope preset
  → providerPreset: aliyun-bailian
  → provider: openai-compatible
  → createASREngine(config)
  → OpenAICompatibleASREngine
```

This keeps the current runtime boundary stable while allowing the settings UI to offer provider choices.

## Alternatives considered

| Approach | Pros | Cons | Decision |
|---|---|---|---|
| Add provider presets over OpenAI-compatible engine | Small change; compatible with existing code; easy to extend to more OpenAI-compatible vendors | Does not solve provider-specific protocol differences | Choose |
| Add dedicated 阿里百炼 engine now | Best long-term provider fidelity | Requires verified 百炼 ASR realtime/transcription protocol details; higher implementation and test cost | Defer |
| Keep only free-form custom fields | Minimal code | Poor UX; users must know URLs and paths | Reject |

## Configuration design

Extend `ASRConfig` with a preset field:

```ts
export type ASRProvider = 'openai-compatible';
export type ASRProviderPreset =
  | 'openai'
  | 'aliyun-bailian'
  | 'custom-openai-compatible';

export interface ASRConfig {
  enabled: boolean;
  providerPreset: ASRProviderPreset;
  provider: ASRProvider;
  baseUrl: string;
  apiKey: string;
  model: string;
  realtimePath: string;
  transcriptionPath: string;
  streamingMode: ASRStreamingMode;
  language: string;
  autoSendFinalTranscript: boolean;
  holdToTalkShortcut: string;
  cache: ASRCacheConfig;
}
```

`provider` remains the actual engine selector. `providerPreset` is a UI/config template hint.

### Preset registry

Add a small registry in `asr-config.ts`:

```ts
interface ASRProviderPresetDefinition {
  id: ASRProviderPreset;
  label: string;
  provider: ASRProvider;
  baseUrl: string;
  model: string;
  realtimePath: string;
  transcriptionPath: string;
  streamingMode: ASRStreamingMode;
  language: string;
  note: string;
}
```

Required presets:

| Preset | Label | Provider | Base URL | Model default | Notes |
|---|---|---|---|---|---|
| `openai` | OpenAI | `openai-compatible` | `https://api.openai.com/v1` | `gpt-4o-mini-transcribe` | Existing default behavior |
| `aliyun-bailian` | 阿里百炼 / DashScope | `openai-compatible` | `https://dashscope.aliyuncs.com/compatible-mode/v1` | empty until verified | Uses OpenAI-compatible engine; user supplies a compatible ASR model |
| `custom-openai-compatible` | 自定义 OpenAI-compatible | `openai-compatible` | empty or current value | empty | User-managed endpoint/model/path |

The 阿里百炼 model default should remain empty unless implementation-time verification confirms a specific ASR model and endpoint combination. The UI should show a hint telling the user to fill in a 百炼 ASR model supported by their account and endpoint.

### Applying presets

Add a helper:

```ts
applyASRProviderPreset(config: ASRConfig, preset: ASRProviderPreset): ASRConfig
```

Behavior:

- Set `providerPreset` to the chosen preset.
- Set `provider` from the preset definition.
- Apply Base URL, model, realtime path, transcription path, streaming mode, and language from the preset when the user explicitly applies the preset.
- Preserve sensitive and safety fields:
  - never fill `apiKey`
  - keep `enabled` unchanged unless already disabled by defaults
  - keep `autoSendFinalTranscript` unchanged
  - keep cache settings unchanged
  - keep `holdToTalkShortcut` unchanged

## Settings UI design

Update the ASR settings tab:

- Replace the current single-option provider dropdown with preset choices:
  - OpenAI
  - 阿里百炼 / DashScope
  - 自定义 OpenAI-compatible
- Keep all existing connection fields visible and editable.
- Add an “应用推荐配置” button next to the preset selector.
- Add a short preset note area below the selector.

### Preset switching behavior

Changing the dropdown should update `providerPreset` in the form and display the note. It should not silently overwrite edited Base URL/model/path fields.

Clicking “应用推荐配置” should call the preset helper logic in the settings page and overwrite non-secret connection defaults for the selected preset. This makes the destructive part explicit and reversible before saving.

### 阿里百炼 copy

The UI hint should say:

> 阿里百炼预设复用 OpenAI-compatible ASR 引擎。请填写你的 DashScope API Key 和兼容 ASR 模型；如果所选模型不支持当前 realtime 或 transcription path，请改用自定义路径，或后续添加专用 provider engine。

## Runtime behavior

No runtime orchestration change is required.

- Renderer still captures audio through `MediaRecorder`.
- Preload still exposes `window.companion.voiceInput`.
- Main still uses `VoiceInputManager`.
- `VoiceInputManager` still calls `createASREngine(config)`.
- `createASREngine(config)` still returns `OpenAICompatibleASREngine` for `provider: 'openai-compatible'`.

If future work adds `asr-aliyun-bailian.ts`, only `ASRProvider`, `createASREngine`, the preset definition, tests, and docs need to change. Renderer and IPC should remain untouched.

## Error handling

- Missing API key, Base URL, or model while ASR is enabled should keep the current validation behavior.
- If 阿里百炼 is selected and model is empty, saving with ASR enabled should show the same missing model error.
- Provider connection failures should continue to surface as `voice-error` without deleting existing partial text.
- If realtime fails because the provider does not support the path/protocol, the user can switch to `chunked-fallback` or adjust paths in settings.

## Testing and verification

Contract tests should cover:

- `DEFAULT_ASR_CONFIG.providerPreset === 'openai'`.
- `ASR_PROVIDER_PRESETS.openai` exists and maps to `openai-compatible`.
- `ASR_PROVIDER_PRESETS['aliyun-bailian']` exists and maps to `openai-compatible`.
- `applyASRProviderPreset(DEFAULT_ASR_CONFIG, 'aliyun-bailian')`:
  - sets `providerPreset` to `aliyun-bailian`
  - keeps `provider` as `openai-compatible`
  - uses DashScope compatible-mode Base URL
  - does not fill `apiKey`
  - does not enable ASR automatically
  - does not enable auto-send automatically
  - preserves cache settings
- `createASREngine()` still returns `OpenAICompatibleASREngine` for the 阿里百炼 preset because its engine provider remains `openai-compatible`.

Required commands:

```bash
npm test
npm run build
```

Manual checks:

- F11 settings shows OpenAI, 阿里百炼 / DashScope, and 自定义 OpenAI-compatible.
- Selecting 阿里百炼 displays the compatibility note.
- Clicking “应用推荐配置” fills DashScope compatible-mode Base URL without filling API key.
- Saving ASR enabled without model/API key still shows validation error.
- Saving a filled 阿里百炼 config writes only local runtime config and does not add `src/config/asr.json` to git.

## Documentation updates

Implementation should update:

- `README.md`: mention ASR provider presets including 阿里百炼 / DashScope.
- `PROJECT_INDEX.md`: document `providerPreset` versus `provider` and note that 阿里百炼 currently uses the OpenAI-compatible ASR engine.
- `VERSION.md`: add an unreleased/v0.3.x entry for ASR provider presets.
- `docs/configuration-security.md`: clarify that DashScope API keys follow the same runtime-only rule as other ASR keys.
- Existing ASR design doc may be linked to this preset extension instead of rewritten.

## Success criteria

- Users can choose 阿里百炼 / DashScope in ASR settings.
- The selected preset can apply a recommended compatible-mode Base URL while keeping secrets empty.
- Existing OpenAI-compatible ASR behavior remains unchanged by default.
- The codebase still has one ASR engine implementation after this iteration.
- Tests and build pass.
- Docs clearly state that 阿里百炼 is a preset over the OpenAI-compatible engine, not a dedicated provider engine yet.
