# Settings Move Debug Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在设置页新增临时 Move 测试区块，允许输入坐标并调用 `moveTo` / `teleportTo` 验证移动效果。

**Architecture:** 只修改设置窗口 HTML/内联脚本和项目文档。设置页收集 `x` / `y` / `anchor`，通过现有 preload API 调用主进程 move 能力；MoveController 继续负责 anchor、clamp、动画和取消规则。

**Tech Stack:** Electron 42、TypeScript 6、`src/main/settings.html` 内联 HTML/CSS/JS、现有 preload `window.companion.moveTo` / `teleportTo`。

## Global Constraints

- 这是临时 Debug 入口，标题必须标注“临时”或“Debug”。
- 不保存 move 测试输入，不新增配置字段。
- 不改变 move 模块行为。
- 不触碰当前无关未提交改动：`src/core/screen-analyzer.ts`、`src/core/screen-target-pointer.ts`、`docs/superpowers/plans/2026-07-15-asr-provider-presets.md`。
- 完成后运行 `npm run build`。
- 完成后更新 `PROJECT_INDEX.md` 和 `VERSION.md`，并提交 git。

---

## File Structure

- Modify: `src/main/settings.html`
  - 在“其他”tab 中新增 Move 测试（临时）区块。
  - 新增 `runMoveDebugTest(mode)` 脚本并绑定按钮。
- Modify: `PROJECT_INDEX.md`
  - 在设置窗口说明中记录临时 move debug panel。
- Modify: `VERSION.md`
  - 在 Unreleased 记录设置页新增临时 move 测试入口。

---

### Task 1: Add temporary Move test panel to settings

**Files:**
- Modify: `src/main/settings.html`

**Interfaces:**
- Consumes: `window.companion.moveTo(request): Promise<any>` and `window.companion.teleportTo(request): Promise<any>`.
- Produces: Settings UI ids `moveTestX`, `moveTestY`, `moveTestAnchor`, `moveTestBtn`, `teleportTestBtn`, `moveTestResult`.

- [ ] **Step 1: Insert Move test markup in Other tab**

In `src/main/settings.html`, inside `<div class="tab-content" id="tab-other">`, after the “清空历史和记忆” button row and before “日志” section, insert:

```html
      <h2 style="margin-top: 24px;">Move 测试（临时 Debug）</h2>
      <hr class="divider">
      <div class="hint" style="margin-bottom: 8px; color: #666;">
        临时用于验证 moveTo / teleportTo 坐标、clamp 和移动差分；不会保存到配置。
      </div>
      <div class="field">
        <label>目标 X</label>
        <input type="text" id="moveTestX" placeholder="例如 100" />
      </div>
      <div class="field">
        <label>目标 Y</label>
        <input type="text" id="moveTestY" placeholder="例如 100" />
      </div>
      <div class="field">
        <label>Anchor</label>
        <select id="moveTestAnchor">
          <option value="top-left">top-left（窗口左上角）</option>
          <option value="center">center（窗口中心）</option>
        </select>
      </div>
      <div class="btn-row">
        <button class="btn btn-primary" id="moveTestBtn">Move 到坐标</button>
        <button class="btn btn-secondary" id="teleportTestBtn">Teleport 到坐标</button>
      </div>
      <div class="hint" id="moveTestResult" style="margin-top: 8px; color: #666;">等待测试...</div>
```

- [ ] **Step 2: Add JS helper before button event section**

Before the `// ========== 按钮事件 ==========` comment, add:

```js
    function formatMoveResult(result) {
      if (!result) return '无返回结果';
      var finalPosition = result.finalPosition || { x: '?', y: '?' };
      var reason = result.cancelReason ? ' reason=' + result.cancelReason : '';
      return 'success=' + !!result.success
        + ' cancelled=' + !!result.cancelled
        + reason
        + ' final=(' + finalPosition.x + ', ' + finalPosition.y + ')';
    }

    async function runMoveDebugTest(mode) {
      var xInput = document.getElementById('moveTestX');
      var yInput = document.getElementById('moveTestY');
      var anchorSelect = document.getElementById('moveTestAnchor');
      var resultEl = document.getElementById('moveTestResult');
      var x = Number(xInput.value);
      var y = Number(yInput.value);
      if (!Number.isFinite(x) || !Number.isFinite(y)) {
        resultEl.textContent = '请输入有效坐标';
        showToast('请输入有效坐标', 'error');
        return;
      }
      var request = {
        x: x,
        y: y,
        anchor: anchorSelect.value,
        reason: 'settings-debug'
      };
      resultEl.textContent = '执行中...';
      try {
        var result = mode === 'teleport'
          ? await window.companion.teleportTo(request)
          : await window.companion.moveTo(request);
        resultEl.textContent = formatMoveResult(result);
        showToast('Move 测试完成', result && result.success ? 'success' : 'error');
      } catch (error) {
        var message = error && error.message ? error.message : String(error);
        resultEl.textContent = '调用失败：' + message;
        showToast('Move 测试失败', 'error');
      }
    }
```

- [ ] **Step 3: Bind buttons in button event section**

After the existing `applyAppearanceBtn` listener block, add:

```js
    document.getElementById('moveTestBtn').addEventListener('click', function() {
      runMoveDebugTest('move');
    });

    document.getElementById('teleportTestBtn').addEventListener('click', function() {
      runMoveDebugTest('teleport');
    });
```

- [ ] **Step 4: Build**

Run:

```bash
npm run build
```

Expected: PASS. Existing npm warning about `electron_mirror` is acceptable.

- [ ] **Step 5: Commit UI change**

Run:

```bash
git add src/main/settings.html
git commit -m "feat: add temporary move debug panel"
```

Expected: commit includes only `src/main/settings.html`.

---

### Task 2: Update docs for temporary Move test panel

**Files:**
- Modify: `PROJECT_INDEX.md`
- Modify: `VERSION.md`

**Interfaces:**
- Consumes: completed settings panel from Task 1.
- Produces: docs noting the temporary settings move debug panel.

- [ ] **Step 1: Update PROJECT_INDEX settings note**

In `PROJECT_INDEX.md`, under the main process technical points where settings window is described, replace:

```md
- **设置窗口**：单例模式，F11 打开
```

with:

```md
- **设置窗口**：单例模式，F11 打开；“其他”页包含临时 Move 测试（Debug）区块，可输入坐标调用 `moveTo` / `teleportTo` 验证移动效果
```

- [ ] **Step 2: Update VERSION Unreleased**

In `VERSION.md`, under the latest `## Unreleased` section, add:

```md
- 设置页新增临时 Move 测试入口，可输入坐标调用 `moveTo` / `teleportTo` 验证自动移动和直接切换
```

- [ ] **Step 3: Build**

Run:

```bash
npm run build
```

Expected: PASS. Existing npm warning about `electron_mirror` is acceptable.

- [ ] **Step 4: Commit docs**

Run:

```bash
git add PROJECT_INDEX.md VERSION.md docs/superpowers/plans/2026-07-15-settings-move-debug-panel.md
git commit -m "docs: document settings move debug panel"
```

Expected: commit includes docs and this plan only.

---

## Self-Review

- Spec coverage: Task 1 adds the temporary settings UI, validates coordinates, calls `moveTo` / `teleportTo`, and displays results. Task 2 updates project docs and version notes.
- Placeholder scan: no placeholders remain.
- Type consistency: UI ids and function names match between markup and script; preload API names match existing `window.companion.moveTo` / `teleportTo`.
