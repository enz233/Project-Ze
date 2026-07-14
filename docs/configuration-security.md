# Configuration Security

Project-Ze 的真实运行时配置不应提交到仓库。应用运行时会把用户配置、聊天历史和记忆写入 Electron `userData/config` 目录；仓库中的 `src/config` 只应保存默认规则（如状态、主动回应和微行为规则）或安全示例。

## Safe to commit

以下文件是可提交的默认规则：

- [src/config/states.json](../src/config/states.json)
- [src/config/proactive-reactions.json](../src/config/proactive-reactions.json)
- [src/config/micro-behaviors.json](../src/config/micro-behaviors.json)

以下文件是安全示例，可以提交：

- [src/config/ai-config.example.json](../src/config/ai-config.example.json)
- [src/config/tts.example.json](../src/config/tts.example.json)
- [src/config/chat-history.example.json](../src/config/chat-history.example.json)
- [src/config/ai-memory.example.json](../src/config/ai-memory.example.json)
- [src/config/appearance.example.json](../src/config/appearance.example.json)

这些文件必须保持：

- API Key 为空字符串。
- 不包含真实聊天内容。
- 不包含用户个人记忆。
- 不包含本地路径、账号、令牌或供应商密钥。

## Do not commit

以下文件是本地真实配置或运行时数据，已被 `.gitignore` 忽略：

- `src/config/ai-config.json`
- `src/config/tts.json`
- `src/config/chat-history.json`
- `src/config/ai-memory.json`
- `src/config/appearance.json`

如果需要创建本地配置，可以复制 example 文件并改名，例如：

```bash
cp src/config/ai-config.example.json src/config/ai-config.json
```

更推荐通过应用设置页写入配置，因为运行时实际读取和保存的位置是 Electron 用户数据目录。

## Runtime config location

运行时配置由各 ConfigManager 写入：

```txt
Electron app.getPath('userData')/config
```

常见文件：

```txt
ai-config.json
tts.json
appearance.json
chat-history.json
ai-memory.json
```

这些文件属于用户本地数据，不应作为项目源码提交。

## API key rotation

如果真实 API Key 曾经出现在仓库、日志、聊天记录、截图或工具输出中，应视为已经暴露。

处理方式：

1. 到对应供应商控制台禁用或删除旧 Key。
2. 创建新 Key。
3. 只在应用设置页或本地忽略配置中填写新 Key。
4. 不要把新 Key 写入 example 文件或文档。

## Contributor checklist

提交前检查：

```bash
git status --short
git diff --cached
```

确认没有以下内容：

- `sk-` 开头或供应商格式的真实密钥。
- 用户聊天原文。
- 个人记忆摘要。
- 本地绝对路径。
- 运行时日志。
