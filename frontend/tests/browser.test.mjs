import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { chromium } from 'playwright-core';
import { createServer, preview } from 'vite';
import { frontend, isolatedBackend, png } from './fixture.mjs';

let browser;
before(async () => {
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
});
after(async () => { await browser?.close(); });

async function openPage(t) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  context.setDefaultTimeout(8000);
  const errors = [];
  context.on('page', page => page.on('pageerror', error => errors.push(error.message)));
  t.after(async () => {
    await context.close();
    assert.deepEqual(errors, []);
  });
  return context.newPage();
}

function roomButton(page, name) {
  return page.getByRole('navigation', { name: '群会话' }).getByRole('button', { name, exact: false });
}

async function expectText(locator, text) {
  await locator.getByText(text, { exact: false }).waitFor();
}

async function expectValue(locator, expected) {
  assert.equal(await locator.inputValue(), expected);
}

async function downloadJson(page, link) {
  const pending = page.waitForEvent('download');
  await link.click();
  const download = await pending;
  return JSON.parse(await readFile(await download.path(), 'utf8'));
}

async function seedRoom(backend, name) {
  return backend.store.createRoom({ name, member_ids: backend.store.data.people.map(person => person.id) });
}

function ready(page, base, room) {
  return page.goto(room ? base + '/?room=' + room.id : base).then(() => (
    expectText(page.locator('#bridge-status'), '已连接 Harness 回归适配器')
  ));
}

test('built chat keeps room, people, windows, composer and export flows', async t => {
  const backend = await isolatedBackend(t);
  const page = await openPage(t);
  const otherRoom = await seedRoom(backend, '旧版日志排查');
  await ready(page, backend.base);
  await expectText(page.locator('#messages'), '选择一个群，或创建新群。');
  await page.getByRole('button', { name: '添加人员', exact: true }).click();
  await page.getByLabel('姓名').fill('许青');
  await page.getByLabel('职责').fill('测试');
  await page.locator('#person-dialog').getByRole('button', { name: '添加人员' }).click();
  await expectText(page.locator('#people-list'), '许青');

  await page.locator('#new-room').click();
  await page.locator('#room-name').fill('商城三折叠评审');
  await page.getByRole('option', { name: '商城', exact: true }).waitFor({ state: 'attached' });
  await page.locator('#room-app').selectOption('mall');
  await page.getByRole('checkbox', { name: /许青/ }).uncheck();
  await page.locator('#room-new-window').check();
  const popupPromise = page.waitForEvent('popup');
  await page.locator('#room-dialog').getByRole('button', { name: '创建群' }).click();
  const createdWindow = await popupPromise;
  await expectText(createdWindow.locator('#room-title'), '商城三折叠评审');
  await expectText(page.locator('#room-meta'), 'App: mall');
  assert.notEqual(new URL(page.url()).searchParams.get('window'), new URL(createdWindow.url()).searchParams.get('window'));
  await createdWindow.close();

  await page.getByRole('searchbox', { name: '搜索群会话' }).fill('日志');
  await roomButton(page, '商城三折叠评审').waitFor({ state: 'hidden' });
  await roomButton(page, '旧版日志排查').waitFor();
  await page.getByRole('searchbox').clear();
  await roomButton(page, '商城三折叠评审').waitFor();
  await page.locator('#add-member').click();
  await page.getByRole('button', { name: /许青 · 测试/ }).click();
  await expectText(page.locator('#members'), '许青');
  await page.locator('#add-member').click();
  await expectText(page.locator('#member-dialog'), '所有人员都已在群里');
  await page.locator('#create-member').click();
  await page.getByLabel('姓名').fill('韩月');
  await page.getByLabel('职责').fill('开发');
  await page.locator('#person-dialog').getByRole('button', { name: '添加人员' }).click();
  await expectText(page.locator('#members'), '韩月');

  await page.locator('#members').locator('div').filter({ has: page.getByText('许青', { exact: true }) })
    .getByRole('button', { name: '切换' }).click();
  const speaker = page.locator('#speaker');
  const firstSpeaker = await speaker.inputValue();
  assert.equal(await speaker.locator('option:checked').textContent(), '许青 · 测试');
  const composer = page.locator('#message-text');
  await page.getByRole('button', { name: '检查一多适配' }).click();
  await expectValue(composer, '检查当前 App 的一多适配问题');
  await composer.evaluate(input => input.setSelectionRange(0, 0));
  await page.locator('#mention').click();
  await expectValue(composer, '@app-factory 检查当前 App 的一多适配问题');
  await composer.press('Shift+Enter');
  assert.match(await composer.inputValue(), /\n/);
  await composer.dispatchEvent('keydown', { key: 'Enter', isComposing: true });
  assert.equal(backend.store.data.messages.length, 0);
  await composer.fill('@app-factory 请核对适配清单');
  let savedClientId;
  await page.route('**/api/rooms/*/messages', async route => {
    const saved = await route.fetch();
    assert.equal(saved.status(), 201);
    savedClientId = (await saved.json()).client_id;
    await route.fulfill({ status: 503, json: { error: '已保存但响应丢失' } });
  }, { times: 1 });
  await composer.press('Enter');
  await expectText(page.locator('#toast'), '已保存但响应丢失');
  await expectValue(composer, '@app-factory 请核对适配清单');
  const retry = page.waitForResponse(response => response.url().endsWith('/messages') && response.status() === 201);
  await page.locator('#send').click();
  assert.equal((await (await retry).json()).client_id, savedClientId);
  assert.equal(backend.store.data.messages.length, 1);
  const first = page.locator('article[data-message-id]').filter({ hasText: '请核对适配清单' });
  await first.waitFor();
  await expectValue(composer, '');
  await first.getByRole('button', { name: '回复', exact: true }).click();
  await expectText(page.locator('#quote'), '回复 许青');
  await page.getByRole('button', { name: '取消引用' }).click();
  await page.locator('#quote').waitFor({ state: 'hidden' });
  await first.getByRole('button', { name: '回复', exact: true }).click();
  await composer.fill('补充平板验证');
  await page.locator('#send').click();
  await expectText(page.locator('#messages'), '补充平板验证');
  const exported = await downloadJson(page, page.getByRole('link', { name: '导出记录' }));
  assert.equal(exported.room.app_id, 'mall');
  assert.equal(exported.messages.length, 2);
  assert.equal(exported.messages[0].person_id, firstSpeaker);
  assert.equal(exported.messages[1].reply_to, exported.messages[0].id);

  await composer.fill('原窗口草稿');
  const popupOpened = page.waitForEvent('popup');
  await page.locator('#open-window').click();
  const popup = await popupOpened;
  await expectText(popup.locator('#room-title'), '商城三折叠评审');
  await expectValue(popup.locator('#message-text'), '');
  assert.notEqual(await popup.locator('#speaker').inputValue(), firstSpeaker);
  await popup.locator('#speaker').selectOption({ label: '韩月 · 开发' });
  await popup.locator('#message-text').fill('独立窗口草稿');
  await popup.reload();
  await popup.locator('#message-text').waitFor();
  await expectValue(popup.locator('#message-text'), '独立窗口草稿');
  assert.equal(await popup.locator('#speaker option:checked').textContent(), '韩月 · 开发');
  await expectValue(composer, '原窗口草稿');
  await roomButton(page, otherRoom.name).click();
  await expectText(page.locator('#room-title'), otherRoom.name);
  await expectValue(composer, '');
  await composer.fill('日志草稿');
  await roomButton(page, '商城三折叠评审').click();
  await expectValue(composer, '原窗口草稿');
  await expectValue(speaker, firstSpeaker);
  await popup.close();

  await page.locator('#delete-room').click();
  await roomButton(page, '商城三折叠评审').waitFor({ state: 'hidden' });
  assert.equal(new URL(page.url()).searchParams.has('room'), false);
  await page.locator('#trash-open').click();
  await expectText(page.locator('#trash-list'), '商城三折叠评审');
  await page.getByRole('button', { name: '恢复', exact: true }).click();
  await expectText(page.locator('#room-title'), '商城三折叠评审');
  await expectText(page.locator('#messages'), '补充平板验证');
  await page.locator('#trash-open').click();
  await expectText(page.locator('#trash-list'), '回收站为空');
  await page.keyboard.press('Escape');
  await page.locator('#trash-dialog').waitFor({ state: 'hidden' });
});

test('composer shows local previews, handles upload failure, and discards removed or switched uploads', async t => {
  const backend = await isolatedBackend(t);
  const room = await seedRoom(backend, '附件回归');
  const other = await seedRoom(backend, '另一个群');
  const page = await openPage(t);
  await ready(page, backend.base, room);
  const files = page.locator('#image-input');
  const pending = page.locator('#pending-images');
  const fixture = { name: '适配截图.png', mimeType: 'image/png', buffer: png };
  let failUpload;
  const failure = new Promise(resolve => { failUpload = resolve; });
  t.after(failUpload);
  await page.route('**/api/uploads', async route => {
    await failure;
    await route.fulfill({ status: 503, json: { error: '回归模拟上传失败' } }).catch(() => {});
  }, { times: 1 });
  const selected = page.waitForEvent('filechooser');
  await page.locator('#attach').click();
  await (await selected).setFiles(fixture);
  await expectText(pending, '上传中…');
  assert.match(await pending.getByRole('img').getAttribute('src'), /^blob:/);
  await page.locator('#send').click();
  await expectText(page.locator('#toast'), '请等待图片上传完成');
  failUpload();
  await expectText(pending, '回归模拟上传失败');
  await pending.getByRole('button', { name: '重试', exact: true }).click();
  await expectText(pending, '已上传');
  await page.locator('#send').click();
  const sent = page.locator('#messages').getByRole('img', { name: fixture.name });
  await sent.waitFor();
  assert.match(await sent.getAttribute('src'), /^\/api\/media\?path=/);
  await page.waitForFunction(() => document.querySelector('#messages img')?.naturalWidth === 1);

  await page.locator('#message-text').evaluate((input, encoded) => {
    const data = new DataTransfer();
    const bytes = Uint8Array.from(atob(encoded), char => char.charCodeAt(0));
    data.items.add(new File([bytes], '粘贴截图.png', { type: 'image/png' }));
    input.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: data }));
  }, png.toString('base64'));
  await pending.getByRole('img', { name: '粘贴截图.png' }).waitFor();
  await pending.getByRole('button', { name: '移除图片 粘贴截图.png' }).click();
  await pending.getByRole('img').waitFor({ state: 'hidden' });

  await files.setInputFiles({ name: 'text.txt', mimeType: 'text/plain', buffer: Buffer.from('text') });
  await expectText(page.locator('#toast'), '仅支持 PNG、JPEG、WebP 图片');
  await files.setInputFiles({ ...fixture, buffer: Buffer.alloc(6 * 1024 * 1024 + 1) });
  await expectText(page.locator('#toast'), '每张图片最多 6MB');
  let releaseLateUpload;
  let finishLateUpload;
  const heldUpload = new Promise(resolve => { releaseLateUpload = resolve; });
  const lateUploadFinished = new Promise(resolve => { finishLateUpload = resolve; });
  t.after(releaseLateUpload);
  const uploadRequest = page.waitForRequest('**/api/uploads');
  await page.route('**/api/uploads', async route => {
    await heldUpload;
    await route.fulfill({ status: 201, json: { id: 'late-image' } }).catch(() => {});
    finishLateUpload();
  }, { times: 1 });
  await files.setInputFiles(fixture);
  await uploadRequest;
  await expectText(pending, '上传中…');
  await pending.getByRole('button', { name: '移除图片 ' + fixture.name }).click();
  releaseLateUpload();
  await lateUploadFinished;
  await pending.getByRole('img').waitFor({ state: 'hidden' });

  await files.setInputFiles(Array.from({ length: 5 }, (_, index) => ({ ...fixture, name: `图${index}.png` })));
  await expectText(page.locator('#toast'), '每条消息最多 4 张图片');
  assert.equal(await pending.getByRole('img').count(), 4);
  await roomButton(page, other.name).click();
  await expectText(page.locator('#room-title'), other.name);
  await pending.getByRole('img').waitFor({ state: 'hidden' });
  await roomButton(page, room.name).click();
  await expectText(page.locator('#room-title'), room.name);
  assert.equal(await pending.getByRole('img').count(), 0);
});

test('chat renders Agent results and keeps expanded logs, scrolling and the current room during refreshes', async t => {
  const backend = await isolatedBackend(t);
  const room = await seedRoom(backend, 'Agent 回归群');
  const other = await seedRoom(backend, '维护群');
  const person = backend.store.data.people[0];
  const artifactDir = join(backend.dir, 'local-chat-sandbox/data/artifacts');
  const image = join(artifactDir, 'fold.png');
  await mkdir(artifactDir, { recursive: true });
  await writeFile(image, png);
  const artifactUrl = '/api/media?path=' + encodeURIComponent(image);
  const at = new Date().toISOString();
  const common = { room_id: room.id, created_at: at };
  const author = { name: 'app-factory', role: 'DeepSeek Harness' };
  const failed = await backend.store.post(room.id, { person_id: person.id, client_id: 'failing-input', text: '待重试的执行' });
  await backend.store.write(data => {
    Object.assign(data.messages[0], {
      delivery: 'failed', disposition: 'work', error: '可重试的错误',
      progress: [{ role: 'worker', type: 'log', data: { content: '开始验证展开态' } }],
    });
    data.messages.push(
      ...Array.from({ length: 12 }, (_, i) => ({
        ...common, id: 'history-' + i, author: person, type: 'human', person_id: person.id, text: '历史记录 ' + i, delivery: 'observed',
      })),
      {
        ...common, id: 'bot-result', author, type: 'bot', delivery: 'done', reply_to: failed.id,
        text: '验证摘要\n' + '正文细节'.repeat(150) + `\n![截图](${image})\n![无效图](/outside.png)`,
        artifactDirs: [artifactDir],
      },
      {
        ...common, id: 'version-card', author, type: 'bot', delivery: 'done', reply_to: failed.id,
        text: '折叠适配预览',
        preview: {
          revision: 'v2', status: 'preview', images: [{ profile: 'unfolded', url: artifactUrl }],
          checks: [
            { profile: 'phone', status: 'pending' },
            { profile: 'unfolded', status: 'passed', evidence: '展开态截图' },
            { profile: 'tablet', status: 'unavailable' },
          ],
        },
      },
      { id: 'maintenance', room_id: other.id, author: person, type: 'human', text: '排查维护日志', created_at: at },
    );
  });

  const page = await openPage(t);
  const progressRequests = [];
  page.on('request', request => {
    if (request.url().endsWith('/progress')) progressRequests.push(request.url());
  });
  await ready(page, backend.base, room);
  const retryable = page.locator(`[data-message-id="${failed.id}"]`);
  await expectText(retryable, '转发或处理失败');
  assert.equal(progressRequests.length, 0);
  const execution = retryable.locator('details');
  await execution.locator('summary').click();
  await expectText(execution, '开始验证展开态');
  assert.equal(progressRequests.length, 1);
  const list = page.locator('#messages');
  await list.evaluate(element => element.scrollTo({ top: 120, behavior: 'instant' }));
  await page.waitForFunction(() => document.getElementById('messages').scrollTop === 120);
  const poll = page.waitForRequest(request => {
    const url = new URL(request.url());
    return url.pathname === '/api/state' && url.searchParams.has('since');
  });
  await backend.store.write(data => data.messages.push({
    ...common, id: 'new-history', author: person, type: 'human', text: '轮询加载的新增记录', delivery: 'observed',
  }));
  await poll;
  await expectText(list, '轮询加载的新增记录');
  assert.equal(await execution.getAttribute('open'), '');
  assert.equal(await list.evaluate(element => element.scrollTop), 120);

  const bot = page.locator('[data-message-id="bot-result"]');
  await bot.getByText('验证摘要', { exact: true }).waitFor();
  await bot.locator('summary').click();
  await expectText(bot, '正文细节');
  assert.equal(await bot.getByRole('img', { name: 'Harness 实际输出截图' }).count(), 1);
  const card = page.locator('[data-message-id="version-card"]');
  await expectText(card, 'v2 · 预览 · 验证中');
  assert.equal(await card.getByText('折叠展开：通过').getAttribute('title'), '展开态截图');
  await expectText(card, '平板：设备不可用');
  await card.getByRole('button', { name: '基于 v2 继续改' }).click();
  await expectText(page.locator('#quote'), '折叠适配预览');
  await page.locator('#message-text').fill('继续检查平板');
  const sent = page.waitForResponse(response => response.url().endsWith('/messages') && response.status() === 201);
  await page.locator('#send').click();
  assert.equal((await (await sent).json()).reply_to, 'version-card');
  await retryable.getByRole('button', { name: '重试 / 查结果' }).click();
  await retryable.getByRole('button', { name: '重试 / 查结果' }).waitFor({ state: 'hidden' });
  await page.locator('#message-text').fill('等待执行');
  await page.locator('#send').click();
  await expectText(page.locator('#work-status'), 'Agent 工作中');
  await page.locator('#delete-room').click();
  await expectText(page.locator('#toast'), '群里仍有待处理或执行中的任务');

  const stale = await (await fetch(backend.base + '/api/state?room=' + room.id)).json();
  let returnStale;
  const delayed = new Promise(resolve => { returnStale = resolve; });
  t.after(returnStale);
  await page.route(url => url.pathname === '/api/state' && url.searchParams.get('room') === room.id, async route => {
    await delayed;
    await route.fulfill({ json: stale }).catch(() => {});
  }, { times: 1 });
  const previousPoll = page.waitForRequest(request => request.url().includes('/api/state?room=' + room.id));
  await page.locator('#refresh').click();
  await previousPoll;
  await roomButton(page, other.name).click();
  await expectText(list, '排查维护日志');
  returnStale();
  await page.locator('#refresh').click();
  await expectText(page.locator('#room-title'), other.name);
  assert.equal(await list.getByText('折叠适配预览').count(), 0);
  await page.goto(backend.base + '/?room=does-not-exist');
  await expectText(list, '这个群不存在或已移入回收站');
});

test('team page and drawer keep role editing, instance views, memory, Skills and template flows', async t => {
  const backend = await isolatedBackend(t);
  const registry = new backend.Registry();
  const actor = { kind: 'worker', role: 'app-worker', session: 'fixture-worker' };
  t.after(() => registry.close());
  registry.remember(actor, { scope: 'global', title: '多尺寸记录', body: '需要检查导航', source: '回归验证' });
  registry.saveSkill(actor, { name: 'device-check', description: '检查设备布局', body: '运行验证', evidence: '回归验证' });
  registry.put('instance', {
    id: actor.session, role: actor.role, app: 'mall', parent: 'parent-session', createdAt: '2026-11-06',
    observedAt: '2026-11-06', loadedRoleRevision: 0, skillCatalogComplete: true,
    skillCatalog: [{ name: 'loaded-check', description: '观察目录', body: '已加载正文', provider: 'native', source: 'local' }],
  });

  const page = await openPage(t);
  await ready(page, backend.base);
  await page.locator('#bot-profile').click();
  const frame = page.frameLocator('#team-frame');
  await frame.getByRole('heading', { name: '团队工作室' }).waitFor();
  await frame.getByRole('heading', { name: '幕僚长' }).waitFor();
  assert.equal(await frame.getByRole('link', { name: '← 群聊' }).count(), 0);
  await page.locator('#team-close').click();
  await page.locator('#team-drawer').waitFor({ state: 'hidden' });
  await page.locator('#team-open').click();
  await frame.getByRole('heading', { name: '幕僚长' }).waitFor();
  await page.locator('#team-close').click();

  await page.goto(backend.base + '/team.html');
  await page.getByRole('link', { name: '← 群聊' }).waitFor();
  const role = page.locator('#roles article').filter({ has: page.getByRole('heading', { name: '应用工程师', exact: true }) });
  await expectText(role, '1 个历史实例');
  await role.getByRole('textbox', { name: '角色名称' }).fill('适配工程师');
  await role.getByRole('textbox', { name: '角色职责' }).fill('维护展开态布局');
  await role.getByRole('button', { name: '保存设定' }).click();
  await page.locator('#roles').getByRole('heading', { name: '适配工程师' }).waitFor();
  const instance = page.locator('#instances');
  await expectText(instance, 'parent-session');
  await expectText(instance, '角色已加载 v0');
  await instance.locator('summary').filter({ hasText: 'loaded-check' }).click();
  await expectText(instance, '已加载正文');

  const memories = page.locator('#memories');
  await memories.getByRole('button', { name: '归并共享记忆' }).click();
  await expectText(memories, '多尺寸记录 · active');
  await memories.getByRole('button', { name: '退役' }).click();
  await expectText(memories, '多尺寸记录 · retired');

  const skills = page.locator('#skills');
  await skills.getByLabel('用途').fill('检查三折叠布局');
  await skills.getByLabel('步骤与限制').fill('先核对布局，再截图');
  await skills.getByLabel('来源与验证').fill('核对过设备');
  await skills.getByRole('button', { name: '保存为新草稿' }).click();
  await expectText(skills, 'device-check · draft · v2');
  await skills.getByRole('button', { name: '启用此版本' }).click();
  await expectText(skills, 'device-check · active · v3');

  const savedRole = page.locator('#roles article').filter({ has: page.getByRole('heading', { name: '适配工程师', exact: true }) });
  const template = await downloadJson(page, savedRole.getByRole('link', { name: 'Share as template' }));
  assert.equal(template.role.persona, '维护展开态布局');
  assert.equal(template.skills[0].body, '先核对布局，再截图');
  assert.equal('memories' in template, false);
  const input = page.locator('#file');
  const json = (value) => ({ name: 'bot.json', mimeType: 'application/json', buffer: Buffer.from(value) });
  await input.setInputFiles(json('not JSON'));
  await page.locator('#status').filter({ hasText: /JSON/ }).waitFor();
  template.role.name = '适配模板角色';
  await input.setInputFiles(json(JSON.stringify(template)));
  await expectText(page.locator('#preview-text'), '适配模板角色');
  await page.getByRole('button', { name: '取消', exact: true }).click();
  await page.locator('#preview').waitFor({ state: 'hidden' });
  assert.equal(await page.getByRole('heading', { name: '适配模板角色' }).count(), 0);
  await input.setInputFiles(json(JSON.stringify(template)));
  await page.getByRole('button', { name: '创建新角色' }).click();
  await page.getByRole('heading', { name: '适配模板角色' }).waitFor();
  await expectText(skills, 'device-check · draft · v1');
  await expectText(page.locator('#status'), '已导入新角色');
  registry.put('instance', { id: 'new-observation', role: 'app-worker', createdAt: '2026-11-06' });
  await page.locator('#refresh').click();
  await expectText(instance, 'new-observation');
});

test('Vite runs with no backend, with explicit demo data, and through the same-origin API proxy', async t => {
  const backend = await isolatedBackend(t);
  const page = await openPage(t);
  const oldTarget = process.env.VITE_API_TARGET;
  t.after(() => {
    if (oldTarget === undefined) delete process.env.VITE_API_TARGET;
    else process.env.VITE_API_TARGET = oldTarget;
  });

  async function checkServer(start, mode, target, check) {
    process.env.VITE_API_TARGET = target;
    const settings = { host: '127.0.0.1', port: 0, strictPort: true };
    const server = await start({ root: frontend, mode, server: settings, preview: settings, logLevel: 'error' });
    try {
      if ('listen' in server) await server.listen();
      const base = 'http://127.0.0.1:' + server.httpServer.address().port;
      await check(base);
    } finally {
      await page.goto('about:blank');
      await server.close();
    }
  }

  await checkServer(createServer, 'development', '', async base => {
    await page.goto(base);
    await expectText(page.locator('#bridge-status'), '当前为前端预览模式');
    await page.locator('#empty-create').waitFor();
    await page.locator('#team-open').click();
    const frame = page.frameLocator('#team-frame');
    await expectText(frame.locator('#status'), '当前为前端预览模式');
  });
  await checkServer(preview, 'mock', backend.base, async base => {
    await page.goto(base);
    await expectText(page.locator('#bridge-status'), '演示数据 · 未连接 Harness');
    await roomButton(page, '商城三折叠适配评审').click();
    await expectText(page.locator('#messages'), '已整理三项任务');
    await page.locator('#message-text').fill('演示中提交');
    await page.locator('#send').click();
    await expectText(page.locator('#toast'), '当前为只读演示');
    await page.goto(base + '/team.html');
    await expectText(page.locator('#status'), '演示数据 · 未连接 Harness');
  });
  await checkServer(createServer, 'development', backend.base, async base => {
    await ready(page, base);
    await page.locator('#new-room').click();
    await page.locator('#room-name').fill('Vite 联调');
    await page.getByRole('button', { name: '创建群', exact: true }).click();
    await expectText(page.locator('#room-title'), 'Vite 联调');
    await page.locator('#message-text').fill('代理联调');
    await page.locator('#send').click();
    await expectText(page.locator('#messages'), '代理联调');
    const crossOrigin = await fetch(base + '/api/people', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'https://unrelated.example' },
      body: JSON.stringify({ name: '不应写入', role: '测试' }),
    });
    assert.equal(crossOrigin.status, 403);
    assert.equal((await crossOrigin.json()).error, 'origin_rejected');
  });
  await checkServer(preview, 'production', backend.base, async base => {
    await ready(page, base);
    await roomButton(page, 'Vite 联调').click();
    await expectText(page.locator('#messages'), '代理联调');
    await page.goto(base + '/team.html');
    await page.getByRole('heading', { name: '幕僚长' }).waitFor();
  });
});
