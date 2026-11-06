import { Dialog } from '../components/Dialog';
import styles from '../styles/chat.module.css';
import type { BridgeStatus, Room } from '../types';

export function ChatHeader({ room, active, onOpenTeam, onOpenWindow, onDelete }: {
  room?: Room;
  active: number;
  onOpenTeam: () => void;
  onOpenWindow: () => void;
  onDelete: () => void;
}) {
  const meta = room
    ? `${room.member_ids.length} 位成员 + app-factory${room.app_id ? ' · App: ' + room.app_id : ''} · 本地持久会话`
    : '创建一个群，切换身份，@app-factory。';

  return <header className={styles.header}>
    <div>
      <div className={styles.eyebrow}>TEAM PLAYGROUND</div>
      <h1 id="room-title">{room?.name ?? '让团队在这里聊起来。'}</h1>
      <p id="room-meta">{meta}</p>
    </div>
    <div className={styles.headerActions}>
      <span className={styles.workStatus} id="work-status" hidden={!active}>{active ? `Agent 工作中 · ${active} 项` : ''}</span>
      <button id="team-open" onClick={onOpenTeam}>Agent · 能力与设定</button>
      <button id="open-window" disabled={!room} onClick={onOpenWindow}>↗ 在新窗口打开</button>
      <a id="export" hidden={!room} href={room ? '/api/export?room=' + encodeURIComponent(room.id) : undefined}>导出记录</a>
      <button id="delete-room" disabled={!room} onClick={onDelete}>删除群</button>
    </div>
  </header>;
}

export function ConnectionStatus({ bridge, error, onRefresh }: {
  bridge?: BridgeStatus;
  error: string;
  onRefresh: () => void;
}) {
  const online = !error && bridge?.connected;
  const label = error ? '本地聊天服务未连接：' + error : online
    ? `已连接 ${bridge.runtime || '服务'} · ${bridge.router || 'unknown'}`
    : bridge ? bridge.note || '主服务未连接' : '检查主服务…';
  return <div className={styles.connection}>
    <span className={online ? `${styles.dot} ${styles.online}` : styles.dot} id="status-dot" />
    <span id="bridge-status">{label}</span>
    <button id="refresh" onClick={onRefresh}>刷新</button>
  </div>;
}

export function TeamDrawer({ open, src, onDismiss }: { open: boolean; src?: string; onDismiss: () => void }) {
  return <Dialog id="team-drawer" className={styles.drawer} open={open} onDismiss={onDismiss}>
    <div className={styles.drawerBar}>
      <b>团队 · 能力与设定</b>
      <button id="team-close" onClick={onDismiss}>关闭 ×</button>
    </div>
    <iframe id="team-frame" className={styles.frame} src={src} title="Agent 能力管理" />
  </Dialog>;
}
