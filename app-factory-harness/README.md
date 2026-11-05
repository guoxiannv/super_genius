# App Factory Harness composition

本目录是可复用的 DeepSeek Harness 扩展配置，与临时 local-chat-sandbox UI 分开。没有自行实现模型调用、agent loop 或 Worker 执行器。

- `composition.mjs` 生成传给 `dsh --profile sdk --patch` 的 Cordis overlay。
- `app-router` 是默认原生 agent preset，工具白名单仅包含委派、消息、发现、中断、等待与 todo。
- `app-worker` 是原生独立 preset，通过 Harness `subagent` 的 spawn provider 创建。它拥有原生代码与 shell 工具，不允许进一步委派或改插件。
- Harness 原生 session、catalog、完成通知、恢复与自动压缩负责运行。根 session 按群持久化；子 session 按任务保存。
- 主 Agent 决定拆解和分派；聊天适配器不解析模型 JSON 来手动启动 Worker。

原生 spawn 是同一 Harness runtime 内的独立 Agent/session，不是每个 Worker 单独一个 OS 进程。上下文不共享；主 Agent 只接到 Worker 最终摘要。UI 可以展示子 session 工具事件，但不会把这些事件再次输入 Router。

共享 App/模拟器的串行策略目前由 Router 角色约束，不是强制资源锁。不要把这版当作可并发写同一 App 的调度系统。

持续产品目标由 `app-goals.json` 保存，每轮通过 SDK 的可追溯消息输入 Router。`product-state.mjs` 验证 Worker 发布的版本清单，禁止错版本、越目录图片或将未覆盖尺寸标记为整体验证完成。验证状态是 Worker 报告和证据引用，不是独立视觉裁判。

每次输入分配一个反馈轮次 revision（不是 Git commit 或独立构建编号）。Worker 在本次产物目录写 `preview.json` 后，群聊可在任务未结束时显示预览；后续更新原卡片。每个尺寸单独标记验证情况，可引用版本卡片继续反馈。旧截图不自动冒充新版本结果。此协议依赖 Worker 主动发布清单；未发布时仍显示原有进度与最终回复。
