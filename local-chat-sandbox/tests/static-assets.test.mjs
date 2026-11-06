import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { request } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createChatServer } from '../src/server.mjs';

test('serves a Vite build on the API server without exposing paths outside the build', async t => {
  const temp = await mkdtemp(join(tmpdir(), 'chat-static-'));
  const staticDir = join(temp, 'dist');
  const app = await createChatServer({
    port: 0, staticDir, dataFile: join(temp, 'chat.json'),
    adapter: { health: async () => { throw Error('offline'); } },
  });
  t.after(async () => {
    await app.close();
    await rm(temp, { recursive: true, force: true });
  });
  const base = 'http://127.0.0.1:' + app.port;
  const missingBuild = await fetch(base);
  assert.equal(missingBuild.status, 503);
  assert.match(await missingBuild.text(), /npm run build/);
  assert.equal((await fetch(base + '/api/state')).status, 200);

  await mkdir(join(staticDir, 'assets'), { recursive: true });
  await mkdir(join(staticDir, 'api'));
  const scriptPath = '/assets/chat-D123_abC.js';
  await Promise.all([
    writeFile(join(staticDir, 'index.html'), 'chat page'),
    writeFile(join(staticDir, 'team.html'), 'team page'),
    writeFile(join(staticDir, scriptPath), 'console.log("chat")'),
    writeFile(join(temp, 'outside.css'), 'private'),
    writeFile(join(staticDir, 'assets/theme.css'), 'body {}'),
    writeFile(join(staticDir, 'api/unknown.html'), 'reserved'),
  ]);
  await symlink(join(temp, 'outside.css'), join(staticDir, 'assets/link.css'));
  const home = await fetch(base);
  assert.equal(home.status, 200);
  assert.equal(await home.text(), 'chat page');
  assert.match(home.headers.get('content-type'), /text\/html/);
  assert.match(home.headers.get('cache-control'), /no-cache/);
  assert.match(home.headers.get('content-security-policy'), /script-src 'self'.*frame-ancestors 'self'/);
  const team = await fetch(base + '/team.html?embedded=1');
  assert.equal(team.status, 200);
  assert.equal(await team.text(), 'team page');
  const head = await fetch(base + '/index.html', { method: 'HEAD' });
  assert.equal(head.status, 200);
  assert.equal(head.headers.get('content-length'), String('chat page'.length));
  assert.equal(await head.text(), '');
  const fresh = await fetch(base, { headers: { 'If-None-Match': home.headers.get('etag') } });
  assert.equal(fresh.status, 304);

  const asset = await fetch(base + scriptPath);
  assert.equal(asset.status, 200);
  assert.match(asset.headers.get('content-type'), /text\/javascript/);
  assert.match(asset.headers.get('cache-control'), /immutable/);
  assert.equal(await asset.text(), 'console.log("chat")');
  const theme = await fetch(base + '/assets/theme.css');
  assert.match(theme.headers.get('content-type'), /text\/css/);
  assert.match(theme.headers.get('cache-control'), /no-cache/);
  await theme.text();

  for (const path of [
    '/missing.js', '/assets/link.css', '/assets/%2e%2e/%2e%2e/outside.css', '/%5c..%5coutside.css', '/api%2Funknown.html',
  ]) {
    // Use a raw request so the client does not normalize dot segments for us.
    const status = await new Promise((resolve, reject) => {
      request({ hostname: '127.0.0.1', port: app.port, path }, res => {
        res.resume();
        resolve(res.statusCode);
      }).on('error', reject).end();
    });
    assert.equal(status, 404, path);
  }
  const missingApi = await fetch(base + '/api/unknown.html');
  assert.equal(missingApi.status, 404);
  assert.deepEqual(await missingApi.json(), { error: 'not_found' });
});
