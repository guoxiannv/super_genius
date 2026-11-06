# Super Genius 前端

从本目录运行以下命令。使用 Node.js 22.12+ 或 24，打开 `http://localhost:3000`。团队工作室也可直接访问 `/team.html`。

```sh
npm ci
npm run dev
```

默认预览界面。聊天和团队数据需要现有服务。联调时，先按仓库原有方式启动 `local-chat-sandbox`，然后从本目录运行：

```sh
VITE_API_TARGET=http://127.0.0.1:8790 npm run dev
```

`npm run build` 将两个页面构建到 `dist/`，`npm run preview` 可在本机检查构建产物，也支持通过 `VITE_API_TARGET` 联调。静态部署后需要由部署平台将同源 `/api` 转发给后端。

在 v0 导入包含本目录的 GitHub 分支，将 Root Directory 设为 `frontend`。v0 可识别 Vite。手动启动时，在 v0 Terminal 中进入本目录并运行 `npm ci` 和 `npm run dev`，预览使用 3000 端口。
