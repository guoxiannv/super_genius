# Super Genius · 鸿蒙软件工厂

通过本地群聊提交开发任务、补充上下文和查看 Harness 执行结果。团队工作室用于维护 Agent 角色、记忆和 Skill。

## 本地运行

需要 Node.js 24 或更新版本。首次运行时，在仓库根目录安装依赖、构建前端并启动服务。

```sh
npm --prefix frontend ci
npm run build
npm start
```

打开 [群聊](http://127.0.0.1:8790/) 或 [团队工作室](http://127.0.0.1:8790/team.html)。Node 服务同时提供页面、静态资源和同源 API。前端源码改动后重新执行 `npm run build`，再刷新浏览器。

真实任务执行需要已构建的本机 DeepSeek Harness 和官方 DeepSeek 凭据，详见 [聊天服务说明](local-chat-sandbox/README.md)。使用本地 Harness 源码时，可通过 `DSH_ROOT` 指定它的绝对目录。

## 前端开发

首次安装依赖后，打开两个终端，分别从仓库根目录启动 API 和 Vite。

```sh
# 终端 1 启动聊天 API
npm start

# 终端 2 启动带热更新的前端
VITE_API_TARGET=http://127.0.0.1:8790 npm run dev
```

打开 [开发页面](http://localhost:3000/)。只启动 `npm run dev` 可以预览页面结构。需要可浏览的演示数据时，运行 `npm --prefix frontend run dev -- --mode mock`。

## 工程结构

| 目录 | 用途 |
| --- | --- |
| [frontend](frontend/) | 独立的 React、TypeScript、Vite 工程 |
| [local-chat-sandbox](local-chat-sandbox/) | 群聊 HTTP API、本地数据、Harness 连接和前端构建产物托管 |
| [app-factory-harness](app-factory-harness/) | Agent 角色、工具、记忆和应用配置 |

构建产物在 `frontend/dist/`。`CHAT_STATIC_DIR` 可指定其他构建目录，支持绝对路径或相对仓库根目录的路径。`CHAT_PORT` 可调整默认的 8790 端口。构建产物缺失时 API 仍可启动，页面会提示先构建。

## 验证

```sh
npm run check     # TypeScript 与 ESLint
npm run build     # 构建两个页面
npm test          # 后端回归
```

浏览器回归使用临时数据与本地 Harness 测试适配器。构建后按 [浏览器回归说明](frontend/README.md#验证) 运行 `npm run test:e2e`。
