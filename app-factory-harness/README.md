# App Factory Harness composition

本目录是可复用的 DeepSeek Harness 扩展配置，与临时 local-chat-sandbox UI 分开。没有自行实现模型调用、agent loop 或 Worker 执行器。

- `composition.mjs` 生成传给 `dsh --profile sdk --patch` 的 Cordis overlay。
- `app-router` 是默认原生 agent preset，工具白名单包含委派、消息、发现、中断、等待、todo、记忆和 Skill。
- `app-worker` 是原生独立 preset，通过 Harness `subagent` 的 spawn provider 创建。它拥有原生代码与 shell 工具，可以委派一层任务分身，不允许改插件。
- Harness 原生 session、catalog、完成通知、恢复与自动压缩负责运行。根 session 按群持久化；子 session 按任务保存。
- 主 Agent 决定拆解和分派；聊天适配器不解析模型 JSON 来手动启动 Worker。

原生 spawn 是同一 Harness runtime 内的独立 Agent/session，不是每个 Worker 单独一个 OS 进程。上下文不共享；主 Agent 只接到 Worker 最终摘要。UI 可以展示子 session 工具事件，但不会把这些事件再次输入 Router。

共享 App/模拟器的串行策略目前由 Router 角色约束，不是强制资源锁。不要把这版当作可并发写同一 App 的调度系统。

持续产品目标由 `app-goals.json` 保存，每轮通过 SDK 的可追溯消息输入 Router。`product-state.mjs` 验证 Worker 发布的版本清单，禁止错版本、越目录图片或将未覆盖尺寸标记为整体验证完成。验证状态是 Worker 报告和证据引用，不是独立视觉裁判。

每次输入分配一个反馈轮次 revision（不是 Git commit 或独立构建编号）。Worker 在本次产物目录写 `preview.json` 后，群聊可在任务未结束时显示预览；后续更新原卡片。每个尺寸单独标记验证情况，可引用版本卡片继续反馈。旧截图不自动冒充新版本结果。此协议依赖 Worker 主动发布清单；未发布时仍显示原有进度与最终回复。


## 团队工作室与能力边界

管理页位于 `/team.html`。`registry.mjs` 用 SQLite WAL 保存角色、实例、记忆与 Skill 版本，数据位于 `data/team.sqlite`，不进入 Git。global 是本机团队共享，app 是应用共享，role 是同角色长期经验，session 是独立分身经验。读取按范围过滤；Worker 写 global/app 只生成 proposed 候选，幕僚长可归并，私人范围不送给幕僚长。来源和版本冲突检查避免静默覆盖；当前检索是关键词匹配，尚无向量检索、自动过期或可靠性评分。

`team-knowledge` 是正式 Harness 工具插件；工具返回通过原生会话日志进入模型。记忆是按需工具检索，不是每轮全量拼接。这里的范围隔离约束工具接口，不是 OS 安全沙箱；当前 Worker 有本地 shell，不能宣称恶意 Agent 也无法绕过文件访问。

幕僚长选择原生 preset；专业 Worker 可创建任务分身，最大深度 2、全树最多 4 个活跃子 Agent。原生独立 session 和完成通知保持不变。角色层允许直接修改职责；当前角色设定和模板导入在下次 Harness 重启时生效。

Agent 可用 `team_skill_save` 随时沉淀带证据的草稿，用户在管理页启用。激活的技能在重启时生成标准 SKILL.md 并由 Harness 原生 skill-filesystem 加载。未接自动评测与自动晋升，不能声称 Skill 已自行验证。生成的 Skill 仅支持文本步骤；模板不携带可执行脚本、第三方依赖或插件代码。

Share as template 导出角色职责、委派偏好与已启用 Skill，不导出实例、记忆、历史、凭据。导入使用新 id，显示预览，Skills 回到草稿状态。文本可能包含使用者手写的敏感信息，导出前需检查内容；不是自动脱敏系统。

App 注册配置迁至 `config/apps.json`，相对路径以本目录为基准。`reference/feishu-legacy.mjs` 仅保留早期文字长连接的参考实现，不被导入或运行；其旧 store/agent 接口不兼容当前 Harness，后续接飞书应重写传输适配层。
