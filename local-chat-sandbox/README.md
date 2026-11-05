# Local Room · 临时本地聊天群

启动：`npm start`，打开 http://127.0.0.1:8790 。需要 Node.js 24+，已构建的本机 DeepSeek Harness 以及官方 DeepSeek 凭据。

## 现在的执行架构

群消息 → 正式 DeepSeek Harness SDK → 持久 Router session → Harness 原生 subagent/spawn → 独立 Worker session → 完成通知回 Router → 群内结果与截图。

Router 本身和 Worker 都是 Harness Agent。临时界面没有直接调用 chat/completions，没有自行解析计划并执行代码的 Worker loop。`../app-factory-harness/` 保存可复用角色与 Cordis 插件配置；本目录仅保存群聊、SDK 传输和展示。

每条普通群消息也进入 Router，由主 Agent 判断静默、询问或派发。Worker 运行时，新群消息继续进入 Router 的原生 inbox。使用原生 session/wait 等待整棵任务树和最终汇总，避免把“已派发”当完成。Worker 工具事件可在人类界面展开，但不会复制回 Router 输入。

## 使用

创建人员与群，在每个窗口切换发言身份。使用 @app-factory 提交任务，后续可引用消息继续迭代。图片支持选择文件与粘贴 PNG/JPEG/WebP，每张最多 6MB、每条最多 4 张；图片和聊天存本地。截图通过同源本地媒体接口展示。

群记录在 `data/chat.json`，Router 映射与事件状态在 `data/sdk/bridge.json`，原生 Harness session 在 `data/sdk/home`。原单 Agent 会话映射保留为 legacyRooms，新架构不将旧执行上下文接入 Router。重启恢复 Router，原生 Worker 由 Harness catalog 与 send_message 继续；中断任务不会自动重放副作用，需明确发继续指令。

`npm run start:harness` 仅检查正式 SDK 启动并退出；日常 `npm start` 自动管理 SDK 子进程。8787 的旧自制 Router 服务不再被本聊天访问。飞书未接入。

## 验证与限制

`npm test` 覆盖群持久化、角色、幂等、SDK 消息继续接收、恢复映射、Worker 日志不进入模型输入、图片存储与路径限制。真实 Router API smoke 已验证角色和工具白名单。

原生 Worker 完整改代码→构建→模拟器→截图流程尚需单独端到端验收；模拟测试不能替代此项。当前会话限制不允许启动子 Agent，所以这里不把真实 Worker 流程标为通过。

同一 App 和模拟器的串行执行由 Router 角色约束，尚无跨群强制资源锁。模型输出的 Worker JSON 是提示约定，尚无强制 schema。UI 随原生 assistant/message 事件展示 Router 回复，无需等待 Worker 全部结束；提交状态显示当前执行步骤，期间可以展开过程。执行期间多条消息共用一次活动，Router 回复关联当前最新消息；原生事件序号去重，早先回复不会被最后一句覆盖，不保证每条消息各有一条最终回复。

当前云音乐是 Web App；在鸿蒙浏览器运行不能等同于 ArkTS 原生验证。会话仍使用原 App 目录，尚未实现自动隔离工作副本。程序仅监听本机，模拟人员不是登录权限系统。
