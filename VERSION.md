# Quiet Companion - 版本记录

## v0.1.3 (2026-05-25)
- sleepy状态动画：sleepy_1为主帧+摇晃CSS，周期性哈欠（sleepy_2→sleepy_3→sleepy→反向）
- sleepy眨眼：使用sleepy_blink素材，间隔4~10秒
- sleeping动画：sleep_1→sleep_2→sleep_3→sleeping（停留最终帧）
- 睡眠周期转移：深夜强制sleeping，早晨自然醒来，点击sleeping唤醒到sleepy
- comfortable轻摇动画（独立CSS）
- 修复离开dragged后curious无法触发的bug
- 修复sleepy哈欠动画被500ms状态更新重置的bug
- idle→sleepy概率触发（当前为测试模式5%/秒）

## v0.1.2 (2026-05-24)
- 拖拽方向差分：根据拖拽方向显示 dragged_left/right/up/down
- 拖拽过渡动画：dragged_1 → dragged_2（被拉起的动作）
- 拖拽改用绝对定位：主进程用 screen.getCursorScreenPoint 全局追踪鼠标
- 修复拖拽脱手问题：鼠标快速移动时不再丢失拖拽
- 拖拽期间精灵图不被状态更新覆盖

## v0.1.1 (2026-05-24)
- curious状态眨眼集成：频率2~6秒，速度70~130ms
- 修复curious只能触发一次的bug（离开curious时重置isCursorNear）

## v0.1.0 (2026-05-23)
- 初始版本
- 7状态系统（idle/curious/dragged/sleepy/sleeping/lonely/comfortable）
- 状态转移引擎（简化版：计时器+光标距离+拖拽触发）
- 差分图接入（idle/blink/sleepy/sleeping/dragged/lonely/comfortable）
- 眨眼动画（blink1→blink2→blink1→idle，120ms每步）
- 睡觉动画（sleep_1/2/3循环）
- 拖拽移动窗口（movementX/Y方案）
- 鼠标穿透（mouseenter/leave切换setIgnoreMouseEvents）
- 时间感知模块（未接入状态转移）
- F12打开独立调试窗口
