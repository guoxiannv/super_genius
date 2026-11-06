import { resolve } from 'node:path';
import { defineConfig } from 'vite';

const apiTarget = process.env.VITE_API_TARGET && new URL(process.env.VITE_API_TARGET);
const apiPath = /^\/api(?:\/|\?|$)/;

function reportOffline(server) {
  server.middlewares.use((req, res, next) => {
    if (!apiPath.test(req.url)) return next();
    res.writeHead(503, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: '当前为前端预览模式' }));
  });
}

export default defineConfig({
  appType: 'mpa',
  input: [resolve(import.meta.dirname, 'index.html'), resolve(import.meta.dirname, 'team.html')],
  plugins: apiTarget ? [] : [{
    name: 'frontend-only-preview',
    configureServer: reportOffline,
    configurePreviewServer: reportOffline,
  }],
  server: {
    host: apiTarget ? '127.0.0.1' : '0.0.0.0',
    port: 3000,
    strictPort: true,
    allowedHosts: apiTarget ? [] : ['.vusercontent.net', '.vercel.run'],
    proxy: apiTarget ? {
      [apiPath.source]: {
        target: apiTarget.origin,
        changeOrigin: true,
        configure(proxy) {
          proxy.on('proxyReq', (outgoing, req) => {
            const { host, origin } = req.headers;
            // Preserve the backend's origin check for requests from other sites.
            if (origin === `http://${host}` || origin === `https://${host}`) {
              outgoing.setHeader('Origin', apiTarget.origin);
            }
          });
        },
      },
    } : undefined,
  },
  preview: { host: '127.0.0.1' },
});
