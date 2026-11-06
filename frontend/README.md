# Super Genius 前端

React + TypeScript + Vite 多页面工程。群聊入口为 `/`，团队工作室入口为 `/team.html`。以下命令在本目录运行，建议使用 Node.js 24。

## 开发和预览

```sh
npm ci
npm run dev
```

打开 [群聊](http://localhost:3000/) 或 [团队工作室](http://localhost:3000/team.html)。默认预览页面结构。使用只读模式可以查看演示数据。

```sh
npm run dev -- --mode mock
```

联调时先从仓库根目录运行 `npm start`，再在前端目录指定 API 地址并启动 Vite。

```sh
VITE_API_TARGET=http://127.0.0.1:8790 npm run dev
```

也可以在前端目录创建 `.env.local`，写入 `VITE_API_TARGET=http://127.0.0.1:8790`。Vite 把同源的 `/api` 请求代理到聊天服务，聊天页面与团队抽屉共用这条路径。

用于 v0 等远程预览时，可将前端目录作为项目根目录，用 `npm ci` 安装并执行 `npm run dev`，预览端口为 3000。需要示例会话时把启动命令改为 `npm run dev -- --mode mock`。

## 代码位置

| 路径 | 维护内容 |
| --- | --- |
| `src/entries/` | 群聊与团队工作室的浏览器入口 |
| `src/pages/` | 两个页面的布局和操作入口 |
| `src/chat/` | 侧栏、弹窗、消息和输入区，以及轮询、发送、上传和窗口状态 |
| `src/team/` | 角色、实例、记忆、Skill 和模板导入 |
| `src/components/` | 原生弹窗、头像、提示和空状态 |
| `src/api.ts`、`src/types.ts` | 同源请求、错误处理和接口数据类型 |
| `src/styles/` | 共享主题变量，以及群聊和团队各一份页面样式 |
| `preview/` | Vite 演示服务使用的样例数据 |

聊天草稿和发言身份按窗口及群保存。消息列表使用稳定的消息 ID 保留已展开的内容。新增接口放到 `src/api.ts` 中对应的业务区块。

## 构建与托管

```sh
npm run build
npm run preview
```

构建产物在 `dist/`，包含两份 HTML 和带内容哈希的资源。Vite 本地构建预览默认端口为 4173，也接受 `VITE_API_TARGET` 进行联调。日常使用可在仓库根目录运行 `npm start`，由聊天服务直接托管构建产物。独立网站部署可上传 `dist/`，并把同域 `/api` 反向代理到聊天服务。前端演示数据由 Vite 预览服务提供。

## 验证

```sh
npm run check
npm run build
npm exec -- playwright-core install chromium
npm run test:e2e
```

已有 Chromium 或 Chrome 时，可省略浏览器安装，使用 `CHROMIUM_PATH=/path/to/chrome npm run test:e2e`。浏览器测试需要 Node.js 24，覆盖群聊和多窗口、附件和执行结果、团队管理、开发代理及构建预览。测试使用临时数据和本地 Harness 适配器。
