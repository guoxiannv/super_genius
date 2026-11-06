import type { ChatSnapshot, TeamSnapshot } from '../src/types.ts';

const product = { id: 'demo-product', name: '林晓', role: '产品' };
const room = { id: 'demo-harmony', name: '商城三折叠适配评审', app_id: 'mall', member_ids: [product.id], message_count: 2 };

export const demoState: ChatSnapshot = {
  revision: 'preview-1',
  bridge: { connected: false, note: '演示数据 · 未连接 Harness' },
  rooms: [room],
  people: [product],
  deletedRooms: [],
  messages: [
    {
      id: 'demo-request', room_id: room.id, type: 'human', person_id: product.id, author: product,
      text: '@app-factory 把会议里提到的三折叠适配需求整理成任务。',
      created_at: '2026-11-06T02:00:00Z', delivery: 'done',
    },
    {
      id: 'demo-result', room_id: room.id, type: 'bot', author: { name: 'app-factory', role: 'Agent 演示' },
      text: '已整理三项任务：检查展开态导航、验证多设备布局、收集验证截图。',
      created_at: '2026-11-06T02:01:00Z', delivery: 'done', reply_to: 'demo-request',
    },
  ],
};

export const demoTeam: TeamSnapshot = {
  demo: true,
  roles: [{ id: 'demo-router', name: '幕僚长', persona: '整理需求，分发任务，跟进验证。', canDelegate: true }],
  instances: [],
  memories: [],
  skills: [],
};
