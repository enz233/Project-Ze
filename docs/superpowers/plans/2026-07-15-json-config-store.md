# JSON Config Store Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a reusable `JsonConfigStore<T>` for Electron `userData/config` JSON persistence and migrate `TTSConfigManager` onto it without changing public behavior.

**Architecture:** `JsonConfigStore<T>` owns generic config directory creation, JSON load, shallow default merge, save, and failure logging. `TTSConfigManager` keeps the TTS config type, defaults, and public `get()` / `update()` / `save()` API, but delegates persistence to the store. Documentation records the shared helper and the runtime-config boundary.

**Tech Stack:** Electron main process, TypeScript, Node `fs` / `path`, existing config managers under `src/core`.

## Global Constraints

- Introduce a reusable `JsonConfigStore<T>` for JSON config files under Electron `userData/config`.
- Preserve existing configuration file names, paths, defaults, and public manager APIs.
- Migrate one low-risk configuration manager first: `TTSConfigManager`.
- Keep settings UI behavior unchanged.
- Keep runtime config out of the source tree.
- Do not migrate every config manager in one iteration.
- Do not redesign settings UI or IPC contracts.
- Do not add schema validation libraries.
- Do not change config file names or move runtime config out of `app.getPath('userData')/config`.
- Do not change default config values.
- Do not clean or rewrite existing user config files.
- `npm run build` must pass.
- Run `npm test`; if it reports `Missing script: "test"`, record that exact result and do not claim tests passed.

---

## File Structure

- Create: `src/core/json-config-store.ts` — generic JSON persistence helper for object-shaped runtime config.
- Modify: `src/core/tts-config.ts` — keep `TTSConfig`, defaults, and `TTSConfigManager` public API while delegating persistence to `JsonConfigStore<TTSConfig>`.
- Modify: `PROJECT_INDEX.md` — document the shared JSON config store and TTS config persistence boundary.

---

## Task 1: Add `JsonConfigStore<T>` and migrate `TTSConfigManager`

**Files:**
- Create: `src/core/json-config-store.ts`
- Modify: `src/core/tts-config.ts`

**Interfaces:**
- Consumes: Electron `app.getPath('userData')`, Node `fs` / `path`, existing `TTSConfig` and `DEFAULT_CONFIG` values.
- Produces:
  - `export interface JsonConfigStoreOptions<T extends object> { fileName: string; defaults: T; namespace: string; }`
  - `export class JsonConfigStore<T extends object> { get(): T; update(partial: Partial<T>): void; save(): void; }`
  - `TTSConfigManager` with unchanged public methods: `get(): TTSConfig`, `update(partial: Partial<TTSConfig>): void`, `save(): void`.

- [ ] **Step 1: Create the generic store file**

Create `src/core/json-config-store.ts`:

```ts
import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';

export interface JsonConfigStoreOptions<T extends object> {
  fileName: string;
  defaults: T;
  namespace: string;
}

export class JsonConfigStore<T extends object> {
  private configPath: string;
  private defaults: T;
  private namespace: string;
  private value: T;

  constructor(options: JsonConfigStoreOptions<T>) {
    this.defaults = options.defaults;
    this.namespace = options.namespace;

    const configDir = path.join(app.getPath('userData'), 'config');
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }

    this.configPath = path.join(configDir, options.fileName);
    this.value = this.load();
  }

  get(): T {
    return this.value;
  }

  update(partial: Partial<T>): void {
    this.value = { ...this.value, ...partial };
    this.save();
  }

  save(): void {
    try {
      fs.writeFileSync(this.configPath, JSON.stringify(this.value, null, 2), 'utf-8');
    } catch (e) {
      console.error(`[${this.namespace}] 保存失败:`, e);
    }
  }

  private load(): T {
    try {
      if (fs.existsSync(this.configPath)) {
        const raw = fs.readFileSync(this.configPath, 'utf-8');
        return { ...this.defaults, ...JSON.parse(raw) };
      }
    } catch (e) {
      console.error(`[${this.namespace}] 加载失败:`, e);
    }
    return { ...this.defaults };
  }
}
```

- [ ] **Step 2: Update `TTSConfigManager` imports**

In `src/core/tts-config.ts`, remove:

```ts
import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';
```

Add:

```ts
import { JsonConfigStore } from './json-config-store';
```

Do not change `TTSMode`, `TTSLanguage`, `TTSConfig`, or any `DEFAULT_CONFIG` field values.

- [ ] **Step 3: Replace `TTSConfigManager` persistence fields and constructor**

Replace these fields:

```ts
private configPath: string;
private config: TTSConfig;
```

with:

```ts
private store: JsonConfigStore<TTSConfig>;
```

Replace the constructor with:

```ts
constructor() {
  this.store = new JsonConfigStore<TTSConfig>({
    fileName: 'tts.json',
    defaults: DEFAULT_CONFIG,
    namespace: 'TTSConfig',
  });
}
```

- [ ] **Step 4: Remove local `load()` and delegate public methods**

Delete the private `load(): TTSConfig` method from `TTSConfigManager`.

Replace `save()`, `get()`, and `update()` with:

```ts
save(): void {
  this.store.save();
}

get(): TTSConfig {
  return this.store.get();
}

update(partial: Partial<TTSConfig>): void {
  this.store.update(partial);
}
```

- [ ] **Step 5: Run build**

Run:

```bash
npm run build
```

Expected: `tsc` exits 0.

- [ ] **Step 6: Verify TTSConfigManager no longer owns fs/path/app persistence**

Run:

```bash
git grep -n "from 'fs'\|from 'path'\|from 'electron'\|fs\.\|path\.\|app\.getPath" -- src/core/tts-config.ts src/core/json-config-store.ts
```

Expected:

- Matches for `fs`, `path`, and `app.getPath('userData')` are in `src/core/json-config-store.ts`.
- `src/core/tts-config.ts` has no matches for direct `fs`, `path`, Electron `app`, or `app.getPath` usage.

- [ ] **Step 7: Verify runtime file name remains `tts.json`**

Run:

```bash
git grep -n "tts.json" -- src/core/tts-config.ts src/core/json-config-store.ts src/config
```

Expected:

- `src/core/tts-config.ts` contains `fileName: 'tts.json'`.
- No real `src/config/tts.json` is tracked; example files may mention `tts.example.json`.

- [ ] **Step 8: Commit Task 1**

Run:

```bash
git add src/core/json-config-store.ts src/core/tts-config.ts
git commit -m "refactor: add json config store"
```

---

## Task 2: Update architecture notes and run final verification

**Files:**
- Modify: `PROJECT_INDEX.md`

**Interfaces:**
- Consumes: `JsonConfigStore<T>` from Task 1 and migrated `TTSConfigManager`.
- Produces: project documentation that records the shared runtime config persistence helper.

- [ ] **Step 1: Update core module list in `PROJECT_INDEX.md`**

In `PROJECT_INDEX.md`, add this item near the other core module bullets:

```md
- `json-config-store.ts`：通用 JSON 配置持久化助手，负责 Electron `userData/config` 下运行态配置的目录创建、默认值合并、读写和错误日志。
```

- [ ] **Step 2: Update config architecture note**

In `PROJECT_INDEX.md`, near the AI/TTS configuration notes, add or update a bullet with this wording:

```md
- **运行态配置存储**：真实用户配置保存在 Electron `userData/config`；通用读写逻辑由 `JsonConfigStore<T>` 承担，已迁移的配置管理器保留原有 `get()` / `update()` / `save()` API，源码树只保留默认规则和安全 example 文件。
```

- [ ] **Step 3: Run build**

Run:

```bash
npm run build
```

Expected: `tsc` exits 0.

- [ ] **Step 4: Run npm test and record exact status**

Run:

```bash
npm test
```

Expected for the current project unless a test script was added:

```text
npm error Missing script: "test"
```

Record this as “test script missing” and do not report tests as passing. If a test script exists, it must pass before continuing.

- [ ] **Step 5: Run final config-store verification commands**

Run:

```bash
git grep -n "from 'fs'\|from 'path'\|from 'electron'\|fs\.\|path\.\|app\.getPath" -- src/core/tts-config.ts src/core/json-config-store.ts
git grep -n "tts.json" -- src/core/tts-config.ts src/core/json-config-store.ts src/config
git ls-files src/config
```

Expected:

- `src/core/tts-config.ts` does not directly import or call `fs`, `path`, Electron `app`, or `app.getPath`.
- `src/core/json-config-store.ts` is the file that owns generic `fs` / `path` / `app.getPath('userData')` persistence.
- `src/core/tts-config.ts` still names runtime file `tts.json` through `fileName: 'tts.json'`.
- `git ls-files src/config` does not include real runtime config files such as `src/config/tts.json`.

- [ ] **Step 6: Run final status and whitespace checks**

Run:

```bash
git status --short
git diff --check
```

Expected: only `PROJECT_INDEX.md` is modified before the docs commit; `git diff --check` reports no whitespace errors. CRLF warnings are acceptable on Windows.

- [ ] **Step 7: Commit Task 2**

Run:

```bash
git add PROJECT_INDEX.md
git commit -m "docs: update json config store notes"
```

## Self-Review

Spec coverage:

- Reusable `JsonConfigStore<T>` under `userData/config`: Task 1.
- Preserve names, paths, defaults, and public manager APIs: Task 1 keeps `tts.json`, `DEFAULT_CONFIG`, and `TTSConfigManager` methods.
- Migrate one low-risk manager first: Task 1 migrates only `TTSConfigManager`.
- Settings UI unchanged: no settings files appear in the file list.
- Runtime config remains out of source tree: Task 2 verifies `git ls-files src/config`.
- Documentation update: Task 2.
- Build and npm test status: Task 2 final verification.

Placeholder scan: no unfinished placeholder markers remain. Every code-changing step includes exact code or exact replacement snippets.

Type consistency:

- `JsonConfigStoreOptions<T>` and `JsonConfigStore<T>` signatures in Task 1 match the design document.
- `TTSConfigManager.get()`, `update()`, and `save()` signatures are unchanged.
- `fileName: 'tts.json'`, `defaults: DEFAULT_CONFIG`, and `namespace: 'TTSConfig'` match the design document.
