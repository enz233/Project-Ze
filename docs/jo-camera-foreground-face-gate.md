# JO 修改说明：后台摄像头前景人脸过滤

## 修改目标

后台低频摄像头检测可能把远处或背景中的非用户人脸误判为“有人回来”。本次改动在后台检测链路前增加一个轻量前景人脸 gate：只有检测到足够大的前景人脸，才允许继续进入原有 Vision 人在/不在判断。

## 核心规则

- 只作用于后台低频检测的 `background` 帧。
- `*` 摄像头命令、自然语言摄像头视觉查询、设置页立即检测不走这个前置拦截。
- renderer 拍摄后台单帧后，优先用浏览器 `FaceDetector` 做本地人脸框检测。
- 若本地检测明确发现没有人脸，或最大人脸太小，则主进程直接按 `absent` 处理，并跳过 Vision 请求。
- 若本地 `FaceDetector` 不可用或出错，则自动降级回原有 Vision 判断。

## 默认阈值

```txt
foregroundFaceMinHeightRatio = 0.05
foregroundFaceMinAreaRatio   = 0.0012
```

也就是最大人脸框高度大约占画面 5%，并且人脸框面积大约占画面 0.12%，就可以被视为前景人脸；如果明显是最近/最大的前景用户，允许略小一点。

这次下调是为了让当前实拍画面中最大的前景人脸可以通过 gate，避免被旧的 14% 高度 / 1.2% 面积阈值，或上一版 7% 高度 / 0.25% 面积阈值误拦截。旧默认配置文件如果仍保存着这些默认值，加载时会迁移到新的默认阈值；用户手动改成其他数值的配置不会被覆盖。

## 运行链路

```txt
后台定时触发
  -> renderer 拍摄 background 单帧
  -> renderer 本地 FaceDetector 检测人脸框
  -> frame.foregroundFaceGate 写入 faces / largest / foreground 判断
  -> main 交给 CameraAwarenessManager.processBackgroundFrame
  -> gate blocked: 直接 absent，不调用 Vision
  -> gate passed/unavailable/error: 继续原有 Vision 判断
```

## Debug 输出

后台检测日志会额外包含：

```txt
[CameraAwareness] person: yes | state: present | reason: person_visible | source: background | face: yes height 5.6%, area 0.14% | confidence: 92%
```

或：

```txt
[CameraAwareness] person: no | state: absent | reason: foreground_face_too_small | source: background | face: no face_too_small height 3.9%, area 0.06%
```

这样可以直接看出误判是否来自背景小人脸。若本地 `FaceDetector` 不可用，终端不会再展开 `api_unavailable` 的长串字段，而是只保留核心状态。

## 修改文件

- `src/core/camera-awareness-types.ts`
  - 新增前景人脸 gate 类型和帧元数据。
- `src/core/camera-awareness-config.ts`
  - 新增默认 gate 开关和阈值。
- `src/core/camera-awareness-manager.ts`
  - 后台帧 gate blocked 时直接生成 absent 结果，跳过 Vision。
- `src/core/vision-image-analyzer.ts`
  - Vision prompt 增加忽略背景小人脸的规则。
- `src/renderer/renderer.ts`
  - 后台拍帧时本地调用 `FaceDetector` 并写入 `foregroundFaceGate`。
- `src/main/main.ts`
  - 下发 gate 阈值给 renderer，并扩展终端 debug 输出。
- `scripts/camera-awareness-contract.test.js`
  - 覆盖默认配置、prompt、reason 解析和 gate 拦截。

## 验证命令

```bash
npm run build
node scripts/camera-awareness-contract.test.js
```
