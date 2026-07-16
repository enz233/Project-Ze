# FunASR 本地语音识别配置说明

日期：2026-07-16

本文说明 Project-Ze 如何连接用户已启动的 FunASR runtime WebSocket 服务。

## 边界

Project-Ze 第一版只负责连接 FunASR runtime，不会自动安装 FunASR、下载模型或启动 Docker/Python 进程。

FunASR 的模型、VAD、标点、2pass 模式和热词由 FunASR runtime 服务端配置。Project-Ze 只发送麦克风音频并接收识别文本。

## 设置页填写方式

F11 打开设置页，进入“语音输入（ASR）”：

1. 勾选“启用语音输入”。
2. 供应商预设选择“FunASR 本地识别”。
3. Base URL 使用默认值：`ws://127.0.0.1:10096`。
4. API Key 不需要填写。
5. 模型不需要填写；模型由 FunASR runtime 服务端决定。
6. 点击“测试 ASR 连接”。
7. 点击“测试语音识别 10 秒”。
8. 返回主窗口后，使用麦克风按钮或 `Ctrl+Shift+Space` 长按说话。

## 音频格式

Project-Ze 对 FunASR 发送 PCM16 little-endian、16kHz 音频 chunk，MIME 为 `audio/pcm;rate=16000`。

## 常见问题

### FunASR 本地服务连接失败

请确认：

- FunASR runtime WebSocket 服务已经启动。
- 服务端口与 Base URL 一致，默认是 `10096`。
- Docker 已映射端口。
- 启动的是 online/2pass WebSocket 实时服务，而不是只处理文件的 offline 转写服务。
- Windows 防火墙没有拦截本机连接。

### FunASR 未返回识别文本

请确认：

- 麦克风输入有声音。
- FunASR runtime 接收 PCM16 16kHz 音频。
- 服务端模型已加载完成。
- 服务端模式会返回实时或最终文本。

### 使用远程 FunASR URL

远程 FunASR 地址是高级用法。远程服务可能接收麦克风音频，请自行确认服务授权、网络安全和隐私边界。
