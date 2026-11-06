import { realpath, readFile, stat } from 'node:fs/promises';
import { extname, isAbsolute, relative, resolve, sep } from 'node:path';

const contentTypes = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.mjs', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.webp', 'image/webp'],
  ['.avif', 'image/avif'],
  ['.gif', 'image/gif'],
  ['.svg', 'image/svg+xml'],
  ['.ico', 'image/x-icon'],
  ['.woff', 'font/woff'],
  ['.woff2', 'font/woff2'],
  ['.ttf', 'font/ttf'],
  ['.otf', 'font/otf'],
]);

const securityHeaders = {
  'X-Content-Type-Options': 'nosniff',
  'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' blob:; connect-src 'self'; frame-ancestors 'self'; base-uri 'none'",
};
const pageEntries = new Set(['/index.html', '/team.html']);
const hashedAsset = /^\/assets\/[^/]+-[\w-]{8,}\.[\w]+$/;

export async function serveStatic(req, res, directory) {
  const reply = (status, message, headers = {}) => {
    res.writeHead(status, {
      ...securityHeaders,
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store',
      'Content-Length': Buffer.byteLength(message),
      ...headers,
    });
    res.end(req.method === 'HEAD' ? undefined : message);
  };
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return reply(405, 'Method Not Allowed', { Allow: 'GET, HEAD' });
  }

  let pathname;
  try {
    // Inspect the raw path before URL parsing can collapse traversal segments.
    pathname = decodeURIComponent(req.url.split('?')[0]);
  } catch {
    return reply(404, 'Not Found');
  }
  if (pathname === '/') pathname = '/index.html';
  if (!pathname.startsWith('/') || pathname === '/api' || pathname.startsWith('/api/') ||
      /[\\\u0000-\u001f\u007f]/.test(pathname) ||
      pathname.slice(1).split('/').some(part => !part || part.startsWith('.'))) {
    return reply(404, 'Not Found');
  }
  const extension = extname(pathname).toLowerCase();
  const type = contentTypes.get(extension);
  if (!type) return reply(404, 'Not Found');

  try {
    const root = await realpath(directory);
    const file = await realpath(resolve(root, '.' + pathname));
    const fromRoot = relative(root, file);
    if (!fromRoot || fromRoot === '..' || fromRoot.startsWith('..' + sep) || isAbsolute(fromRoot)) {
      return reply(404, 'Not Found');
    }
    const info = await stat(file);
    if (!info.isFile()) return reply(404, 'Not Found');

    const etag = `W/"${info.size.toString(16)}-${Math.trunc(info.mtimeMs).toString(16)}"`;
    const headers = {
      ...securityHeaders,
      'Content-Type': type,
      'Cache-Control': extension !== '.html' && hashedAsset.test(pathname)
        ? 'private, max-age=31536000, immutable'
        : 'private, no-cache',
      ETag: etag,
    };
    if (req.headers['if-none-match']?.split(',').some(value => value.trim() === etag || value.trim() === '*')) {
      res.writeHead(304, headers);
      return res.end();
    }
    const bytes = req.method === 'HEAD' ? undefined : await readFile(file);
    res.writeHead(200, { ...headers, 'Content-Length': bytes?.length ?? info.size });
    return res.end(bytes);
  } catch (error) {
    if (error.code === 'ENOENT' || error.code === 'ENOTDIR') {
      if (pageEntries.has(pathname)) {
        return reply(503, '前端页面尚未构建。请在仓库根目录运行 npm run build，或检查 CHAT_STATIC_DIR。');
      }
      return reply(404, 'Not Found');
    }
    console.error('static_asset_error', error.code);
    return reply(500, '无法读取前端资源');
  }
}
