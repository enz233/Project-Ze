# Configuration Security Cleanup Design

## Context

Project-Ze 的运行时配置由 Electron 用户数据目录保存，但仓库里仍存在开发期配置痕迹：`src/config/chat-history.json` 被 git 跟踪，且本地 `src/config/ai-config.json` 虽已在 `.gitignore` 中但包含真实 API Key。下一阶段需要把仓库配置边界整理清楚，避免开发者协作时误提交密钥、聊天历史和本地记忆。

## Goals

- 停止跟踪仓库中的真实聊天历史。
- 保留可分享的 example 配置文件，方便新开发者理解字段。
- 明确说明运行时配置写入 Electron `userData/config`，不是仓库配置。
- 更新 `.gitignore`，覆盖常见本地敏感配置变体。
- 不改变应用运行逻辑。
- 不删除用户本地真实配置文件，只从 git 跟踪中移除不该共享的数据。

## Non-goals

- 不改设置页 UI。
- 不加入环境变量读取逻辑。
- 不迁移已有用户数据。
- 不重写配置管理类。
- 不清理 git 历史；若历史中曾提交敏感数据，需要单独进行密钥轮换和历史清理。

## Design

本轮采用“仓库边界清理”方案：

1. 使用 `git rm --cached src/config/chat-history.json` 停止跟踪真实聊天历史，保留本地文件。
2. 新增 example 文件：
   - `src/config/ai-config.example.json`
   - `src/config/tts.example.json`
   - `src/config/chat-history.example.json`
   - `src/config/ai-memory.example.json`
   - `src/config/appearance.example.json`
3. 更新 `.gitignore`，继续忽略真实配置，同时明确允许 example 配置。
4. 新增 `docs/configuration-security.md`，说明哪些文件可提交、哪些文件不可提交、如何初始化本地配置。
5. 更新现有主动回应文档之外的开发者说明，不影响当前运行逻辑。

## Security note

本地 `src/config/ai-config.json` 中出现过真实 API Key。即使该文件当前未被 git 跟踪，也应视为已暴露给本地工具上下文。建议用户到对应供应商控制台轮换该 Key。

## Testing

- `npm run build` 通过。
- `git status --short` 中不再出现被跟踪的真实 `src/config/chat-history.json` 修改，只显示删除跟踪状态和新增 example/docs 文件。
- 新增 example 文件不包含真实 API Key、聊天内容或个人记忆。
