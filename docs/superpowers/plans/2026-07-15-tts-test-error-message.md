# TTS Test Error Message Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让设置页“测试语音”失败时显示阿里云返回的具体错误码和错误消息，而不是只显示泛化的连接失败。

**Architecture:** 只修改阿里云 TTS 引擎。`TTSAliyun.synthesize()` 在 HTTP 非 2xx 时把阿里云 JSON 错误格式化成可读 `Error.message`，`TTSAliyun.test()` 不再吞异常，让现有 `TTSManager.test()` 和设置页 toast 透传错误。

**Tech Stack:** Electron 42、TypeScript 6、CommonJS、原生 `fetch`、现有 TTS engine interface。

## Global Constraints

- 设置页测试语音失败时显示具体错误原因。
- 阿里云错误优先显示 HTTP 状态码、阿里云错误 code 和 message。
- 不改变正常 TTS 播放链路。
- 不改变设置页 UI 结构。
- 保持其它 TTS 引擎行为不变。

---

## File Structure

- Modify: `src/core/tts-aliyun.ts`
  - Responsibility: 阿里云 HTTP TTS 合成与测试。新增错误格式化 helper，HTTP 错误和测试错误都通过 `Error.message` 传递给上层。

---

### Task 1: Format and propagate Aliyun TTS test errors

**Files:**
- Modify: `src/core/tts-aliyun.ts`

**Interfaces:**
- Consumes: `fetch` `Response` body from Aliyun TTS endpoint.
- Produces: `TTSAliyun.test(): Promise<boolean>` that returns `true` on success and throws detailed `Error` on failure.

- [ ] **Step 1: Add error formatting helper inside `TTSAliyun` class**

In `src/core/tts-aliyun.ts`, inside `export class TTSAliyun implements TTSEngine {`, after `buildUrl()`, add:

```ts
  private formatError(status: number, body: string): string {
    const trimmed = body.trim();
    if (!trimmed) {
      return `阿里云 TTS 请求失败 (${status})`;
    }

    try {
      const data = JSON.parse(trimmed) as { code?: string; message?: string; request_id?: string };
      const detail = [data.code, data.message].filter(Boolean).join(' - ');
      if (detail) {
        return `阿里云 TTS 请求失败 (${status}): ${detail}`;
      }
    } catch {
      // 非 JSON 响应，使用原始文本。
    }

    return `阿里云 TTS 请求失败 (${status}): ${trimmed}`;
  }
```

- [ ] **Step 2: Use formatted error for HTTP failures**

In `synthesize`, replace:

```ts
    if (!response.ok) {
      const error = await response.text();
      console.error('[Aliyun TTS] 错误响应:', error);
      throw new Error(`阿里云 TTS 请求失败 (${response.status}): ${error}`);
    }
```

with:

```ts
    if (!response.ok) {
      const error = await response.text();
      console.error('[Aliyun TTS] 错误响应:', error);
      throw new Error(this.formatError(response.status, error));
    }
```

- [ ] **Step 3: Stop swallowing errors in `test()`**

Replace the current `test()` method:

```ts
  async test(): Promise<boolean> {
    try {
      await this.synthesize('测试');
      return true;
    } catch {
      return false;
    }
  }
```

with:

```ts
  async test(): Promise<boolean> {
    await this.synthesize('测试');
    return true;
  }
```

- [ ] **Step 4: Run TypeScript build**

Run:

```bash
npm run build
```

Expected: PASS.

- [ ] **Step 5: Commit implementation**

Run:

```bash
git add src/core/tts-aliyun.ts
git commit -m "fix: show aliyun tts test errors"
```

Expected: commit succeeds.

---

### Task 2: Final verification

**Files:**
- Inspect: `src/core/tts-aliyun.ts`

**Interfaces:**
- Consumes: Task 1 implementation.
- Produces: verified build and user-facing usage note.

- [ ] **Step 1: Run final build**

Run:

```bash
npm run build
```

Expected: PASS.

- [ ] **Step 2: Inspect final diff**

Run:

```bash
git diff HEAD~1..HEAD -- src/core/tts-aliyun.ts
```

Expected: diff shows `formatError()`, `throw new Error(this.formatError(...))`, and `test()` without a catch block.

- [ ] **Step 3: Explain expected UI behavior**

Tell the user:

```markdown
现在设置页“测试语音”失败时会显示具体阿里云错误，例如：

`TTS 测试失败: 阿里云 TTS 请求失败 (403): AllocationQuota.FreeTierOnly - The free quota has been exhausted...`

如果阿里云返回非 JSON 文本，则显示原始响应文本。
```

---

## Self-Review

- Spec coverage: Task 1 covers formatted Aliyun errors and test error propagation; Task 2 covers verification and user-facing behavior.
- Placeholder scan: No placeholders or vague implementation steps remain.
- Type consistency: `formatError(status: number, body: string): string` is used only inside `TTSAliyun`; `test(): Promise<boolean>` keeps the existing `TTSEngine` interface.
