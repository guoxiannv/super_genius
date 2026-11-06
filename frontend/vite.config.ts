import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv, type Connect, type Plugin } from 'vite';
import { demoState, demoTeam } from './preview/demo-data.ts';

const apiPath = /^\/api(?:\/|\?|$)/;

function previewApi(mock: boolean): Plugin {
  const middleware: Connect.NextHandleFunction = (req, res, next) => {
    if (!req.url || !apiPath.test(req.url)) return next();
    const path = new URL(req.url, 'http://localhost').pathname;
    const fixture = mock && req.method === 'GET' ? {
      '/api/state': demoState,
      '/api/team': demoTeam,
      '/api/apps': { apps: [] },
    }[path] : undefined;
    const status = fixture ? 200 : mock ? 403 : 503;
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(fixture ?? {
      error: mock ? '当前为只读演示，请连接后端进行操作' : '当前为前端预览模式',
    }));
  };
  return {
    name: 'frontend-preview-api',
    configureServer(server) { server.middlewares.use(middleware); },
    configurePreviewServer(server) { server.middlewares.use(middleware); },
  };
}

export default defineConfig(({ mode }) => {
  const root = import.meta.dirname;
  const env = loadEnv(mode, root, 'VITE_');
  const mock = mode === 'mock';
  const target = !mock && env.VITE_API_TARGET ? new URL(env.VITE_API_TARGET) : null;
  if (target && !['http:', 'https:'].includes(target.protocol)) {
    throw new Error('VITE_API_TARGET 必须是 HTTP 或 HTTPS 地址');
  }

  return {
    appType: 'mpa',
    plugins: [react(), ...(!target ? [previewApi(mock)] : [])],
    css: { modules: { localsConvention: 'camelCaseOnly' } },
    build: {
      assetsInlineLimit: 0,
      rolldownOptions: {
        input: [resolve(root, 'index.html'), resolve(root, 'team.html')],
      },
    },
    server: {
      host: target ? '127.0.0.1' : '0.0.0.0',
      port: 3000,
      strictPort: true,
      allowedHosts: target ? [] : ['.vusercontent.net', '.vercel.run'],
      proxy: target ? {
        [apiPath.source]: {
          target: target.origin,
          changeOrigin: true,
          configure(proxy) {
            proxy.on('proxyReq', (outgoing, req) => {
              const { host, origin } = req.headers;
              // The backend checks Origin. Translate only this dev server's own origin.
              if (host && (origin === `http://${host}` || origin === `https://${host}`)) {
                outgoing.setHeader('Origin', target.origin);
              }
            });
          },
        },
      } : undefined,
    },
    preview: { host: '127.0.0.1' },
  };
});
