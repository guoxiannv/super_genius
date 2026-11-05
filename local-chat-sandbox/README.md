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

同一 App 和模拟器的串行执行由 Router 角色约束，尚无跨群强制资源锁。模型输出的 Worker JSON 是提示约定，尚无强制 schema。只有原生 group_publish 工具的成功结果进入群聊，普通 assistant/message 不自动公开。Router 用 group_route 判断消息是旁听、简短答复还是工作任务；旁听即时完成，不挂 Worker 执行日志。Worker 日志归属启动它的任务，公开结果必须提供该群有效的 event_id，缺失时不会误挂到最近一句闲聊。简单答复每条输入最多公开一次；完全相同的公开文字按输入去重。

这些规则依赖主 Agent 的语义判断，不是关键词过滤；仍需真实群聊回归验证。修改角色规则和工具配置后需要重启聊天/Harness 服务生效，正在执行的任务应先结束。候选 revision 仍按输入分配，可能跳号，只有 work 消息可以将其用于 Worker 的产物约定。

当前云音乐是 Web App；在鸿蒙浏览器运行不能等同于 ArkTS 原生验证。会话仍使用原 App 目录，尚未实现自动隔离工作副本。程序仅监听本机，模拟人员不是登录权限系统。

## 产品目标和阶段预览

Router 每轮接收独立持久的 App 目标和最近可见版本。Worker 发布 `preview.json` 后，界面即时显示版本卡、各尺寸的验证状态及真实截图；“基于此版本继续改”把版本与图引用一起送回 Router。超过 450 字的机器人说明默认折叠，截图仍展示。卡片中的通过状态来自 Worker 提供的同版本证据，未提供清单不会伪造卡片。

## 团队工作室

打开 `/team.html` 查看幕僚长、专业 Worker、分身设定、分层记忆与 Skill。支持文本 bot 模板预览导入和导出；导入技能为草稿。角色修改、导入与 Skill 启用在下次 Harness 重启生效。当前没有自动重启按钮，以免打断执行。实例页是持久历史记录，不是实时状态面板。App 注册已经迁到 `../app-factory-harness/config/apps.json`，旧 app-factory 已清理。

## 群聊回收站与公网加载

群头部“删除群”将群移入回收站，侧栏“回收站”可恢复；消息与 Harness 记忆保留。待转发或执行中的群暂不能删除。删除后不能发消息或重试任务，恢复后继续使用。

页面每 3 秒检查当前群的轻量状态，后台标签页暂停轮询；未变化只返回短确认。Worker 日志在展开时按需获取，不再随全部群历史反复传输。JSON 状态支持 gzip，截图使用私有短缓存及 ETag。Tunnel 仍依赖本机上行网络，跨区域链路延迟不会由这些优化消除。
