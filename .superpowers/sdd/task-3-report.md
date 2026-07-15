# Task 3 Report: Cancel pointer session on pre-move fingerprint change

## 状态

DONE

## 修改文件

- `src/core/screen-target-pointer.ts`
  - 导入 `ScreenCaptureFrame`、`SCREEN_FINGERPRINT_CHANGE_THRESHOLD`、`compareScreenFingerprints`。
  - 在 Vision locate 返回且 `canMove(result)` 通过后、坐标映射与移动前，新增一次 fingerprint diff 检查。
  - 新增 `hasFingerprintChangedBeforeMove(sessionId, beforeFrame)`：
    - before fingerprint 缺失：记录 debug 并继续现有 pointer flow。
    - after 截图失败或 after fingerprint 缺失：记录 debug 并继续现有 pointer flow。
    - fingerprint 不可比较：记录尺寸和值数量并继续现有 pointer flow。
    - `diff >= SCREEN_FINGERPRINT_CHANGE_THRESHOLD`（当前 0.20）：返回 `screenChangedResult(result)` 取消移动。
    - `diff < SCREEN_FINGERPRINT_CHANGE_THRESHOLD`：继续移动流程。
  - fingerprint diff 后补充 `isCurrent(id)` 检查，避免截图期间新请求切入后继续使用旧会话移动。

## 提交 hash

- `d1561d9d14b0028f20708d90bf6bd5ed818c0916`
- Message: `feat: cancel screen pointer on fingerprint change`

## 运行的命令和结果

- `npm run build`
  - 结果：PASS
  - 摘要：`tsc` 成功；npm 仅输出既有配置警告 `Unknown project config "electron_mirror"`。
- `npm test`
  - 结果：PASS
  - 摘要：测试脚本先运行 build，再通过：`voice-input-contract tests passed`、`screen-fingerprint-contract tests passed`；npm 仅输出既有 `electron_mirror` / `electron-mirror` 配置警告。

## Manual smoke

- 未运行 `npm start` 手动烟测。
- 原因：当前为隔离实现 agent 环境，未确认可用桌面 GUI/Electron 交互能力；本次依赖 build、contract tests 与代码自审验证。

## Self-review

- 范围核对：源码提交仅修改 `src/core/screen-target-pointer.ts`。
- 时机核对：fingerprint diff 只在 Vision locate 返回、`canMove(result)` 通过后，且移动和坐标映射前执行一次。
- 阈值核对：取消条件使用 `diff >= SCREEN_FINGERPRINT_CHANGE_THRESHOLD`，常量当前为 0.20；小于阈值继续。
- 降级核对：before/after fingerprint 缺失、截图失败、不可比较均返回 false，继续现有 pointer flow，不取消。
- 禁止项核对：未新增 wheel IPC、renderer wheel listener、全局 hook、持续截图监控、移动/指向期间轮询、桌宠区域排除。
- 非目标变更核对：未修改 Vision prompt、坐标映射、MoveController、自动点击/滚动/重试或普通聊天触发。

## Concerns

- 无阻塞 concerns。
- 仅有非阻塞说明：未做 Electron 手动烟测。

---

# Fix: Guard stale sessions after pre-move fingerprint capture

## 状态

DONE

## 修改文件

- `src/core/screen-target-pointer.ts`
  - 将 `hasFingerprintChangedBeforeMove(id, located.frame)` 的异步结果先保存到 `fingerprintChanged`。
  - 在根据 fingerprint 结果取消前，先执行 `isCurrent(id)`；若截图期间新请求切入，旧会话返回 `cancelledResult('new-request')`，不再发出 `screen-changed`。
  - 保留原有单次 pre-move screenshot、`diff >= 0.20` 取消、缺失/失败/不可比较继续既有流程。

## 提交 hash

- `0e62c06`

## 运行的命令和结果

- `npm run build`
  - 结果：PASS
  - 摘要：`tsc` 成功；npm 仅输出既有配置警告 `Unknown project config "electron_mirror"`。
- `npm test`
  - 结果：PASS
  - 摘要：测试脚本先运行 build，再通过：`voice-input-contract tests passed`、`screen-fingerprint-contract tests passed`；npm 仅输出既有 `electron_mirror` / `electron-mirror` 配置警告。

## Self-review

- 根因核对：旧代码在等待 pre-move fingerprint 截图后，先根据结果调用 `screenChangedResult(result)`，之后才检查 `isCurrent(id)`，导致 stale session 可在新请求切入后发出 `screen-changed`。
- 修复核对：异步结果只保存一次，随后立即检查会话是否仍 current，再根据结果取消。
- 范围核对：未新增截图次数、IPC/global hook、持续监控、移动/指向轮询、pet exclusion；未修改 Vision prompt、坐标映射、MoveController、点击/滚动/重试或普通聊天触发。

## Concerns

- 无阻塞 concerns。
- 未运行 Electron 手动烟测；本次依赖 build、contract tests 与代码自审验证。

