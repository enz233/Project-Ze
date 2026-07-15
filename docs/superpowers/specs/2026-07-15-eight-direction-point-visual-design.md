# Eight Direction Point Visual 八方向指向差分设计

日期：2026-07-15

## 背景

Screen Target Pointer 已能在 `.` 显式屏幕分析请求中定位目标、移动桌宠并显示 point 指向差分。现有设计已预留方向化指向能力，但第一版视觉表现可能只覆盖固定或有限方向。

本轮用户已在 `src/assets/sprites/point/` 加入八个方向的 point 差分素材：

- `left_up.png`
- `up.png`
- `right_up.png`
- `left.png`
- `right.png`
- `left_down.png`
- `down.png`
- `right_down.png`

目标是让桌宠移动到目标地点旁边后，使用更接近目标方向的 point 差分，并在短时间后自动恢复普通视觉状态。

## 目标

1. 在 Screen Target Pointer 成功定位并移动到目标旁边时，自动选择八方向 point 差分。
2. 方向命名直接复用 `src/assets/sprites/point/` 下的素材文件名。
3. point 差分显示约 7 秒，属于用户要求的 5-10 秒范围。
4. 7 秒后只恢复视觉状态，不移动回原位。
5. 新 point 请求、拖拽、取消或其它动作接管时，清理旧 point 视觉和计时器。
6. 尽量复用现有 point-visual / Screen Target Pointer 链路，不引入大型新控制器。
7. 保持普通屏幕分析、截图稳定性检测、移动控制和 Vision 定位语义不变。

## 非目标

1. 本轮不实现自动点击、自动滚动、自动重试。
2. 本轮不新增截图监控、wheel IPC、全局鼠标或键盘 hook。
3. 本轮不做候选确认 UI。
4. 本轮不移动回指向前位置。
5. 本轮不追求像素级指尖校准；第一版以视觉上方向正确、指尖大致对准为准。
6. 本轮不把普通聊天自然语言自动触发纳入范围。

## 推荐方案

采用方案 A：在现有 point-visual 链路上扩展八方向映射。

```text
ScreenTargetPointer 定位成功
  ↓
根据目标点与桌宠站位/锚点计算方向
  ↓
选择 PointDirection 八方向之一
  ↓
计算该方向 pointerOffset 对应的窗口左上角
  ↓
MoveController.moveTo()
  ↓
renderer 显示对应 point png
  ↓
约 7000ms 后恢复进入 point 前的普通视觉状态
```

不新增独立 `PointPoseController`。如果现有代码已经有 point pose 或 point visual 配置，则在原结构上扩展；如果没有，则只新增小型方向映射和恢复计时逻辑。

## 方向模型

新增或统一使用八方向类型：

```ts
type PointDirection =
  | 'right'
  | 'right_down'
  | 'down'
  | 'left_down'
  | 'left'
  | 'left_up'
  | 'up'
  | 'right_up';
```

方向到素材的映射固定为：

```ts
const POINT_DIRECTION_ASSET: Record<PointDirection, string> = {
  right: 'point/right.png',
  right_down: 'point/right_down.png',
  down: 'point/down.png',
  left_down: 'point/left_down.png',
  left: 'point/left.png',
  left_up: 'point/left_up.png',
  up: 'point/up.png',
  right_up: 'point/right_up.png',
};
```

实际路径以项目现有 asset import / public path 规则为准，但命名关系保持不变。

## 方向选择规则

方向根据目标点相对于桌宠窗口中心或指向锚点的向量量化为八等分。

角度划分：

- `right`：约 -22.5° 到 22.5°
- `right_down`：22.5° 到 67.5°
- `down`：67.5° 到 112.5°
- `left_down`：112.5° 到 157.5°
- `left`：157.5° 到 180°，以及 -180° 到 -157.5°
- `left_up`：-157.5° 到 -112.5°
- `up`：-112.5° 到 -67.5°
- `right_up`：-67.5° 到 -22.5°

坐标系使用屏幕常见方向：x 向右为正，y 向下为正。若目标点与参考点重合或向量非法，则回退到 `right`，避免流程失败。

## 指尖锚点与移动站位

本轮继续使用“指尖锚点对齐目标点”的原则，不把桌宠中心移动到目标点。

每个方向维护一个 `pointerOffset`，表示对应 point 素材的指尖在桌宠窗口内的位置：

```ts
interface PointPoseConfig {
  direction: PointDirection;
  pointerOffset: { x: number; y: number };
}
```

第一版可使用保守估算：

- `right`：窗口右侧中部附近。
- `left`：窗口左侧中部附近。
- `up`：窗口上侧中部附近。
- `down`：窗口下侧中部附近。
- `right_up`：窗口右上附近。
- `right_down`：窗口右下附近。
- `left_up`：窗口左上附近。
- `left_down`：窗口左下附近。

换算仍为：

```ts
moveTopLeft.x = targetScreenPoint.x - pointerOffset.x;
moveTopLeft.y = targetScreenPoint.y - pointerOffset.y;
```

如果实现时发现素材实际指尖位置与估算差异明显，只调整 offset 表，不改变 Screen Target Pointer 主流程。

## Renderer 表现

renderer 收到 point visual 指令后：

1. 保存进入 point 前的普通视觉状态。
2. 根据 `direction` 切换到对应 png。
3. 启动 7000ms 自动恢复计时器。
4. 计时结束后恢复保存的普通视觉状态。
5. 不请求移动回原位。

打断规则：

- 新 point visual：替换方向并重置 7000ms 计时器。
- Screen Target Pointer 取消：立即清理 point visual。
- 用户拖拽桌宠：立即清理 point visual。
- 其它移动或动作系统接管：清理 point visual，避免残留。
- renderer 重复收到清理指令时应保持幂等。

## 数据流

### 成功指向流程

```text
用户：.帮我指出下载按钮在哪
  ↓
ScreenTargetPointer 定位目标
  ↓
屏幕稳定性检查通过
  ↓
计算目标点与参考点方向
  ↓
选择八方向 point pose
  ↓
按该 pose 的 pointerOffset 计算 moveTopLeft
  ↓
MoveController 平滑移动到目标旁边
  ↓
renderer 显示对应方向 point 差分
  ↓
约 7 秒后恢复普通视觉状态，位置保持不变
```

### 打断流程

```text
point visual 显示中
  ↓
用户拖拽 / 新请求 / session 取消 / 动作接管
  ↓
清除恢复计时器
  ↓
恢复普通视觉状态
```

## 错误处理

1. direction 缺失或非法：回退 `right`。
2. 对应素材加载失败：记录日志并回退到现有 point visual 或普通状态，不阻断目标指示文字与移动流程。
3. pointerOffset 缺失：使用方向默认估算；仍缺失则回退现有单方向 offset。
4. 自动恢复计时器重复创建：先清理旧计时器再创建新计时器。
5. 清理指令重复到达：幂等处理，不报错。
6. 移动被取消：立即清理 point visual，不继续显示成功指向状态。

## 测试与验证

1. `npm run build` 通过。
2. `npm test` 通过。
3. `.总结这个页面` 仍走普通屏幕分析，不触发 point 移动。
4. `.帮我指出xxx` 定位成功后进入目标指示流程。
5. 目标在八个相对方向时，renderer 使用对应 point png。
6. point visual 约 7 秒后恢复普通视觉，桌宠不移动回原位。
7. 新 point 请求会替换旧方向并重置恢复计时器。
8. 用户拖拽、session 取消或移动取消时不会留下 point 残影。
9. 素材缺失或 direction 异常时不会让主流程崩溃。

## 成功标准

- 八方向 point 素材被纳入 Screen Target Pointer 成功指向流程。
- 指向方向与目标相对位置一致，视觉上比固定方向更自然。
- point 差分持续约 7 秒后自动恢复普通视觉状态。
- 恢复时不移动回原位。
- 打断和取消流程不会残留 point 状态或计时器。
- 改动保持轻量，主要沿用现有 point-visual 和 Screen Target Pointer 边界。

## 自检

- 无 TBD/TODO 占位符。
- 范围聚焦在八方向 point 差分、方向选择、指尖锚点和自动恢复。
- 明确不做点击、滚动、自动重试、持续监控和普通聊天触发。
- 7 秒恢复策略与用户选择一致：只恢复视觉，不移动回原位。
- 推荐方案 A 与实现约束一致：复用现有链路，避免过度设计。
