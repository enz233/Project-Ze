# Screen Target Pointer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the explicit `.`-triggered screen target pointer flow so Project-Ze can locate visible screen targets, move the pet beside them, and point with a visible pose and bubble guidance.

**Architecture:** Keep `ScreenAnalyzer` focused on screenshot and Vision calls, add `ScreenTargetPointer` as the orchestration layer, and wire it into `ChatManager` only for explicit `.` screen requests. `MoveController` continues to own movement; renderer owns visual sprite switching; ordinary chat natural-language auto-triggering remains out of scope.

**Tech Stack:** Electron 42, TypeScript 6, CommonJS, `desktopCapturer`, Electron `screen` display API, OpenAI-compatible Vision Chat Completions, existing `MoveController`, existing `BubbleOrchestrator`, renderer IIFE script, existing preload IPC bridge.

## Global Constraints

- First implementation only triggers from `.`-prefixed explicit screen analysis requests.
- Ordinary chat natural-language triggering is intentionally deferred.
- Do not add automatic clicking, automatic scrolling, automatic retry, or background screenshot monitoring.
- Use conservative keyword matching for trigger detection; LLM only locates the visible target.
- Require structured Vision output and validate `found`, `confidence`, and `point` before moving.
- Minimum confidence for movement is `0.72`.
- If the active window title changes during locating or moving, cancel and clearly ask the user to send the request again.
- A new screen analysis request cancels the previous target pointing session.
- User drag cancels target pointing.
- Target coordinates are mapped from screenshot pixels back to screen coordinates using capture frame metadata.
- Pet position is computed by aligning a pointer pose's `pointerOffset` with the target point.
- First version may use `point-*` sprites when present and fall back to existing `dragged_*` sprites when not present.
- Each implementation task must update docs or leave a follow-up docs task; each task ends with `npm run build` and a git commit.

---

## File Structure

- Modify: `src/core/screen-analyzer.ts`
  - Add screenshot frame metadata and structured target locating while preserving existing `analyze(userMessage)` behavior.
- Create: `src/core/screen-target-pointer.ts`
  - New orchestration module for trigger matching, locating, stability checks, pointer pose selection, movement, point visual, and bubble text.
- Modify: `src/core/chat-manager.ts`
  - Add optional `ScreenTargetPointer` dependency and route explicit `.` target requests before ordinary screen analysis.
- Modify: `src/main/main.ts`
  - Instantiate `ScreenTargetPointer`, wire it to `ChatManager`, and cancel it on drag start.
- Modify: `src/main/preload.ts`
  - Add `onPointVisual` IPC bridge for renderer point-pose events.
- Modify: `src/renderer/renderer.ts`
  - Add point visual state, `point-visual` listener, point sprite fallback, and state restoration.
- Modify: `PROJECT_INDEX.md`
  - Document `screen-target-pointer.ts`, the new explicit pointer flow, and `point-visual` IPC.
- Modify: `VERSION.md`
  - Add Unreleased entry for the design/plan and implemented pointer flow.
- Inspect: `docs/superpowers/specs/2026-07-15-screen-target-pointer-design.md`
  - Source of truth for scope and non-goals.

---

### Task 1: Extend ScreenAnalyzer with capture frames and structured target locating

**Files:**
- Modify: `src/core/screen-analyzer.ts`

**Interfaces:**
- Produces: `ScreenCaptureFrame`
- Produces: `ScreenTargetLocateResult`
- Produces: `ScreenAnalyzer.captureScreenFrame(): Promise<ScreenCaptureFrame | null>`
- Produces: `ScreenAnalyzer.locateTarget(userMessage: string): Promise<ScreenTargetLocateResult>`
- Preserves: `ScreenAnalyzer.analyze(userMessage: string): Promise<string>`

- [ ] **Step 1: Replace `src/core/screen-analyzer.ts` with this implementation**

```ts
import { desktopCapturer, screen } from 'electron';
import { AIConfigManager } from './ai-config';

export interface ScreenCaptureFrame {
  imageDataUri: string;
  origin: { x: number; y: number };
  screenSize: { width: number; height: number };
  imageSize: { width: number; height: number };
}

export interface ScreenTargetLocateResult {
  found: boolean;
  label: string;
  confidence: number;
  point?: { x: number; y: number };
  reason?: string;
}

export interface ScreenTargetLocateResponse {
  result: ScreenTargetLocateResult;
  frame: ScreenCaptureFrame;
}

export class ScreenAnalyzer {
  private configManager: AIConfigManager;

  constructor(configManager: AIConfigManager) {
    this.configManager = configManager;
  }

  /** 截屏并分析 */
  async analyze(userMessage: string): Promise<string> {
    const config = this.configManager.get();

    if (!config.visionApiKey || !config.visionBaseURL || !config.visionModel) {
      return '（屏幕分析未配置，请在设置中配置 Vision API）';
    }

    const frame = await this.captureScreenFrame();
    if (!frame) {
      return '（截屏失败）';
    }

    try {
      const response = await this.callVisionAPI(frame.imageDataUri, userMessage, config);
      return response;
    } catch (error: any) {
      console.error('[ScreenAnalyzer] Vision API 调用失败:', error.message);
      return '（屏幕分析失败: ' + error.message + '）';
    }
  }

  /** 截取屏幕，返回 base64 data URI。保留旧接口给现有调用方。 */
  async captureScreen(): Promise<string | null> {
    const frame = await this.captureScreenFrame();
    return frame?.imageDataUri ?? null;
  }

  /** 截取主屏幕并返回坐标映射所需元信息 */
  async captureScreenFrame(): Promise<ScreenCaptureFrame | null> {
    try {
      const primaryDisplay = screen.getPrimaryDisplay();
      const sources = await desktopCapturer.getSources({
        types: ['screen'],
        thumbnailSize: { width: 1280, height: 720 },
      });

      if (sources.length === 0) return null;

      const source = sources[0];
      const resized = source.thumbnail.resize({ width: 1280, height: 720 });
      const imageSize = resized.getSize();
      const base64 = resized.toPNG().toString('base64');

      return {
        imageDataUri: `data:image/png;base64,${base64}`,
        origin: { x: primaryDisplay.bounds.x, y: primaryDisplay.bounds.y },
        screenSize: { width: primaryDisplay.bounds.width, height: primaryDisplay.bounds.height },
        imageSize: { width: imageSize.width, height: imageSize.height },
      };
    } catch (error: any) {
      console.error('[ScreenAnalyzer] 截屏失败:', error.message);
      return null;
    }
  }

  /** 截屏并让 Vision 模型定位用户描述的当前可见目标 */
  async locateTarget(userMessage: string): Promise<ScreenTargetLocateResponse> {
    const config = this.configManager.get();
    if (!config.visionApiKey || !config.visionBaseURL || !config.visionModel) {
      throw new Error('屏幕分析未配置，请在设置中配置 Vision API');
    }

    const frame = await this.captureScreenFrame();
    if (!frame) {
      throw new Error('截屏失败');
    }

    const response = await this.callVisionAPI(
      frame.imageDataUri,
      this.buildLocatePrompt(userMessage, frame),
      {
        ...config,
        visionSystemPrompt: '你是屏幕目标定位助手，只能输出 JSON，不要输出 Markdown。',
      }
    );

    return {
      result: this.parseLocateResult(response, frame),
      frame,
    };
  }

  mapPointToScreen(frame: ScreenCaptureFrame, point: { x: number; y: number }): { x: number; y: number } {
    const scaleX = frame.screenSize.width / frame.imageSize.width;
    const scaleY = frame.screenSize.height / frame.imageSize.height;
    return {
      x: Math.round(frame.origin.x + point.x * scaleX),
      y: Math.round(frame.origin.y + point.y * scaleY),
    };
  }

  private buildLocatePrompt(userMessage: string, frame: ScreenCaptureFrame): string {
    return [
      '用户希望你在当前截图中定位一个可见的屏幕目标。',
      `用户请求：${userMessage}`,
      `截图像素尺寸：${frame.imageSize.width}x${frame.imageSize.height}`,
      '坐标规则：point 必须是截图左上角为 (0,0) 的像素坐标，x 向右增大，y 向下增大。',
      '只定位当前截图中清晰可见的按钮、链接、文字入口或明显 UI 区域。',
      '如果目标不可见、候选过多、或你不确定，请返回 found=false 或 confidence 低于 0.72。',
      '只输出一个 JSON 对象，格式必须是：',
      '{"found":true,"label":"目标名称","confidence":0.82,"point":{"x":100,"y":200},"reason":"为什么认为这里是目标"}',
      '如果找不到，输出：',
      '{"found":false,"label":"目标名称","confidence":0,"reason":"当前截图里没看到目标"}',
      '不要输出解释文字，不要使用 Markdown 代码块。',
    ].join('\n');
  }

  private parseLocateResult(raw: string, frame: ScreenCaptureFrame): ScreenTargetLocateResult {
    const fallback: ScreenTargetLocateResult = {
      found: false,
      label: '',
      confidence: 0,
      reason: 'Vision 未返回可解析的定位结果',
    };

    try {
      const match = raw.match(/\{[\s\S]*\}/);
      if (!match) return fallback;
      const parsed = JSON.parse(match[0]) as any;
      const confidence = typeof parsed.confidence === 'number' && Number.isFinite(parsed.confidence)
        ? Math.max(0, Math.min(1, parsed.confidence))
        : 0;
      const label = typeof parsed.label === 'string' ? parsed.label.trim() : '';
      const reason = typeof parsed.reason === 'string' ? parsed.reason.trim() : '';
      const point = this.parsePoint(parsed.point, frame);

      return {
        found: parsed.found === true && !!point,
        label,
        confidence,
        point,
        reason,
      };
    } catch (error: any) {
      console.error('[ScreenAnalyzer] 定位 JSON 解析失败:', error.message, raw);
      return fallback;
    }
  }

  private parsePoint(value: any, frame: ScreenCaptureFrame): { x: number; y: number } | undefined {
    if (!value || typeof value !== 'object') return undefined;
    const x = Number(value.x);
    const y = Number(value.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return undefined;
    if (x < 0 || y < 0 || x > frame.imageSize.width || y > frame.imageSize.height) return undefined;
    return { x: Math.round(x), y: Math.round(y) };
  }

  /** 调用 Vision API（OpenAI 兼容格式） */
  private async callVisionAPI(
    imageDataUri: string,
    userMessage: string,
    config: any
  ): Promise<string> {
    const messages = [
      {
        role: 'system',
        content: config.visionSystemPrompt || '你是一个桌面助手，简短描述用户屏幕上的内容。',
      },
      {
        role: 'user',
        content: [
          { type: 'text', text: userMessage || '描述一下屏幕上有什么' },
          {
            type: 'image_url',
            image_url: {
              url: imageDataUri,
              detail: 'low',
            },
          },
        ],
      },
    ];

    const response = await fetch(`${config.visionBaseURL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.visionApiKey}`,
      },
      body: JSON.stringify({
        model: config.visionModel,
        messages,
        max_tokens: 1000,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`API 请求失败 (${response.status}): ${error}`);
    }

    const data = await response.json() as any;
    return data.choices?.[0]?.message?.content ?? '（无响应）';
  }
}
```

- [ ] **Step 2: Build**

Run: `npm run build`

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/core/screen-analyzer.ts
git commit -m "feat: add structured screen target locating"
```

---

### Task 2: Create ScreenTargetPointer orchestration module

**Files:**
- Create: `src/core/screen-target-pointer.ts`

**Interfaces:**
- Consumes: `ScreenAnalyzer.locateTarget(userMessage)`
- Consumes: `ScreenAnalyzer.mapPointToScreen(frame, point)`
- Consumes: `MoveController.moveTo(request)` and `MoveController.cancel(reason)`
- Consumes: `BubbleOrchestrator.show(request)`
- Consumes: `WindowActivityService.getActiveWindowTitle()`
- Produces: `ScreenTargetPointer.isPointerRequest(message: string): boolean`
- Produces: `ScreenTargetPointer.handle(message: string): Promise<ScreenTargetPointerResult>`
- Produces: `ScreenTargetPointer.cancel(reason?: ScreenTargetPointerCancelReason): void`

- [ ] **Step 1: Create `src/core/screen-target-pointer.ts`**

```ts
import { BrowserWindow } from 'electron';
import { BubbleOrchestrator } from './bubble-orchestrator';
import { MoveController } from './move-controller';
import { ScreenAnalyzer, ScreenTargetLocateResult } from './screen-analyzer';
import { WindowActivityService } from './window-activity-service';

export type PointerPose = 'point-right' | 'point-left' | 'point-up' | 'point-down';
export type ScreenPointingSessionState = 'capturing' | 'locating' | 'moving' | 'pointing' | 'cancelled' | 'done';
export type ScreenTargetPointerCancelReason = 'new-request' | 'screen-changed' | 'drag-start' | 'manual';

export interface PointerPoseConfig {
  pose: PointerPose;
  pointerOffset: { x: number; y: number };
}

export interface PointVisualEvent {
  active: boolean;
  pose?: PointerPose;
  reason?: string;
}

export interface ScreenTargetPointerResult {
  handled: boolean;
  moved: boolean;
  message: string;
  locateResult?: ScreenTargetLocateResult;
  cancelReason?: ScreenTargetPointerCancelReason;
}

interface ScreenTargetPointerOptions {
  mainWindow: BrowserWindow;
  screenAnalyzer: ScreenAnalyzer;
  moveController: MoveController;
  bubbleOrchestrator: BubbleOrchestrator;
  windowActivityService: WindowActivityService;
}

const POINTER_KEYWORDS = [
  '指出',
  '指给我',
  '在哪',
  '在哪里',
  '帮我找',
  '找一下',
  '哪个按钮',
  '下载在哪',
  '怎么点',
  '指一下',
  '位置',
];

const CONFIDENCE_THRESHOLD = 0.72;
const POINT_HOLD_MS = 5000;
const DEFAULT_POSES: Record<PointerPose, PointerPoseConfig> = {
  'point-right': { pose: 'point-right', pointerOffset: { x: 220, y: 135 } },
  'point-left': { pose: 'point-left', pointerOffset: { x: 30, y: 135 } },
  'point-up': { pose: 'point-up', pointerOffset: { x: 125, y: 35 } },
  'point-down': { pose: 'point-down', pointerOffset: { x: 125, y: 235 } },
};

export class ScreenTargetPointer {
  private mainWindow: BrowserWindow;
  private screenAnalyzer: ScreenAnalyzer;
  private moveController: MoveController;
  private bubbleOrchestrator: BubbleOrchestrator;
  private windowActivityService: WindowActivityService;
  private sessionId = 0;
  private state: ScreenPointingSessionState = 'done';
  private holdTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(options: ScreenTargetPointerOptions) {
    this.mainWindow = options.mainWindow;
    this.screenAnalyzer = options.screenAnalyzer;
    this.moveController = options.moveController;
    this.bubbleOrchestrator = options.bubbleOrchestrator;
    this.windowActivityService = options.windowActivityService;
  }

  isPointerRequest(message: string): boolean {
    const normalized = message.trim().toLowerCase();
    if (!normalized) return false;
    return POINTER_KEYWORDS.some(keyword => normalized.includes(keyword.toLowerCase()));
  }

  async handle(message: string): Promise<ScreenTargetPointerResult> {
    if (!this.isPointerRequest(message)) {
      return { handled: false, moved: false, message: '' };
    }

    const id = this.startSession();
    const beforeTitle = await this.windowActivityService.getActiveWindowTitle();
    this.showBubble('我看看哦，先别动屏幕~');

    try {
      this.state = 'locating';
      const located = await this.screenAnalyzer.locateTarget(message);
      if (!this.isCurrent(id)) {
        return this.cancelledResult('new-request');
      }

      const afterLocateTitle = await this.windowActivityService.getActiveWindowTitle();
      if (this.hasScreenChanged(beforeTitle, afterLocateTitle)) {
        return this.cancelWithMessage('screen-changed');
      }

      const result = located.result;
      if (!this.canMove(result)) {
        const failureMessage = this.failureMessage(message, result);
        this.showBubble(failureMessage);
        this.finishSession();
        return { handled: true, moved: false, message: failureMessage, locateResult: result };
      }

      const screenPoint = this.screenAnalyzer.mapPointToScreen(located.frame, result.point!);
      const pose = this.choosePose(screenPoint);
      const moveTopLeft = {
        x: screenPoint.x - pose.pointerOffset.x,
        y: screenPoint.y - pose.pointerOffset.y,
      };

      this.state = 'moving';
      const moveResult = await this.moveController.moveTo({
        x: moveTopLeft.x,
        y: moveTopLeft.y,
        anchor: 'top-left',
        reason: 'screen-target-pointer',
        speedPxPerSec: 520,
      });

      if (!this.isCurrent(id)) {
        return this.cancelledResult('new-request');
      }

      const afterMoveTitle = await this.windowActivityService.getActiveWindowTitle();
      if (this.hasScreenChanged(beforeTitle, afterMoveTitle)) {
        return this.cancelWithMessage('screen-changed');
      }

      if (moveResult.cancelled) {
        const messageText = '好啦好啦，我不挡你~';
        this.clearPointVisual();
        this.finishSession();
        this.showBubble(messageText);
        return { handled: true, moved: false, message: messageText, locateResult: result, cancelReason: 'manual' };
      }

      this.state = 'pointing';
      this.sendPointVisual({ active: true, pose: pose.pose, reason: 'screen-target-pointer' });
      const successMessage = this.successMessage(result);
      this.showBubble(successMessage);
      this.schedulePointClear(id);
      return { handled: true, moved: true, message: successMessage, locateResult: result };
    } catch (error: any) {
      const messageText = '我没太看清楚。你把页面停在目标附近，再让我看一次吧。';
      console.error('[ScreenTargetPointer] 指示失败:', error?.message || error);
      this.clearPointVisual();
      this.finishSession();
      this.showBubble(messageText);
      return { handled: true, moved: false, message: messageText };
    }
  }

  cancel(reason: ScreenTargetPointerCancelReason = 'manual'): void {
    if (this.state === 'done' || this.state === 'cancelled') return;
    this.sessionId++;
    this.state = 'cancelled';
    this.moveController.cancel('manual');
    this.clearPointVisual();
    this.clearHoldTimer();
    if (reason === 'screen-changed') {
      this.showBubble(this.screenChangedMessage());
    } else if (reason === 'drag-start') {
      this.showBubble('好啦好啦，我不挡你~');
    }
  }

  private startSession(): number {
    this.cancel('new-request');
    this.sessionId++;
    this.state = 'capturing';
    return this.sessionId;
  }

  private finishSession(): void {
    this.state = 'done';
    this.clearHoldTimer();
  }

  private isCurrent(id: number): boolean {
    return id === this.sessionId && this.state !== 'cancelled';
  }

  private canMove(result: ScreenTargetLocateResult): boolean {
    return result.found === true && !!result.point && result.confidence >= CONFIDENCE_THRESHOLD;
  }

  private choosePose(screenPoint: { x: number; y: number }): PointerPoseConfig {
    const bounds = this.mainWindow.getBounds();
    const windowCenterX = bounds.x + bounds.width / 2;
    const windowCenterY = bounds.y + bounds.height / 2;
    const dx = screenPoint.x - windowCenterX;
    const dy = screenPoint.y - windowCenterY;

    if (Math.abs(dx) >= Math.abs(dy)) {
      return dx >= 0 ? DEFAULT_POSES['point-right'] : DEFAULT_POSES['point-left'];
    }
    return dy >= 0 ? DEFAULT_POSES['point-down'] : DEFAULT_POSES['point-up'];
  }

  private hasScreenChanged(beforeTitle: string, afterTitle: string): boolean {
    if (!beforeTitle || !afterTitle) return false;
    return beforeTitle !== afterTitle;
  }

  private successMessage(result: ScreenTargetLocateResult): string {
    const label = result.label || '目标';
    if (result.confidence >= 0.9) return `这里是「${label}」。`;
    return `我觉得是这里，你看看是不是「${label}」。`;
  }

  private failureMessage(message: string, result: ScreenTargetLocateResult): string {
    const label = result.label || this.extractTargetHint(message);
    if (result.found && result.confidence > 0 && result.confidence < CONFIDENCE_THRESHOLD) {
      return `我看到了可能的位置，但不太确定是不是「${label}」。你可以说得更具体一点。`;
    }
    return `我没太看清楚「${label}」在哪里。你可以把页面停在目标附近，再让我看一次。`;
  }

  private extractTargetHint(message: string): string {
    return message
      .replace(/[。！？!?.]/g, '')
      .replace(/帮我/g, '')
      .replace(/请/g, '')
      .replace(/指出/g, '')
      .replace(/指一下/g, '')
      .replace(/在哪里/g, '')
      .replace(/在哪/g, '')
      .trim()
      .slice(0, 20) || '目标';
  }

  private cancelWithMessage(reason: ScreenTargetPointerCancelReason): ScreenTargetPointerResult {
    this.cancel(reason);
    return { handled: true, moved: false, message: this.screenChangedMessage(), cancelReason: reason };
  }

  private cancelledResult(reason: ScreenTargetPointerCancelReason): ScreenTargetPointerResult {
    return { handled: true, moved: false, message: '', cancelReason: reason };
  }

  private screenChangedMessage(): string {
    return '屏幕变了，我刚才看到的位置可能不准啦。你重新发一次「.帮我指出xxx」吧。';
  }

  private showBubble(text: string): void {
    this.bubbleOrchestrator.show({ text, source: 'system', priority: 'high' });
  }

  private sendPointVisual(event: PointVisualEvent): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('point-visual', event);
    }
  }

  private clearPointVisual(): void {
    this.sendPointVisual({ active: false, reason: 'screen-target-pointer' });
  }

  private schedulePointClear(id: number): void {
    this.clearHoldTimer();
    this.holdTimer = setTimeout(() => {
      if (!this.isCurrent(id)) return;
      this.clearPointVisual();
      this.finishSession();
    }, POINT_HOLD_MS);
  }

  private clearHoldTimer(): void {
    if (this.holdTimer) {
      clearTimeout(this.holdTimer);
      this.holdTimer = null;
    }
  }
}
```

- [ ] **Step 2: Build**

Run: `npm run build`

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/core/screen-target-pointer.ts
git commit -m "feat: add screen target pointer orchestrator"
```

---

### Task 3: Route explicit dot-screen pointer requests through ChatManager and main

**Files:**
- Modify: `src/core/chat-manager.ts`
- Modify: `src/main/main.ts`

**Interfaces:**
- Consumes: `ScreenTargetPointer.isPointerRequest(message)` and `ScreenTargetPointer.handle(message)`
- Produces: `ChatManager.setScreenTargetPointer(pointer: ScreenTargetPointer): void`
- Produces: main-process global `screenTargetPointer`

- [ ] **Step 1: Import `ScreenTargetPointer` in `src/core/chat-manager.ts`**

Add near the existing imports:

```ts
import { ScreenTargetPointer } from './screen-target-pointer';
```

- [ ] **Step 2: Add ChatManager field**

After:

```ts
  private ttsManager: TTSManager | null = null;
```

add:

```ts
  private screenTargetPointer: ScreenTargetPointer | null = null;
```

- [ ] **Step 3: Add setter method**

Add this method near `setTTSManager` or before `sendMessage`:

```ts
  setScreenTargetPointer(pointer: ScreenTargetPointer): void {
    this.screenTargetPointer = pointer;
  }
```

- [ ] **Step 4: Route `.` pointer requests before normal screen analysis**

Replace the existing `.` block in `sendMessage`:

```ts
      // 检查是否为屏幕分析请求（"." 开头）
      if (userMessage.startsWith('.')) {
        const screenMessage = userMessage.slice(1).trim() || '描述一下屏幕上有什么';
        this.sendBubble('正在看屏幕...');
        this.sendChatStatus('screen', '正在看屏幕...');
        const screenResult = await this.screenAnalyzer.analyze(screenMessage);
        this.sendBubble(screenResult);
        this.memory.addMessage('user', userMessage);
        this.memory.addMessage('assistant', screenResult);
        this.memory.recordInteraction('screen-analysis', screenMessage, this.stateManager.getCurrentState());
        return;
      }
```

with:

```ts
      // 检查是否为屏幕分析请求（"." 开头）
      if (userMessage.startsWith('.')) {
        const screenMessage = userMessage.slice(1).trim() || '描述一下屏幕上有什么';
        this.sendChatStatus('screen', '正在看屏幕...');

        if (this.screenTargetPointer?.isPointerRequest(screenMessage)) {
          const pointerResult = await this.screenTargetPointer.handle(screenMessage);
          const assistantMessage = pointerResult.message || '屏幕指示请求已取消';
          this.memory.addMessage('user', userMessage);
          this.memory.addMessage('assistant', assistantMessage);
          this.memory.recordInteraction('screen-target-pointer', screenMessage, this.stateManager.getCurrentState());
          return;
        }

        this.sendBubble('正在看屏幕...');
        const screenResult = await this.screenAnalyzer.analyze(screenMessage);
        this.sendBubble(screenResult);
        this.memory.addMessage('user', userMessage);
        this.memory.addMessage('assistant', screenResult);
        this.memory.recordInteraction('screen-analysis', screenMessage, this.stateManager.getCurrentState());
        return;
      }
```

- [ ] **Step 5: Import `ScreenTargetPointer` in `src/main/main.ts`**

Add after the `MoveController` import:

```ts
import { ScreenTargetPointer } from '../core/screen-target-pointer';
```

- [ ] **Step 6: Add main-process global variable**

After:

```ts
let moveController: MoveController;
```

add:

```ts
let screenTargetPointer: ScreenTargetPointer;
```

- [ ] **Step 7: Instantiate and inject ScreenTargetPointer**

After `moveController = new MoveController(...)` in `createWindow()`, add:

```ts
  screenTargetPointer = new ScreenTargetPointer({
    mainWindow,
    screenAnalyzer,
    moveController,
    bubbleOrchestrator,
    windowActivityService,
  });
  chatManager.setScreenTargetPointer(screenTargetPointer);
```

- [ ] **Step 8: Cancel ScreenTargetPointer on drag start**

In `ipcMain.on('drag-start', ...)`, immediately after:

```ts
    moveController?.cancel('drag-start');
```

add:

```ts
    screenTargetPointer?.cancel('drag-start');
```

- [ ] **Step 9: Build**

Run: `npm run build`

Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add src/core/chat-manager.ts src/main/main.ts
git commit -m "feat: route screen pointer requests"
```

---

### Task 4: Add renderer point visual support with sprite fallback

**Files:**
- Modify: `src/main/preload.ts`
- Modify: `src/renderer/renderer.ts`

**Interfaces:**
- Consumes: main-process IPC `point-visual` with `{ active: boolean; pose?: 'point-right' | 'point-left' | 'point-up' | 'point-down'; reason?: string }`
- Produces: preload `onPointVisual(callback)`
- Produces: renderer point visual mode, `point-*` sprite support, and fallback to existing `dragged_*` sprites

- [ ] **Step 1: Add preload listener**

In `src/main/preload.ts`, inside `contextBridge.exposeInMainWorld('companion', { ... })`, after `onMoveVisual`, add:

```ts
  onPointVisual: (callback: (payload: any) => void) => {
    ipcRenderer.on('point-visual', (_event, payload) => callback(payload));
  },
```

- [ ] **Step 2: Add renderer point visual state**

In `src/renderer/renderer.ts`, after:

```ts
  var currentMoveDirection: string | null = null;
```

add:

```ts
  var isPointVisualActive = false;
  var currentPointPose: string | null = null;
```

- [ ] **Step 3: Register point visual listener**

In `setupStateListeners()`, after the `onMoveVisual` registration, add:

```ts
    // 主进程发来的目标指示视觉
    // @ts-ignore
    window.companion.onPointVisual(function (payload: any) {
      updatePointVisual(payload);
    });
```

- [ ] **Step 4: Add `updatePointVisual` and fallback helpers**

Add this code immediately after `updateMoveVisual(payload: any): void`:

```ts
  function updatePointVisual(payload: any): void {
    if (!payload || !payload.active) {
      if (!isPointVisualActive) return;
      isPointVisualActive = false;
      currentPointPose = null;
      lastVisualState = '';
      updateVisual(currentState, null);
      return;
    }

    if (isDragVisualActive) return;

    var pose = payload.pose || 'point-right';
    if (pose !== 'point-right' && pose !== 'point-left' && pose !== 'point-up' && pose !== 'point-down') {
      pose = 'point-right';
    }

    isPointVisualActive = true;
    companionEl.className = 'dragged';

    if (pose !== currentPointPose) {
      currentPointPose = pose;
      setSpriteWithFallback(pose, fallbackSpriteForPose(pose));
    }
  }

  function fallbackSpriteForPose(pose: string): string {
    if (pose === 'point-left') return 'dragged_left';
    if (pose === 'point-up') return 'dragged_up';
    if (pose === 'point-down') return 'dragged_down';
    return 'dragged_right';
  }

  function setSpriteWithFallback(name: string, fallback: string): void {
    if (!SPRITE_DIR) return;
    spriteEl.onerror = function () {
      spriteEl.onerror = null;
      setSprite(fallback);
    };
    setSprite(name);
  }
```

- [ ] **Step 5: Prevent normal state updates from overriding point visual**

In `updateVisual`, after the existing move visual guard:

```ts
    // 自动移动期间不覆盖移动方向差分
    if (isMoveVisualActive) return;
```

add:

```ts
    // 目标指示期间不覆盖指向差分
    if (isPointVisualActive) return;
```

- [ ] **Step 6: Add point sprite folder mapping**

In `setSprite(name: string)`, after:

```ts
    else if (name.indexOf('dragged') === 0) folder = 'basic/dragged';
```

add:

```ts
    else if (name.indexOf('point') === 0) folder = 'basic/point';
```

This lets future files such as `src/assets/sprites/basic/point/point-right.png` work without additional renderer changes. If the files do not exist, `setSpriteWithFallback()` uses existing dragged sprites.

- [ ] **Step 7: Build**

Run: `npm run build`

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/main/preload.ts src/renderer/renderer.ts
git commit -m "feat: add screen pointer visual mode"
```

---

### Task 5: Add screen stability cancellation for new screen requests and explicit drag interruption

**Files:**
- Modify: `src/core/chat-manager.ts`
- Modify: `src/core/screen-target-pointer.ts`

**Interfaces:**
- Consumes: `ScreenTargetPointer.cancel(reason)` from Task 2
- Produces: every new `.` screen request cancels a previous pointing session before handling
- Produces: explicit `screen-changed` user-facing copy remains unchanged

- [ ] **Step 1: Add new request cancellation before every dot-screen path**

In `src/core/chat-manager.ts`, inside the `if (userMessage.startsWith('.'))` block, immediately after:

```ts
        const screenMessage = userMessage.slice(1).trim() || '描述一下屏幕上有什么';
```

add:

```ts
        this.screenTargetPointer?.cancel('new-request');
```

This ensures ordinary `.总结这个页面` requests also clear any previous pointing pose.

- [ ] **Step 2: Prevent `new-request` cancellation from showing a bubble**

In `src/core/screen-target-pointer.ts`, ensure `cancel()` only shows bubbles for `screen-changed` and `drag-start`. The method body must be exactly:

```ts
  cancel(reason: ScreenTargetPointerCancelReason = 'manual'): void {
    if (this.state === 'done' || this.state === 'cancelled') return;
    this.sessionId++;
    this.state = 'cancelled';
    this.moveController.cancel('manual');
    this.clearPointVisual();
    this.clearHoldTimer();
    if (reason === 'screen-changed') {
      this.showBubble(this.screenChangedMessage());
    } else if (reason === 'drag-start') {
      this.showBubble('好啦好啦，我不挡你~');
    }
  }
```

- [ ] **Step 3: Build**

Run: `npm run build`

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/core/chat-manager.ts src/core/screen-target-pointer.ts
git commit -m "fix: cancel stale screen pointer sessions"
```

---

### Task 6: Update project documentation and final verification

**Files:**
- Modify: `PROJECT_INDEX.md`
- Modify: `VERSION.md`
- Inspect: `docs/superpowers/specs/2026-07-15-screen-target-pointer-design.md`
- Inspect: `docs/superpowers/plans/2026-07-15-screen-target-pointer.md`

**Interfaces:**
- Consumes: all prior tasks.
- Produces: documentation that makes the new module discoverable without reading all source files.

- [ ] **Step 1: Update `PROJECT_INDEX.md` core module quick reference**

After the `screen-analyzer.ts` bullet, add:

```md
- `screen-target-pointer.ts`：屏幕目标指示编排器，仅处理 `.` 显式屏幕分析中的“指出/在哪/帮我找”等请求，负责 Vision 定位结果校验、截图坐标映射、指向锚点换算、移动调用、屏幕变化取消和指向气泡。
```

- [ ] **Step 2: Update `PROJECT_INDEX.md` AI 系统 section**

After the existing screen analysis mention or inside `### AI 系统`, add:

```md
- **屏幕目标指示**：`.` 屏幕分析入口中命中明确“指出/在哪/帮我找”等关键词时，`ChatManager` 委托 `ScreenTargetPointer` 调用 Vision 结构化定位；置信度足够时通过 `MoveController` 把桌宠移动到目标旁边，并发送 `point-visual` 指向差分。普通聊天自然语言自动触发暂缓，避免隐私和误触发问题。
```

- [ ] **Step 3: Update `PROJECT_INDEX.md` IPC section**

In `主 → 渲染` IPC table, after `move-visual`, add:

```md
| point-visual | {active, pose?, reason?} | 屏幕目标指示期间的 point-* 指向差分，资源缺失时 renderer 回退到 dragged 方向差分 |
```

- [ ] **Step 4: Update `VERSION.md` Unreleased section**

Under `## Unreleased`, add:

```md
- 屏幕目标指示系统：规划并实现 `.` 显式屏幕分析中的目标定位与指向流程，普通聊天自然语言自动触发暂缓
```

- [ ] **Step 5: Run final build**

Run: `npm run build`

Expected: PASS.

- [ ] **Step 6: Inspect working tree**

Run: `git status --short`

Expected: only `PROJECT_INDEX.md` and `VERSION.md` are modified before the docs commit.

- [ ] **Step 7: Commit documentation**

```bash
git add PROJECT_INDEX.md VERSION.md
git commit -m "docs: document screen target pointer system"
```

---

## Manual Verification Checklist

Run these checks after all tasks are complete:

- [ ] Start the app with `npm start`.
- [ ] Send `.总结这个页面` and verify it still performs ordinary screen analysis with no movement.
- [ ] Send `.帮我指出下载按钮在哪` on a page with a visible download button.
- [ ] Verify the pet says `我看看哦，先别动屏幕~`.
- [ ] Verify high-confidence Vision output moves the pet near the target.
- [ ] Verify `point-*` visual appears, or fallback `dragged_*` visual appears if point assets are absent.
- [ ] Move or switch the active window during a pointing request and verify the bubble says `屏幕变了，我刚才看到的位置可能不准啦。你重新发一次「.帮我指出xxx」吧。`.
- [ ] Drag the pet during movement and verify pointing cancels with `好啦好啦，我不挡你~`.
- [ ] Send a vague pointer request on a page with multiple similar targets and verify it does not move when confidence is low.
- [ ] Run `npm run build` one final time.

---

## Self-Review

- Spec coverage: Task 1 covers structured Vision locating and screenshot coordinate metadata. Task 2 covers orchestration, confidence threshold, pointer offset, movement, active window stability checks, and bubbles. Task 3 covers explicit `.` routing and drag cancellation. Task 4 covers point visual and fallback sprites. Task 5 covers new request cancellation. Task 6 covers docs and final verification. Ordinary chat natural-language trigger is explicitly not implemented.
- Placeholder scan: No TBD/TODO/fill-in placeholders remain; every file change includes exact code or exact markdown content.
- Type consistency: `ScreenTargetLocateResult`, `ScreenTargetLocateResponse`, `ScreenCaptureFrame`, `ScreenTargetPointer`, `PointerPose`, `PointVisualEvent`, and `ScreenTargetPointerResult` names match across tasks.
