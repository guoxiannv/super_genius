import { access, cp, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const frontend = fileURLToPath(new URL('../', import.meta.url));
const project = fileURLToPath(new URL('../../', import.meta.url));
export const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);

export async function isolatedBackend(t) {
  const dist = join(frontend, 'dist');
  await access(join(dist, 'index.html')).catch(() => {
    throw new Error('Run npm run build before running the browser suite.');
  });
  const dir = await mkdtemp(join(tmpdir(), 'super-genius-browser-'));
  await Promise.all([
    cp(join(project, 'local-chat-sandbox/src'), join(dir, 'local-chat-sandbox/src'), { recursive: true }),
    cp(join(project, 'app-factory-harness'), join(dir, 'app-factory-harness'), {
      recursive: true, filter: source => source !== join(project, 'app-factory-harness/data'),
    }),
  ]);
  const { createChatServer } = await import(pathToFileURL(join(dir, 'local-chat-sandbox/src/server.mjs')));
  const { Registry } = await import(pathToFileURL(join(dir, 'app-factory-harness/registry.mjs')));
  const submissions = [];
  const events = new Map();
  const app = await createChatServer({
    port: 0,
    staticDir: dist,
    dataFile: join(dir, 'local-chat-sandbox/data/chat.json'),
    adapter: {
      health: async () => ({ runtime: 'Harness 回归适配器', router: 'app-router' }),
      apps: async () => [{ id: 'mall', name: '商城' }],
      submit: async (message, room, quote) => {
        submissions.push({ message, room, quote });
        events.set(message.event_id, {
          project_id: 'local-chat-sandbox',
          event_id: message.event_id,
          thread_id: room.id,
          status: message.text === '等待执行' ? 'running' : 'done',
          stage: '回归适配器已接收',
          outcome: {},
        });
        return { action: 'queued' };
      },
      events: async () => [...events.values()],
    },
  });
  t.after(async () => {
    try { await app.close(); } finally { await rm(dir, { recursive: true, force: true }); }
  });
  return { ...app, dir, Registry, submissions, base: 'http://127.0.0.1:' + app.port };
}
