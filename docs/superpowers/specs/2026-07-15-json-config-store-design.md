# JSON Config Store Design

## Context

The recent architecture cleanup established that real runtime configuration belongs under Electron `userData/config`, while the repository should only track safe examples and default rule files. The TTS engine interface refactor is complete, and the remaining deferred follow-up list identifies configuration storage genericization as the next bounded infrastructure improvement.

Several configuration managers follow the same shape: locate `app.getPath('userData')/config`, create the directory, load JSON if present, merge it with defaults, expose `get()` / `update()` / `save()`, and log failures without crashing. This design extracts that repeated persistence pattern into a small generic store while preserving each manager's public API.

## Goals

- Introduce a reusable `JsonConfigStore<T>` for JSON config files under Electron `userData/config`.
- Preserve existing configuration file names, paths, defaults, and public manager APIs.
- Migrate one low-risk configuration manager first, preferably TTS config because it is structurally clear and recently reviewed.
- Keep settings UI behavior unchanged.
- Keep runtime config out of the source tree.
- Make future config managers easier to maintain without adding a large validation framework.

## Non-goals

- Do not migrate every config manager in one iteration.
- Do not redesign settings UI or IPC contracts.
- Do not add schema validation libraries.
- Do not change config file names or move runtime config out of `app.getPath('userData')/config`.
- Do not change default config values.
- Do not clean or rewrite existing user config files.

## Proposed approach

Add a focused helper in `src/core/json-config-store.ts`:

```ts
export interface JsonConfigStoreOptions<T extends object> {
  fileName: string;
  defaults: T;
  namespace: string;
}

export class JsonConfigStore<T extends object> {
  constructor(options: JsonConfigStoreOptions<T>);
  get(): T;
  update(partial: Partial<T>): void;
  save(): void;
}
```

The store owns only JSON persistence mechanics:

- resolving `app.getPath('userData')/config/<fileName>`
- creating the config directory
- reading JSON
- shallow-merging parsed content over defaults
- writing pretty JSON
- logging load/save failures with the provided namespace

Configuration-specific managers continue to own domain meaning. For the first migration, `TTSConfigManager` keeps its public methods:

```ts
get(): TTSConfig;
update(partial: Partial<TTSConfig>): void;
save(): void;
```

Internally it delegates to `JsonConfigStore<TTSConfig>`.

## Components

### `JsonConfigStore<T>`

Responsibility: generic, shallow JSON object persistence.

Dependencies:

- `fs`
- `path`
- Electron `app`

It should not know about AI, TTS, appearance, chat history, or any specific config schema.

### `TTSConfigManager`

Responsibility: TTS-specific config shape, defaults, and stable public API.

After migration, it should no longer duplicate directory creation and JSON read/write logic. It should construct:

```ts
new JsonConfigStore<TTSConfig>({
  fileName: 'tts.json',
  defaults: DEFAULT_CONFIG,
  namespace: 'TTSConfig',
});
```

### Documentation

Update `PROJECT_INDEX.md` so the core module list mentions the shared JSON config store and clarifies that runtime config managers persist to `userData/config` through that helper.

## Data flow

```txt
TTSConfigManager
→ JsonConfigStore<TTSConfig>
→ userData/config/tts.json
```

Read path:

```txt
constructor
→ JsonConfigStore.load()
→ defaults + parsed JSON
→ TTSConfigManager.get()
```

Write path:

```txt
TTSConfigManager.update(partial)
→ JsonConfigStore.update(partial)
→ JsonConfigStore.save()
→ userData/config/tts.json
```

## Error handling

- If the config directory does not exist, create it recursively.
- If reading fails or JSON is invalid, log `[namespace] 加载失败:` and use a fresh shallow copy of defaults.
- If saving fails, log `[namespace] 保存失败:` and do not crash the app.
- If a saved config omits new fields, default values fill those fields through shallow merge.
- The store does not validate semantic correctness such as API key format, model names, or provider-specific values.

## Testing and verification

Required verification for the implementation plan:

- `npm run build` must pass.
- `npm test` should be run. If the project still has no test script, record the exact `Missing script: "test"` result and do not claim tests passed.
- Verify by search that migrated `TTSConfigManager` no longer imports `fs`, `path`, or Electron `app` directly.
- Verify by search that `JsonConfigStore` is the file that uses `app.getPath('userData')` for migrated config persistence.
- Verify by search that `tts.json` remains the runtime file name and that source-tree config examples are unchanged.
- Verify `PROJECT_INDEX.md` reflects the new helper.

## Commit strategy

Recommended implementation commits:

1. `refactor: add generic json config store`
2. `refactor: move tts config onto json store`
3. `docs: update config store architecture notes`

If the code change is small, the first two commits may be combined, but documentation should remain separately reviewable.

## Success criteria

- `JsonConfigStore<T>` centralizes repeated JSON persistence mechanics.
- `TTSConfigManager` keeps the same public API and default values.
- Runtime TTS config still lives at Electron `userData/config/tts.json`.
- Settings UI and TTS behavior remain unchanged.
- Build verification passes, and missing test script status is recorded honestly if unchanged.
