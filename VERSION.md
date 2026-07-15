# Project-Ze - 版本记录

> 旧名 Quiet Companion；当前对外项目名为 Project-Ze。

## Unreleased
- Renderer 动画守卫修复：为 blink、sleepy、lonely、bubble/subtitle timeout 链加入 handle 清理与 generation 检查，避免 stale callback 覆盖新状态或 guard flag 卡住

## v0.2.17 (2026-07-15)
- 架构清理：移除旧主动响应路径，集中化活动上下文检测，并共享屏幕分析实例
- TTS 架构重构：新增统一 TTS 引擎接口，供应商合成实现下沉到 `tts-*.ts` 引擎，`TTSManager` 专注播放、字幕、停止和 `playbackId` 确认
- 修复 TTS 播放链路：`playbackId` 透传到 renderer，并归一化 inline TTS 音频数据格式
- 新增通用 `JsonConfigStore<T>`，统一运行态 JSON 配置的默认值合并、读写和错误处理，TTS 配置已接入
- 新增 `ChatHistoryStore`，将聊天历史持久化边界从 `ai-memory.ts` 拆出，降低 AI 记忆模块职责复杂度
- 新增 `BubbleOrchestrator`，将主进程气泡请求编排与 `BubbleManager` 的状态门禁/IPC 投递职责分离
- 补充 TTS 引擎、JSON 配置存储、AI 记忆存储、气泡编排设计/计划文档和 renderer 动画保护设计/实现记录

## v0.2.16 (2026-07-13)
- 主动回应阈值、冷却、分类关键词、模板和 AI 改写 reason 迁移到 `src/config/proactive-reactions.json`
- 为后续 AI/微行为系统预留主动部件接口 `evaluateComponent()`，统一返回候选与调试状态
- 新增主动回应部件说明文档 `docs/proactive-reaction-component.md`，明确边界：不持续监控、不自动截图、不做任务建议
- 打包配置加入主动回应配置文件，避免发布包缺少运行配置

## v0.2.15 (2026-07-13)
- Debug 面板新增 Proactive 卡片，展示当前/上一个活动分类、最近候选、拦截原因、预算、最近主动回应和最近直接互动
- 主动回应系统增加调试快照，便于观察为什么说话或保持沉默
- 优化主动回应阈值：缩短稳定切换、工作到休息、休息到工作和长专注的触发门槛
- 近期直接互动后允许更快识别有意义应用切换，提高情绪反馈及时性

## v0.2.14 (2026-07-13)
- 情境化主动回应系统：基于应用类别、工作/休息切换、长时间专注、返回与近期互动生成候选回应
- 统一主动气泡出口：ObserverManager 主动回应通过 BubbleManager 状态门禁和短间隔控制
- 停用旧泛化主动消息定时器，避免 ChatManager 与 ObserverManager 重复主动发言
- AI 仅用于高价值候选的短句改写，本地规则先决定是否适合回应
- 普通主动观察不再自动触发截图，Vision 仍保留给显式屏幕分析

## v0.2.13 (2026-07-13)
- Debug 面板显示关系、互动统计、常用应用和生活习惯提示词

## v0.2.12 (2026-07-13)
- 轻量互动记忆：记录聊天、拖拽、点击、屏幕分析等互动类型和最近互动轨迹
- 活动气泡增加冷却，降低重复出现
- Windows 前台窗口检测改用 Win32 GetForegroundWindow/GetWindowText
- 修复 AI 连接测试 undefined 兜底和部分动画状态卡住风险

## v0.2.1 (2026-05-30)
- AI记忆系统：对话历史持久化，每50条自动生成摘要
- 情感前缀：根据状态给AI消息加情感提示，切换后4秒保持上一个状态
- 气泡独立：position:fixed，不随人物晃动
- 右键对话：右键打开输入框，避免与拖拽冲突
- 修复用户消息重复bug，修复右键触发拖拽bug
- 窗口调整为250x280

## v0.2.0 (2026-05-30)
- AI接入：支持OpenAI兼容API（DeepSeek等）
- AI配置管理：API Key、模型、Temperature、提示词，持久化到ai-config.json
- AI服务：流式/非流式调用，原生fetch，SSE解析
- 对话管理：历史记录、<item>格式解析、逐条气泡显示
- 设置窗口：F11打开，参考Ling-Pet布局，支持测试连接
- 双击伙伴弹出输入框，回车发送消息
- AI回复期间显示"思考中..."气泡

## v0.1.6 (2026-05-29)
- 对话气泡系统丰富：时间问候、交互气泡、活动监视
- 时间问候：启动时根据时段打招呼（早~、中午好、晚上好等）
- 交互气泡：快速点击（嗯嗯？）、长时间拖拽（放我下来...）、唤醒（你来啦！）
- 活动监视：每45秒检测前台窗口，关键词匹配（在写代码吗~、在看什么呀~等）
- 活动监视预留LLM接口
- 气泡只在idle/curious/comfortable状态下触发
- dragged状态立即显示"哇！"打断当前气泡
- tried进入时显示气泡，之后不再触发
- 修复拖拽后精灵图卡在dragged的问题（lastVisualState追踪）

## v0.1.5 (2026-05-29)
- tried（疲惫）状态：拖拽后概率触发，拖拽越久概率越高
- tried动画：tried_0~4快速进入 → 3↔4循环10秒 → 慢速退出回idle
- tried轻摇CSS动画
- 精灵图按状态分文件夹整理（sprites/basic/）
- setSprite自动根据名字前缀匹配子目录
- 修复dragged状态：mousedown时就设置isDragVisualActive和CSS
- 修复tried退出动画：通过IPC通知主进程切回idle
- 深夜拖拽不被打断，松开后走sleepy→sleeping

## v0.1.4_debug (2026-05-28)
- 修复 lastVisualState 在早返回前被设置导致精灵图不更新
- 修复眨眼动画覆盖非 idle 状态的精灵图
- 修复深夜拖拽被强制 sleeping 打断（现在允许拖拽，松开后 sleepy → sleeping）

## v0.1.4 (2026-05-28)
- lonely状态完整实现：10分钟无交互触发，点击/光标靠近唤醒
- lonely动画：lonely_0→1→2→3→4→lonely（停留最终帧）
- lonely小动作：lonely_c_0~5序列动画，40~80秒触发一次
- lonely退出动画：反向播放回lonely_0
- lonely小动作播放时不被curious打断
- 区分点击和拖拽：点击显示dragged后回idle，拖拽才真正移动窗口
- sleepy哈欠动画修复：播放期间不被眨眼打断
- 状态优先级：sleeping > lonely > sleepy
- object-position: center bottom 统一精灵图对齐

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
