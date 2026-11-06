import { useEffect, useState, type FormEvent } from 'react';
import { addMember, createPerson, createRoom, errorMessage, listApps, updateRoomDeletion } from '../api';
import { Dialog } from '../components/Dialog';
import styles from '../styles/chat.module.css';
import type { AppOption, DeletedRoom, Person, Room } from '../types';
import { openRoomWindow, roomUrl } from './room-window';

type CreateRoomDialogProps = {
  open: boolean;
  people: Person[];
  onCreated: (id: string) => void;
  onDismiss: () => void;
  notify: (message: string) => void;
};

export function CreateRoomDialog({ open, onDismiss, ...props }: CreateRoomDialogProps) {
  return <Dialog id="room-dialog" open={open} onDismiss={onDismiss} aria-labelledby="room-dialog-title">
    {open && <CreateRoomForm onDismiss={onDismiss} {...props} />}
  </Dialog>;
}

function CreateRoomForm({ people, onCreated, onDismiss, notify }: Omit<CreateRoomDialogProps, 'open'>) {
  const [apps, setApps] = useState<AppOption[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    void listApps(controller.signal).then(({ apps }) => setApps(apps)).catch(() => {
      // App binding is optional when the adapter's App list is unavailable.
    });
    return () => controller.abort();
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    const form = new FormData(event.currentTarget);
    const newWindow = form.has('new-window');
    const popup = newWindow ? openRoomWindow('about:blank') : null;
    try {
      const room = await createRoom({
        name: String(form.get('name')),
        member_ids: form.getAll('members').map(String),
        app_id: String(form.get('app') || '') || null,
      });
      onCreated(room.id);
      if (popup && !popup.closed) popup.location.href = roomUrl(room.id);
      else if (newWindow) notify('新群已创建；弹窗被阻止，已在当前窗口打开。');
    } catch (error) {
      popup?.close();
      notify(errorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  return <form id="room-form" onSubmit={submit}>
    <div className={styles.eyebrow}>NEW CONVERSATION</div>
    <h2 id="room-dialog-title">创建一个新群</h2>
    <label>群名称<input name="name" id="room-name" required maxLength={80} placeholder="例如：商城一多适配评审" /></label>
    <label>
      关联 App（可选）
      <select id="room-app" name="app">
        <option value="">未绑定 / 由 Agent 询问</option>
        {apps.map(app => <option key={app.id} value={app.id}>{app.name}</option>)}
      </select>
    </label>
    <div className={styles.sectionLabel}>选择群成员</div>
    <div id="member-choices">
      {people.map(person => <label className={styles.check} key={person.id}>
        <input type="checkbox" name="members" value={person.id} defaultChecked />
        {`${person.name} · ${person.role}`}
      </label>)}
    </div>
    <label className={styles.check}><input type="checkbox" name="new-window" id="room-new-window" /> 在独立窗口打开这个群</label>
    <div className={styles.dialogActions}>
      <button type="button" onClick={onDismiss}>取消</button>
      <button className={styles.primary} disabled={saving}>创建群</button>
    </div>
  </form>;
}

export function RecycleBinDialog({ open, rooms, onDismiss, onRestored, notify }: {
  open: boolean;
  rooms: DeletedRoom[];
  onDismiss: () => void;
  onRestored: (roomId: string) => void;
  notify: (message: string) => void;
}) {
  const [restoring, setRestoring] = useState(false);

  async function restore(roomId: string) {
    if (restoring) return;
    setRestoring(true);
    try {
      await updateRoomDeletion(roomId, 'restore');
      onRestored(roomId);
    } catch (error) {
      notify(errorMessage(error));
    } finally {
      setRestoring(false);
    }
  }

  return <Dialog id="trash-dialog" open={open} onDismiss={onDismiss} aria-labelledby="trash-dialog-title">
    <h2 id="trash-dialog-title">群聊回收站</h2>
    <p>删除仅隐藏群记录，不清除 Harness 记忆。执行中的群不能删除。</p>
    <div id="trash-list">
      {rooms.length ? rooms.map(room => <div className={styles.person} key={room.id}>
        <span>{room.name}</span>
        <button disabled={restoring} onClick={() => void restore(room.id)}>恢复</button>
      </div>) : '回收站为空'}
    </div>
    <button onClick={onDismiss}>关闭</button>
  </Dialog>;
}

export function CreatePersonDialog({ open, roomId, onDismiss, refresh, notify }: {
  open: boolean;
  roomId?: string;
  onDismiss: () => void;
  refresh: () => Promise<void>;
  notify: (message: string) => void;
}) {
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    const form = new FormData(event.currentTarget);
    try {
      const person = await createPerson({ name: String(form.get('name')), role: String(form.get('role')) });
      if (roomId) await addMember(roomId, person.id);
      onDismiss();
      await refresh();
      notify(roomId ? '人员已创建并加入当前群' : '人员已创建');
    } catch (error) {
      notify(errorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  return <Dialog id="person-dialog" open={open} onDismiss={onDismiss} aria-labelledby="person-dialog-title">
    {open && <form id="person-form" onSubmit={submit}>
      <div className={styles.eyebrow}>TEAM MEMBER</div>
      <h2 id="person-dialog-title">添加一位成员</h2>
      <label>姓名<input id="person-name" name="name" required maxLength={40} placeholder="例如：许青" /></label>
      <label>职责<input id="person-role" name="role" required maxLength={40} placeholder="产品 / 设计 / 开发 / 测试" /></label>
      <p>创建的是本地模拟身份，不会邀请真实用户。</p>
      <div className={styles.dialogActions}>
        <button type="button" onClick={onDismiss}>取消</button>
        <button className={styles.primary} disabled={saving}>添加人员</button>
      </div>
    </form>}
  </Dialog>;
}

export function AddMemberDialog({ open, room, people, onDismiss, onCreate, refresh, notify }: {
  open: boolean;
  room?: Room;
  people: Person[];
  onDismiss: () => void;
  onCreate: () => void;
  refresh: () => Promise<void>;
  notify: (message: string) => void;
}) {
  const [saving, setSaving] = useState(false);
  const available = people.filter(person => !room?.member_ids.includes(person.id));

  async function add(person: Person) {
    if (!room || saving) return;
    setSaving(true);
    try {
      await addMember(room.id, person.id);
      onDismiss();
      await refresh();
    } catch (error) {
      notify(errorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  return <Dialog id="member-dialog" open={open} onDismiss={onDismiss} aria-labelledby="member-dialog-title">
    <div className={styles.eyebrow}>GROUP MEMBERS</div>
    <h2 id="member-dialog-title">添加群成员</h2>
    <div id="available-members">
      {available.length ? available.map(person => <button
        key={person.id} className={styles.roomButton} disabled={saving} onClick={() => void add(person)}
      >{person.name} · {person.role} ＋</button>) : '所有人员都已在群里，也可以创建新人员。'}
    </div>
    <div className={styles.dialogActions}>
      <button id="create-member" onClick={onCreate}>创建新人员</button>
      <button onClick={onDismiss}>完成</button>
    </div>
  </Dialog>;
}
