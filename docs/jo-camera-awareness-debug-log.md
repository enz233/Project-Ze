# JO 修改说明：摄像头后台检测终端 Debug

## 修改目标

给后台低频摄像头检测增加终端 debug 输出，方便观察每次后台拍摄后的单帧判断和稳定状态机状态。

## 输出格式

每次后台拍摄并完成检测后，主进程终端会输出：

```txt
[CameraAwareness] person: yes | presence: present | confidence: 92% | state: present | reason: person_visible | source: background
```

字段含义：

- `person`：当前这一帧是否看到人，`yes / no / uncertain / unknown`。
- `presence`：Vision 单帧检测结果，`present / absent / uncertain`。
- `confidence`：单帧检测置信度。
- `state`：CameraAwarenessManager 稳定状态，`present / absent / uncertain / unavailable`。
- `reason`：检测原因。
- `source`：帧来源，后台低频检测为 `background`。

拍摄失败或超时时输出：

```txt
[CameraAwareness] capture failed | state: present | error: permission denied
```

## 修改文件

- `src/main/main.ts`
  - 后台 frame 进入 `processBackgroundFrame()` 后调用 `logCameraAwarenessDebug()`。
  - 后台拍摄失败时调用 `logCameraAwarenessCaptureError()`。

- `scripts/camera-awareness-contract.test.js`
  - 增加主进程 debug 接线检查。

## 行为边界

- 不改变摄像头拍摄频率。
- 不改变人在/不在判断。
- 不改变 `absent -> present` 回来回应逻辑。
- 不改变气泡冷却。
- Debug 输出只用于开发终端观察。

## 验证命令

```bash
npm run build
node scripts/camera-awareness-contract.test.js
```
