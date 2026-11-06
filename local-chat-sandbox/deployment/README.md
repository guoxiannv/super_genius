# Super Genius 域名接入

`https://supergenius.bitfun-platform.com` → Cloudflare Tunnel → `http://127.0.0.1:8791`（认证网关）→ `http://127.0.0.1:8790`（原聊天服务）。

先在仓库根目录按 [本地运行说明](../../README.md#本地运行) 构建前端并启动聊天服务，再在聊天服务目录运行 `node deployment/gateway.mjs`。需要 Node.js 24+。Cloudflare 的 Published application route / Public hostname 应配置该域名，Service 为 `http://127.0.0.1:8791`，保留原始 Host，不设置 HTTP Host Header 覆盖。

网关使用 HTTPS 下的浏览器 Basic 登录，用户名 `admin`。随机密码保存在 `data/tunnel/password`，本机可读的登录说明在 `data/tunnel/login.txt`，文件权限为 0600。它是单个共享访问账户，聊天中的模拟人员不是独立登录账户。以后多人正式使用建议迁移到 Cloudflare Access / 独立用户权限。

Tunnel 程序位于 `data/tunnel/bin/cloudflared`，token 位于 `data/tunnel/token`，启动命令（在本目录的父目录运行）：

```sh
data/tunnel/bin/cloudflared tunnel --no-autoupdate run --token-file data/tunnel/token
```

不要将 token 放到命令参数或 Git。`data/` 全部被忽略。轮换 token 后替换本机文件并重启 Tunnel；轮换密码后重启网关。域名路由不要直接指向 8790，以免绕开网关；聊天服务仍然仅接受 localhost Host。

这是本机 Tunnel 部署：电脑关机、休眠或聊天服务停止会导致网站不可用。未配置开机自启。网关拒绝未知 Host、外部 Origin 和跨站请求；认证覆盖页面、API、媒体和团队配置，转发前移除登录与代理身份头。

验证：`node --test tests/gateway.test.mjs`。外网匿名访问应返回 401，认证后主页和 `/api/state` 应返回 200。
