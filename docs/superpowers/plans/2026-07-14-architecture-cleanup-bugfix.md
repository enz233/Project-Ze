# Architecture Cleanup Bugfix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task by task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove real runtime config from the source tree, delete unreachable proactive-response code, centralize window/activity detection, share the ScreenAnalyzer instance, and update architecture docs without changing visible app behavior.

**Architecture:** Keep the current proactive main path as `ObserverManager → ContextCollector → ProactiveReactionSystem → MicroBehaviorManager → BubbleManager`. Extract duplicated foreground-window/activity logic into a small `WindowActivityService` used by both `ContextCollector` and `BubbleManager`. Keep `ScreenAnalyzer` as the only Vision service and inject the existing main-process instance into `ChatManager`.

**Tech Stack:** Electron, TypeScript, Node.js `child_process`, JSON config examples, Git.

## Global Constraints

- Do not overwrite existing uncommitted work. At plan-writing time, `git status --short` showed modified `package.json`, `src/core/chat-manager.ts`, `src/core/tts-manager.ts`, and `src/main/preload.ts`; inspect diffs before editing these files.
- Do not delete Electron `userData/config` data. Only clean runtime files under the repository source tree.
- Do not rewrite git history. If secrets were ever committed, recommend key rotation separately.
- Preserve visible behavior: chat, TTS, screen analysis, proactive bubbles, micro-behaviors, and build flow must still compile and work through the current main path.
- Runtime configs must live in Electron `app.getPath('userData')/config`; repository `src/config` may contain default rules and `*.example.json` only.
- Build verification command is `npm run build`.
- If `npm test` still reports `Missing script: "test"`, record that fact; do not report tests as passing.

---

## File Structure

### Files modified across tasks

- `.gitignore` — ensure real runtime config files stay ignored while example files remain tracked.
- `package.json` — remove any packaging entries that include real runtime configs; preserve unrelated existing edits.
- `src/config/ai-config.json` — remove from repository/source tree if present.
- `src/config/chat-history.json` — remove from repository/source tree if present.
- `src/config/ai-memory.json` — remove if present.
- `src/config/tts.json` — remove if present.
- `src/config/appearance.json` — remove if present.
- `src/core/chat-manager.ts` — remove old proactive fields/methods; accept injected `ScreenAnalyzer`; preserve current chat-status/TTS edits.
- `src/core/observer-manager.ts` — remove old trigger/Vision analysis chain; keep current proactive main path.
- `src/core/screenshot-trigger.ts` — delete if no current callers remain after Observer cleanup.
- `src/core/window-activity-service.ts` — create shared foreground-window/activity detection service.
- `src/core/context-collector.ts` — use `WindowActivityService` instead of local `exec`/process extraction.
- `src/core/bubble-manager.ts` — use `WindowActivityService` instead of local `exec`/activity matching.
- `src/main/main.ts` — create `WindowActivityService`; inject it into `BubbleManager` and `ContextCollector`/`ObserverManager` path; inject existing `ScreenAnalyzer` into `ChatManager`.
- `PROJECT_INDEX.md` — update current architecture and config boundaries.
- `GUIDE.md` — ensure config section points to examples and runtime config boundary.
- `docs/configuration-security.md` — ensure security policy matches implemented file boundary.

### New interfaces

Create `src/core/window-activity-service.ts`:

```ts
export interface ActivityContext {
  windowTitle: string;
  processName: string;
  category?: string;
  matchedActivity?: string;
  bubble?: string;
}

export class WindowActivityService {
  async getActiveWindowTitle(): Promise<string>;
  extractProcessName(title: string): string;
  classify(title: string): ActivityContext;
}
```

`category` values should be stable lowercase strings: `coding`, `video`, `chat`, `game`, `work`, `browser`, or `undefined`.

---

## Task 1: Remove Runtime Config and History from Source Tree

**Files:**
- Modify: `.gitignore`
- Modify: `package.json`
- Modify: `docs/configuration-security.md`
- Modify: `PROJECT_INDEX.md`
- Modify: `GUIDE.md`
- Remove from repository/source tree if present: `src/config/ai-config.json`
- Remove from repository/source tree if present: `src/config/chat-history.json`
- Remove from repository/source tree if present: `src/config/ai-memory.json`
- Remove from repository/source tree if present: `src/config/tts.json`
- Remove from repository/source tree if present: `src/config/appearance.json`

**Interfaces:**
- Consumes: existing example files in `src/config/*.example.json`.
- Produces: repository config boundary where `src/config` tracks only default rule files and example files.

- [ ] **Step 1: Inspect current config tracking and pending package edits**

Run:

```bash
git status --short
git ls-files src/config package.json .gitignore docs/configuration-security.md PROJECT_INDEX.md GUIDE.md
git diff -- package.json .gitignore docs/configuration-security.md PROJECT_INDEX.md GUIDE.md
```

Expected:

- Real config files may exist in the working tree.
- `src/config/ai-config.json` and `src/config/chat-history.json` must not remain tracked after this task.
- Preserve unrelated existing edits in `package.json` and other files.

- [ ] **Step 2: Remove real runtime config files from git index and source tree**

Run:

```bash
git rm -f --ignore-unmatch src/config/ai-config.json src/config/chat-history.json src/config/ai-memory.json src/config/tts.json src/config/appearance.json
```

Expected:

- If files are tracked, Git stages deletions.
- If some files are not tracked or absent, command still exits successfully because of `--ignore-unmatch`.

- [ ] **Step 3: Confirm `.gitignore` contains the runtime config boundary**

Ensure `.gitignore` includes exactly these config rules, preserving existing unrelated rules:

```gitignore
src/config/ai-config.json
src/config/ai-memory.json
src/config/chat-history.json
src/config/appearance.json
src/config/tts.json
!src/config/*.example.json
```

If any line is missing, edit `.gitignore` to add it once. Do not add broad `src/config/*.json` ignore because rule/default files such as `states.json`, `proactive-reactions.json`, and `micro-behaviors.json` must remain tracked.

- [ ] **Step 4: Remove runtime config entries from package build files list**

Open `package.json` and inspect `build.files`. It should include default rule/assets files only, not real runtime configs.

Allowed config entries:

```json
"src/config/states.json",
"src/config/proactive-reactions.json",
"src/config/micro-behaviors.json"
```

Remove any of these if present:

```json
"src/config/ai-config.json",
"src/config/chat-history.json",
"src/config/ai-memory.json",
"src/config/tts.json",
"src/config/appearance.json"
```

Do not rewrite unrelated `package.json` fields.

- [ ] **Step 5: Ensure docs name source examples and runtime userData**

In `docs/configuration-security.md`, ensure the policy contains this substance:

```md
Project-Ze 的真实运行时配置不应提交到仓库。应用运行时会把用户配置、聊天历史和记忆写入 Electron `userData/config` 目录；仓库中的配置文件只应保存默认规则或安全示例。
```

In `GUIDE.md`, ensure the config section lists example files, not real runtime files:

```md
| `ai-config.example.json` | src/config/ | AI 配置示例（API Key 为空） |
| `tts.example.json` | src/config/ | TTS 配置示例（API Key 为空） |
| `chat-history.example.json` | src/config/ | 对话历史示例（空消息列表） |
| `ai-memory.example.json` | src/config/ | AI 记忆示例（无个人内容） |
| `appearance.example.json` | src/config/ | 外观配置示例 |
```

In `PROJECT_INDEX.md`, ensure the `src/config` tree does not list real config files as tracked source files. Use:

```md
│   ├── *.example.json      # 可提交的安全配置示例
│   └── 本地真实配置          # AI/TTS/外观/聊天/记忆运行时生成，gitignore
```

- [ ] **Step 6: Verify no tracked real runtime config remains**

Run:

```bash
git ls-files src/config
```

Expected output must contain only safe tracked config files such as:

```txt
src/config/ai-config.example.json
src/config/ai-memory.example.json
src/config/appearance.example.json
src/config/chat-history.example.json
src/config/micro-behaviors.json
src/config/proactive-reactions.json
src/config/states.json
src/config/tts.example.json
```

It must not contain:

```txt
src/config/ai-config.json
src/config/chat-history.json
src/config/ai-memory.json
src/config/tts.json
src/config/appearance.json
```

- [ ] **Step 7: Run sensitive-content scan**

Run:

```bash
python - <<'PY'
from pathlib import Path
import re
bad = []
for p in Path('.').rglob('*'):
    if '.git' in p.parts or 'node_modules' in p.parts or not p.is_file():
        continue
    try:
        text = p.read_text(encoding='utf-8')
    except Exception:
        continue
    for i, line in enumerate(text.splitlines(), 1):
        if re.search(r'sk-[A-Za-z0-9_-]+', line):
            bad.append((str(p), i, 'secret-token pattern'))
        if re.search(r'(apiKey|ApiKey|api_key)"?\s*[:=]\s*"[^"\s]{8,}"', line):
            if '.example.json' not in str(p):
                bad.append((str(p), i, 'non-empty api key'))
for item in bad:
    print(f'{item[0]}:{item[1]} {item[2]}')
raise SystemExit(1 if bad else 0)
PY
```

Expected: exit code 0 and no output.

- [ ] **Step 8: Build**

Run:

```bash
npm run build
```

Expected: `tsc` exits 0. The npm warning about `electron_mirror` may appear and is not a failure.

- [ ] **Step 9: Commit**

Run:

```bash
git status --short
git add .gitignore package.json docs/configuration-security.md PROJECT_INDEX.md GUIDE.md src/config
git commit -m "chore: remove local runtime config from source tree"
```

Expected: commit succeeds. If `package.json` had unrelated pre-existing edits, stage only the runtime-config packaging hunk with `git add -p package.json`.

---

## Task 2: Remove Legacy Proactive Response Paths

**Files:**
- Modify: `src/core/chat-manager.ts`
- Modify: `src/core/observer-manager.ts`
- Delete: `src/core/screenshot-trigger.ts` if no callers remain

**Interfaces:**
- Consumes: current proactive path `ObserverManager.collectAndAnalyze()`, `ProactiveReactionSystem.evaluateComponent(snapshot)`, `MicroBehaviorManager.performForCandidate(candidate)`, `BubbleManager.tryShowProactiveBubble(text, source)`.
- Produces: `ObserverManager` with one active proactive path and no unused old trigger/Vision methods.

- [ ] **Step 1: Inspect existing uncommitted changes before editing**

Run:

```bash
git status --short
git diff -- src/core/chat-manager.ts src/core/observer-manager.ts src/core/screenshot-trigger.ts
```

Expected: identify any user edits, especially chat status and TTS changes in `chat-manager.ts`. Preserve them.

- [ ] **Step 2: Remove unused proactive fields from `ChatManager`**

In `src/core/chat-manager.ts`, remove these fields if present:

```ts
private proactiveTimer: ReturnType<typeof setInterval> | null = null;
private currentActivity: string = '';
```

Remove `updateActivity(activity: string): void` if its only purpose is storing `currentActivity` for old proactive logic.

Remove any old proactive methods if present below the visible section, such as:

```ts
startProactiveMessages(...)
stopProactiveMessages(...)
checkProactiveMessage(...)
sendProactiveMessage(...)
```

Keep this constructor comment or equivalent:

```ts
// 主动回应由 ObserverManager + ProactiveReactionSystem 统一处理，避免多套主动气泡互相竞争。
```

- [ ] **Step 3: Remove BubbleManager-to-ChatManager activity callback in `main.ts` if it only feeds old ChatManager state**

If `chatManager.updateActivity()` was removed, delete this block from `src/main/main.ts`:

```ts
// 连接活动监视到 ChatManager
bubbleManager.setOnActivity((title) => {
  chatManager?.updateActivity(title);
});
```

Do not remove `bubbleManager.startActivityMonitor(45000)` in this task; Task 3 will move its detection to `WindowActivityService`.

- [ ] **Step 4: Remove old imports and fields from `ObserverManager`**

In `src/core/observer-manager.ts`, remove these imports if no longer used:

```ts
import { ScreenshotTrigger } from './screenshot-trigger';
```

Remove this interface if no longer used:

```ts
interface AnalysisResult {
  user_activity: string;
  user_emotion_estimate: string;
  should_speak: boolean;
  importance: number;
  suggested_response: string;
}
```

Remove these fields if no longer used:

```ts
private screenshotTrigger: ScreenshotTrigger;
private screenAnalyzer: ScreenAnalyzer;
private lastWindow: string = '';
private lastTriggerTime: number = 0;
private stayTriggered: Set<number> = new Set();
```

Keep constructor parameter `screenAnalyzer: ScreenAnalyzer` only if Task 4 has not yet removed it. If this task removes all Observer use of `screenAnalyzer`, remove the constructor parameter and update `main.ts` accordingly:

Before:

```ts
observerManager = new ObserverManager(
  mainWindow, aiService, chatManager.getEmotionUpdater().getEmotionSystem(),
  stateManager, chatManager.getMemory(), screenAnalyzer, aiConfigManager,
  bubbleManager, proactiveReactionSystem, microBehaviorManager
);
```

After:

```ts
observerManager = new ObserverManager(
  mainWindow, aiService, chatManager.getEmotionUpdater().getEmotionSystem(),
  stateManager, chatManager.getMemory(), aiConfigManager,
  bubbleManager, proactiveReactionSystem, microBehaviorManager
);
```

And update the constructor signature to match:

```ts
constructor(
  mainWindow: BrowserWindow,
  aiService: AIService,
  emotionSystem: EmotionSystem,
  stateManager: StateManager,
  memory: AIMemory,
  configManager: AIConfigManager,
  bubbleManager: BubbleManager,
  proactiveReactionSystem: ProactiveReactionSystem,
  microBehaviorManager: MicroBehaviorManager
)
```

- [ ] **Step 5: Remove old Observer trigger/Vision methods**

Delete these methods entirely from `src/core/observer-manager.ts`:

```ts
private checkStayTrigger(snapshot: ContextSnapshot): string | null
private checkSwitchTrigger(snapshot: ContextSnapshot): string | null
private async triggerWithLLM(snapshot: ContextSnapshot, reason: string): Promise<void>
private async triggerWithVision(snapshot: ContextSnapshot, reason: string): Promise<void>
private async performAnalysis(snapshot: ContextSnapshot): Promise<boolean>
private async requestAnalysis(context: ContextSnapshot, screenshot: string): Promise<AnalysisResult | null>
private parseAnalysisResult(response: string): AnalysisResult | null
private getConfig(): any
private sendBubble(text: string): void
```

Do not delete these current-path methods:

```ts
start(intervalMs?: number): void
stop(): void
recordActivity(): void
private async collectAndAnalyze(): Promise<void>
private async resolveCandidateText(candidate: ProactiveCandidate, snapshot: ContextSnapshot): Promise<string>
private delay(ms: number): Promise<void>
private async generateReactionText(candidate: ProactiveCandidate, snapshot: ContextSnapshot): Promise<string>
```

- [ ] **Step 6: Delete `ScreenshotTrigger` if unreferenced**

Run:

```bash
git grep -n "ScreenshotTrigger\|screenshot-trigger"
```

If the only match is `src/core/screenshot-trigger.ts` itself, delete it:

```bash
git rm src/core/screenshot-trigger.ts
```

If there are remaining active callers, do not delete the file; instead remove only references to old Observer paths and document the remaining caller in the task report.

- [ ] **Step 7: Build**

Run:

```bash
npm run build
```

Expected: `tsc` exits 0. Fix TypeScript unused imports/constructor mismatch if it fails.

- [ ] **Step 8: Verify old proactive symbols are gone**

Run:

```bash
git grep -n "checkStayTrigger\|checkSwitchTrigger\|triggerWithLLM\|triggerWithVision\|performAnalysis\|requestAnalysis\|parseAnalysisResult\|startProactive\|checkProactiveMessage\|sendProactiveMessage" -- src/core
```

Expected: no matches.

- [ ] **Step 9: Commit**

Run:

```bash
git add src/core/chat-manager.ts src/core/observer-manager.ts src/core/screenshot-trigger.ts src/main/main.ts
git commit -m "refactor: remove legacy proactive response paths"
```

If `src/core/screenshot-trigger.ts` was not deleted, omit it from `git add`.

---

## Task 3: Centralize Window and Activity Detection

**Files:**
- Create: `src/core/window-activity-service.ts`
- Modify: `src/core/context-collector.ts`
- Modify: `src/core/bubble-manager.ts`
- Modify: `src/core/observer-manager.ts`
- Modify: `src/main/main.ts`

**Interfaces:**
- Consumes: current `ContextSnapshot` shape.
- Produces: `WindowActivityService`, `ActivityContext`, and constructors that accept the shared service.

- [ ] **Step 1: Create `WindowActivityService`**

Create `src/core/window-activity-service.ts` with:

```ts
import * as os from 'os';
import { exec } from 'child_process';

export interface ActivityContext {
  windowTitle: string;
  processName: string;
  category?: string;
  matchedActivity?: string;
  bubble?: string;
}

interface ActivityRule {
  category: string;
  processName: string;
  keywords: string[];
  bubble?: string;
}

const ACTIVITY_RULES: ActivityRule[] = [
  { category: 'coding', processName: 'VSCode', keywords: ['Visual Studio Code', 'VSCode', 'WebStorm', 'IntelliJ', 'PyCharm', 'Cursor'], bubble: '在写代码吗~' },
  { category: 'video', processName: 'Video', keywords: ['YouTube', 'Bilibili', 'bilibili', '爱奇艺', '腾讯视频', 'Netflix'], bubble: '在看什么呀~' },
  { category: 'chat', processName: 'Chat', keywords: ['微信', 'WeChat', 'QQ', 'Telegram', 'Discord', 'Slack'], bubble: '在聊天吗~' },
  { category: 'game', processName: 'Game', keywords: ['Steam', 'Epic', 'WeGame', '游戏', 'Game'], bubble: '在玩游戏呀~' },
  { category: 'work', processName: 'Work', keywords: ['Word', 'PowerPoint', 'Excel', 'Notion', '飞书', '钉钉', 'WPS'], bubble: '在工作吗~' },
  { category: 'browser', processName: 'Browser', keywords: ['Chrome', 'Firefox', 'Edge', '浏览器', 'Browser', 'Opera'], bubble: '在逛什么呢~' },
];

export class WindowActivityService {
  async getActiveWindowTitle(): Promise<string> {
    const platform = os.platform();
    return new Promise((resolve) => {
      let cmd: string;
      if (platform === 'darwin') {
        cmd = `osascript -e 'tell application "System Events" to get name of first application process whose frontmost is true'`;
      } else if (platform === 'win32') {
        const script = [
          'Add-Type -TypeDefinition @"',
          'using System;',
          'using System.Runtime.InteropServices;',
          'using System.Text;',
          'public class Win32 {',
          '  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();',
          '  [DllImport("user32.dll", CharSet=CharSet.Auto)] public static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);',
          '}',
          '"@',
          '$h = [Win32]::GetForegroundWindow()',
          '$sb = New-Object System.Text.StringBuilder 256',
          '[Win32]::GetWindowText($h, $sb, 256) | Out-Null',
          '$sb.ToString()',
        ].join('; ');
        const encoded = Buffer.from(script, 'utf16le').toString('base64');
        cmd = `powershell -NoProfile -EncodedCommand ${encoded}`;
      } else {
        resolve('');
        return;
      }

      exec(cmd, { timeout: 5000 }, (error, stdout) => {
        if (error) {
          resolve('');
          return;
        }
        resolve(stdout.trim());
      });
    });
  }

  extractProcessName(title: string): string {
    if (!title) return '';
    const rule = this.findRule(title);
    if (rule) return rule.processName;
    return title.split(' - ')[0] || title;
  }

  classify(title: string): ActivityContext {
    const rule = this.findRule(title);
    return {
      windowTitle: title,
      processName: rule ? rule.processName : this.extractProcessName(title),
      category: rule?.category,
      matchedActivity: rule?.category,
      bubble: rule?.bubble,
    };
  }

  private findRule(title: string): ActivityRule | undefined {
    const lower = title.toLowerCase();
    return ACTIVITY_RULES.find(rule =>
      rule.keywords.some(keyword => lower.includes(keyword.toLowerCase()))
    );
  }
}
```

- [ ] **Step 2: Update `ContextCollector` constructor and collect path**

In `src/core/context-collector.ts`, remove imports:

```ts
import * as os from 'os';
import { exec } from 'child_process';
```

Add import:

```ts
import { WindowActivityService } from './window-activity-service';
```

Change constructor and add field:

```ts
private activityService: WindowActivityService;

constructor(activityService: WindowActivityService = new WindowActivityService()) {
  this.activityService = activityService;
  this.setupActivityListeners();
}
```

Change `collect()` to:

```ts
async collect(): Promise<ContextSnapshot> {
  const windowTitle = await this.activityService.getActiveWindowTitle();
  console.log('[Context] raw window title:', JSON.stringify(windowTitle));
  const now = Date.now();

  if (windowTitle !== this.lastWindowTitle) {
    this.lastWindowTitle = windowTitle;
    this.lastWindowChangeTime = now;
  }

  const windowDuration = (now - this.lastWindowChangeTime) / 1000;
  const userActive = (now - this.lastUserActivityTime) < 5000;
  const activity = this.activityService.classify(windowTitle);

  return {
    windowTitle,
    processName: activity.processName,
    windowDuration,
    userActive,
    currentTime: new Date(),
  };
}
```

Delete local methods:

```ts
private extractProcessName(title: string): string
private getActiveWindowTitle(): Promise<string>
```

- [ ] **Step 3: Update `BubbleManager` to use `WindowActivityService`**

In `src/core/bubble-manager.ts`, remove imports:

```ts
import { exec } from 'child_process';
import * as os from 'os';
```

Add import:

```ts
import { WindowActivityService } from './window-activity-service';
```

Add constructor parameter and field:

```ts
private activityService: WindowActivityService;

constructor(
  mainWindow: BrowserWindow,
  timeAwareness: TimeAwareness,
  stateManager: StateManager,
  activityService: WindowActivityService = new WindowActivityService()
) {
  this.mainWindow = mainWindow;
  this.timeAwareness = timeAwareness;
  this.stateManager = stateManager;
  this.activityService = activityService;
}
```

Change `checkActivity()` to:

```ts
private async checkActivity(): Promise<void> {
  try {
    const title = await this.activityService.getActiveWindowTitle();
    if (!title) return;

    if (this.onActivityCallback) {
      this.onActivityCallback(title);
    }

    const activity = this.activityService.classify(title);
    const bubble = activity.bubble || null;
    const now = Date.now();
    const ACTIVITY_BUBBLE_COOLDOWN = 20 * 60 * 1000;
    if (bubble && bubble !== this.lastActivityBubble && now - this.lastActivityBubbleTime > ACTIVITY_BUBBLE_COOLDOWN) {
      this.lastActivityBubble = bubble;
      this.lastActivityBubbleTime = now;
      this.sendBubble(bubble);
    }
  } catch (e) {
    // 静默失败
  }
}
```

Delete local methods:

```ts
private getActiveWindowTitle(): Promise<string>
private matchActivity(title: string): string | null
private async analyzeWithLLM(windowTitle: string): Promise<string | null>
```

- [ ] **Step 4: Update `ObserverManager` to pass service into `ContextCollector`**

Import:

```ts
import { WindowActivityService } from './window-activity-service';
```

Add constructor parameter at the end:

```ts
activityService: WindowActivityService
```

Change context collector initialization:

```ts
this.contextCollector = new ContextCollector(activityService);
```

- [ ] **Step 5: Update `main.ts` to create and share one service**

Add import:

```ts
import { WindowActivityService } from '../core/window-activity-service';
```

Add module variable:

```ts
let windowActivityService: WindowActivityService;
```

In `createWindow()`, before `BubbleManager` creation:

```ts
windowActivityService = new WindowActivityService();
bubbleManager = new BubbleManager(mainWindow, timeAwareness, stateManager, windowActivityService);
```

Pass to `ObserverManager` constructor as the last argument:

```ts
observerManager = new ObserverManager(
  mainWindow, aiService, chatManager.getEmotionUpdater().getEmotionSystem(),
  stateManager, chatManager.getMemory(), aiConfigManager,
  bubbleManager, proactiveReactionSystem, microBehaviorManager,
  windowActivityService
);
```

If Task 2 left `screenAnalyzer` in the Observer constructor, include it in the position expected by the current constructor, then append `windowActivityService` after `microBehaviorManager`.

- [ ] **Step 6: Build**

Run:

```bash
npm run build
```

Expected: `tsc` exits 0.

- [ ] **Step 7: Verify duplicate foreground-window code is gone**

Run:

```bash
git grep -n "GetForegroundWindow\|GetWindowText\|osascript -e 'tell application \"System Events\"" -- src/core
```

Expected: matches only in `src/core/window-activity-service.ts`.

- [ ] **Step 8: Commit**

Run:

```bash
git add src/core/window-activity-service.ts src/core/context-collector.ts src/core/bubble-manager.ts src/core/observer-manager.ts src/main/main.ts
git commit -m "refactor: centralize activity context detection"
```

---

## Task 4: Share the Main ScreenAnalyzer Instance with ChatManager

**Files:**
- Modify: `src/core/chat-manager.ts`
- Modify: `src/main/main.ts`
- Modify: `src/core/observer-manager.ts` only if it still accepts unused `ScreenAnalyzer`

**Interfaces:**
- Consumes: `ScreenAnalyzer` class from `src/core/screen-analyzer.ts`.
- Produces: `ChatManager` constructor signature with injected `screenAnalyzer: ScreenAnalyzer`.

- [ ] **Step 1: Inspect current constructor before editing**

Run:

```bash
git diff -- src/core/chat-manager.ts src/main/main.ts src/core/observer-manager.ts
git grep -n "new ChatManager\|new ScreenAnalyzer\|ScreenAnalyzer" -- src
```

Expected: `main.ts` creates `screenAnalyzer = new ScreenAnalyzer(aiConfigManager)`. `ChatManager` may still create another instance internally.

- [ ] **Step 2: Change `ChatManager` constructor to accept `screenAnalyzer`**

In `src/core/chat-manager.ts`, keep the import:

```ts
import { ScreenAnalyzer } from './screen-analyzer';
```

Change constructor signature from:

```ts
constructor(
  mainWindow: BrowserWindow,
  configManager: AIConfigManager,
  aiService: AIService,
  stateManager: StateManager,
  timeAwareness: TimeAwareness
) {
```

to:

```ts
constructor(
  mainWindow: BrowserWindow,
  configManager: AIConfigManager,
  aiService: AIService,
  stateManager: StateManager,
  timeAwareness: TimeAwareness,
  screenAnalyzer: ScreenAnalyzer
) {
```

Replace:

```ts
this.screenAnalyzer = new ScreenAnalyzer(configManager);
```

with:

```ts
this.screenAnalyzer = screenAnalyzer;
```

Do not remove chat-status or TTS fallback logic already present in the working tree.

- [ ] **Step 3: Update `main.ts` initialization order**

In `src/main/main.ts`, ensure `screenAnalyzer` is created before `chatManager`:

```ts
aiConfigManager = new AIConfigManager();
aiService = new AIService(aiConfigManager);
screenAnalyzer = new ScreenAnalyzer(aiConfigManager);
chatManager = new ChatManager(mainWindow, aiConfigManager, aiService, stateManager, timeAwareness, screenAnalyzer);
appearanceConfig = new AppearanceConfigManager();
ttsConfigManager = new TTSConfigManager();
ttsManager = new TTSManager(mainWindow, ttsConfigManager);
```

Remove any later duplicate line:

```ts
screenAnalyzer = new ScreenAnalyzer(aiConfigManager);
```

- [ ] **Step 4: Remove unused `ScreenAnalyzer` from ObserverManager if not needed**

If Task 2 removed all Observer Vision code, then `ObserverManager` should not import or accept `ScreenAnalyzer`.

Run:

```bash
git grep -n "screenAnalyzer\|ScreenAnalyzer" -- src/core/observer-manager.ts src/main/main.ts
```

Expected after cleanup:

- `src/main/main.ts` uses `ScreenAnalyzer` for global `screenAnalyzer`, `ChatManager`, and `test-screen-analysis` IPC.
- `src/core/observer-manager.ts` has no `ScreenAnalyzer` references unless a real active path remains.

- [ ] **Step 5: Build**

Run:

```bash
npm run build
```

Expected: `tsc` exits 0.

- [ ] **Step 6: Commit**

Run:

```bash
git add src/core/chat-manager.ts src/main/main.ts src/core/observer-manager.ts
git commit -m "refactor: share screen analyzer instance"
```

---

## Task 5: Update Project Architecture Documentation

**Files:**
- Modify: `PROJECT_INDEX.md`
- Modify: `docs/configuration-security.md`
- Modify: `GUIDE.md` if not already fully aligned by Task 1

**Interfaces:**
- Consumes: cleaned architecture from Tasks 1-4.
- Produces: docs that describe current main paths and do not point maintainers at removed legacy paths.

- [ ] **Step 1: Inspect actual tracked source files**

Run:

```bash
git ls-files src/core src/config | sort
```

Use this output to ensure docs list current important files and no removed files.

- [ ] **Step 2: Update `PROJECT_INDEX.md` config tree**

Ensure `src/config` section says:

```md
├── config/             # 配置文件
│   ├── states.json              # 状态定义
│   ├── proactive-reactions.json # 主动回应阈值/分类/模板配置
│   ├── micro-behaviors.json     # 微行为触发与动作配置
│   ├── *.example.json           # 可提交的安全配置示例
│   └── 本地真实配置              # AI/TTS/外观/聊天/记忆运行时生成，gitignore
```

Do not list `ai-config.json` or `chat-history.json` as source files.

- [ ] **Step 3: Update `PROJECT_INDEX.md` core module list**

Add or adjust core module descriptions to include:

```md
- `observer-manager.ts`：观察编排器，当前主动回应主入口。
- `context-collector.ts`：轻量上下文快照收集。
- `window-activity-service.ts`：前台窗口、进程名和活动分类识别。
- `proactive-reaction-system.ts`：主动回应候选判断与冷却记录。
- `micro-behavior-manager.ts`：主动候选触发的微行为执行。
- `bubble-manager.ts`：气泡发送、状态门禁、主动气泡短间隔控制。
- `screen-analyzer.ts`：唯一屏幕截图与 Vision 分析服务。
- `emotion-system.ts` / `emotion-updater.ts`：情绪状态与更新。
- `tts-manager.ts` / `tts-*.ts`：TTS 编排与各供应商实现。
```

If `PROJECT_INDEX.md` has a status count, make it match the actual state definitions in `src/config/states.json`.

- [ ] **Step 4: Update active proactive path description**

In `PROJECT_INDEX.md`, include this current path:

```md
当前主动回应主路径：`ObserverManager → ContextCollector → ProactiveReactionSystem → MicroBehaviorManager → BubbleManager.tryShowProactiveBubble`。
```

Do not describe deleted `ScreenshotTrigger` or old Observer Vision trigger methods as active.

- [ ] **Step 5: Verify docs do not mention removed active paths**

Run:

```bash
git grep -n "ScreenshotTrigger\|triggerWithVision\|triggerWithLLM\|checkStayTrigger\|checkSwitchTrigger\|src/config/ai-config.json.*源码\|src/config/chat-history.json.*源码" -- PROJECT_INDEX.md GUIDE.md docs
```

Expected: no matches that describe these as current active paths or tracked source files. Historical specs under `docs/superpowers/specs` may mention old risks; do not rewrite historical spec files unless they mislead current developer docs.

- [ ] **Step 6: Build and documentation sanity check**

Run:

```bash
npm run build
git diff --check
```

Expected: build exits 0; `git diff --check` reports no whitespace errors. CRLF warnings are acceptable on Windows.

- [ ] **Step 7: Commit**

Run:

```bash
git add PROJECT_INDEX.md docs/configuration-security.md GUIDE.md
git commit -m "docs: update project architecture index"
```

---

## Task 6: Final Verification and Review Preparation

**Files:**
- No planned source modifications unless verification exposes a bug.

**Interfaces:**
- Produces: verified branch state for final review.

- [ ] **Step 1: Run final build**

Run:

```bash
npm run build
```

Expected: `tsc` exits 0.

- [ ] **Step 2: Check test script status**

Run:

```bash
npm test
```

Expected for current project: likely fails with `Missing script: "test"`. If so, record exactly that. If a test script has been added by concurrent edits, run it and require pass.

- [ ] **Step 3: Run final sensitive-content scan**

Run:

```bash
python - <<'PY'
from pathlib import Path
import re
bad = []
for p in Path('.').rglob('*'):
    if '.git' in p.parts or 'node_modules' in p.parts or not p.is_file():
        continue
    try:
        text = p.read_text(encoding='utf-8')
    except Exception:
        continue
    for i, line in enumerate(text.splitlines(), 1):
        if re.search(r'sk-[A-Za-z0-9_-]+', line):
            bad.append((str(p), i, 'secret-token pattern'))
        if re.search(r'(apiKey|ApiKey|api_key)"?\s*[:=]\s*"[^"\s]{8,}"', line):
            if '.example.json' not in str(p):
                bad.append((str(p), i, 'non-empty api key'))
for item in bad:
    print(f'{item[0]}:{item[1]} {item[2]}')
raise SystemExit(1 if bad else 0)
PY
```

Expected: exit code 0 and no output.

- [ ] **Step 4: Verify tracked config boundary**

Run:

```bash
git ls-files src/config
```

Expected: no real runtime config files. Allowed output includes only examples and rule/default JSON.

- [ ] **Step 5: Verify old proactive symbols are absent**

Run:

```bash
git grep -n "checkStayTrigger\|checkSwitchTrigger\|triggerWithLLM\|triggerWithVision\|performAnalysis\|requestAnalysis\|parseAnalysisResult\|ScreenshotTrigger" -- src
```

Expected: no matches.

- [ ] **Step 6: Verify foreground-window code is centralized**

Run:

```bash
git grep -n "GetForegroundWindow\|GetWindowText\|osascript -e 'tell application \"System Events\"" -- src/core
```

Expected: matches only in `src/core/window-activity-service.ts`.

- [ ] **Step 7: Verify working tree and log**

Run:

```bash
git status --short
git log --oneline -10
```

Expected: working tree clean unless there are explicit user-owned edits intentionally left unstaged. Recent log should include the task commits from this plan.

- [ ] **Step 8: Request final code review**

Use the code review process on the full branch diff. If a review tool is available, run the project `code-review` skill at medium or high effort. Fix confirmed correctness bugs before reporting completion.

## Self-Review

Spec coverage:

- Runtime config and history boundary: Task 1 and Task 6.
- `.gitignore` / docs boundary: Task 1 and Task 5.
- Proactive response chain cleanup: Task 2 and Task 6.
- Activity context service: Task 3 and Task 6.
- ScreenAnalyzer ownership: Task 4.
- Documentation alignment: Task 5.
- Preserve behavior and verify build: every task includes `npm run build`; Task 6 finalizes.
- Existing uncommitted work caution: Global Constraints and relevant inspection steps.

Placeholder scan: no `TBD`, `TODO`, `implement later`, or unspecified edge-case instructions remain as implementation requirements. Existing code snippets may contain comments, but no plan step depends on unfinished placeholders.

Type consistency:

- `ActivityContext` properties match Task 3 usage.
- `WindowActivityService` methods match Task 3 constructor integrations.
- `ChatManager` constructor signature in Task 4 matches `main.ts` call update.
- `ObserverManager` constructor update in Task 2 and Task 3 must be applied cumulatively; Task 3 explicitly accounts for whether Task 2 removed `screenAnalyzer`.
