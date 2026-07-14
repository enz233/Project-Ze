# Quiet Companion 操作指南

## 一、基本操作

| 操作 | 效果 |
|------|------|
| 鼠标靠近 | 触发 curious（好奇）状态 |
| 左键拖拽 | 拖拽角色，根据方向显示不同差分 |
| 右键点击 | 打开对话输入框 |
| 输入回车 | 发送消息给 AI |
| 按 Esc / 点击别处 | 关闭输入框 |
| F11 | 打开设置窗口 |
| F12 | 打开开发者工具 |

## 二、状态转移图

```
                    ┌─────────────┐
        时间触发     │   sleeping  │  点击唤醒
       (01:00-06:00)│    睡觉     │──────────┐
                    └──────┬──────┘          │
                           │ 时间结束        │
                    ┌──────▼──────┐          │
      时间触发       │   sleepy    │◄─────────┘
     (22:00-01:00)  │    犯困     │
                    └──────┬──────┘
                           │ 超时
         ┌─────────────────▼─────────────────┐
         │              idle                  │
         │            （空闲）                 │◄──── 超时回idle
         └──┬──────┬──────┬──────┬──────┬────┘
            │      │      │      │      │
    鼠标靠近│  拖拽 │ 10min│ 拖拽后│ 时间 │
            │      │ 无交互│  概率 │ 触发  │
            ▼      ▼      ▼      ▼      ▼
       curious dragged lonely  tried comfortable
       (好奇)  (拖拽)  (孤独)  (疲惫)  (舒适)
```

### 各状态持续时间

| 状态 | 最短 | 最长 | 触发方式 |
|------|------|------|---------|
| idle | 30s | 120s | 默认状态 |
| curious | 3s | 8s | 鼠标靠近（<200px） |
| dragged | - | - | 左键拖拽（松开结束） |
| sleepy | 60s | 180s | 22:00-01:00 概率触发 |
| sleeping | 300s | 9999s | 01:00-06:00 强制 / 点击唤醒到 sleepy |
| lonely | 60s | 120s | 10分钟无交互 |
| comfortable | 20s | 40s | 拖拽后 40% 概率 |
| tried | 20s | 30s | 拖拽后概率（拖拽越久概率越高） |

## 三、AI 对话功能

### 首次配置
1. 按 F11 打开设置
2. 填写 API Key（如 DeepSeek）
3. 填写 API 地址（默认 `https://api.deepseek.com/v1`）
4. 点击"测试连接"确认可用
5. 点击"保存"

### 对话方式
- 右键角色 → 输入框出现 → 输入消息 → 回车发送
- AI 回复逐条显示为气泡
- 对话历史自动保存，重启不丢失
- 每 50 条对话自动生成记忆摘要

### 情感系统
- 不同状态下 AI 回复会带有情感色彩
- lonely 时回复更温暖，sleepy 时更慵懒
- 状态切换后 4 秒内保持上一个状态的情感

## 四、状态表现

| 状态 | 动画 | 气泡概率 | 气泡内容 |
|------|------|---------|---------|
| idle | 呼吸+眨眼 | 5% | ~, ..., ♪ |
| curious | 歪头+快速眨眼 | 15% | ?, ~?, 嗯？ |
| dragged | 方向差分+晃动 | 30% | 哇！（打断当前气泡） |
| sleepy | 摇晃+哈欠周期 | 10% | 好困..., zzZ |
| sleeping | 呼吸动画 | - | （无气泡） |
| lonely | 进入动画+小动作 | 8% | ..., 在吗 |
| comfortable | 轻摇 | 10% | 嘿嘿, ~ |
| tried | 进入→循环→退出 | 30% | 好累..., 呼... |

## 五、配置文件说明

运行时的 AI / TTS / 外观 / 对话历史 / AI 记忆配置保存在 Electron `userData/config` 目录，不应提交到仓库。仓库中的 `src/config/*.example.json` 只用于展示安全字段形状；真实 API Key、聊天内容和个人记忆不要写入示例文件。更多说明见 [docs/configuration-security.md](docs/configuration-security.md)。

| 文件 | 位置 | 说明 |
|------|------|------|
| `ai-config.example.json` | src/config/ | AI 配置示例（API Key 为空） |
| `tts.example.json` | src/config/ | TTS 配置示例（API Key 为空） |
| `chat-history.example.json` | src/config/ | 对话历史示例（空消息列表） |
| `ai-memory.example.json` | src/config/ | AI 记忆示例（无个人内容） |
| `appearance.example.json` | src/config/ | 外观配置示例 |
| `states.json` | src/config/ | 状态定义（一般不需要改） |
| `proactive-reactions.json` | src/config/ | 主动回应阈值、分类和模板规则 |
| `micro-behaviors.json` | src/config/ | 微行为触发与动作规则 |
