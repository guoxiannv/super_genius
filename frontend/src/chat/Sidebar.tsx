import { useState } from 'react';
import { Avatar } from '../components/ChatParts';
import styles from '../styles/chat.module.css';
import type { Person, Room } from '../types';

export function RoomSidebar({ rooms, people, roomId, onSelect, onCreateRoom, onCreatePerson, onOpenTrash }: {
  rooms: Room[];
  people: Person[];
  roomId: string | null;
  onSelect: (roomId: string) => void;
  onCreateRoom: () => void;
  onCreatePerson: () => void;
  onOpenTrash: () => void;
}) {
  const [search, setSearch] = useState('');
  const query = search.trim().toLowerCase();
  return <>
    <div className={styles.brand}>
      <span className={styles.brandIcon}>a.</span>
      <div>LOCAL ROOM<small>App Factory · 本地实验群</small></div>
    </div>
    <button className={styles.primary} id="new-room" onClick={onCreateRoom}>＋ 创建新群</button>
    <div className={styles.sectionLabel}>会话 <span id="room-count">{rooms.length}</span></div>
    <input
      id="room-search" className={styles.roomSearch} type="search"
      placeholder="搜索群会话…" aria-label="搜索群会话"
      value={search} onChange={event => setSearch(event.target.value)}
    />
    <nav id="room-list" aria-label="群会话">
      {rooms.filter(room => room.name.toLowerCase().includes(query)).map(room => <button
        key={room.id}
        className={room.id === roomId ? `${styles.roomButton} ${styles.active}` : styles.roomButton}
        onClick={() => onSelect(room.id)}
      >
        <strong>{room.name}</strong>
        <small>{`${room.member_ids.length} 人 · ${room.message_count ?? 0} 条消息`}</small>
      </button>)}
    </nav>
    <button id="trash-open" onClick={onOpenTrash}>回收站</button>
    <div className={styles.asideFooter}>
      <div className={styles.sectionLabel}>
        本地人员库 <button id="new-person" aria-label="添加人员" onClick={onCreatePerson}>＋</button>
      </div>
      <div id="people-list">{people.map((person, index) => <PersonItem key={person.id} person={person} index={index} />)}</div>
      <p>独立临时界面 · 聊天保存在本机</p>
    </div>
  </>;
}

export function MembersPanel({ members, onChoose, onAdd, onOpenTeam }: {
  members?: Person[];
  onChoose?: (person: Person) => void;
  onAdd: () => void;
  onOpenTeam: () => void;
}) {
  return <section className={styles.membersPanel}>
    <div className={styles.sectionLabel}>
      群成员 <button id="add-member" disabled={!members} aria-label="添加群成员" onClick={onAdd}>＋</button>
    </div>
    <div id="members">
      {members?.map((person, index) => <PersonItem key={person.id} person={person} index={index} onChoose={onChoose} />)}
    </div>
    <div className={styles.botInfo}>
      <button id="bot-profile" onClick={onOpenTeam}>查看 Agent 档案</button>
      <span className={styles.botIcon}>a.</span>
      <b>app-factory</b><span className={styles.tag}>Agent</span>
      <p>用 @ 唤起；普通讨论可作为上下文转发。回复显示主服务的真实结果。</p>
    </div>
    <div className={styles.tip}>
      <b>多人讨论，一个人也能演练。</b>
      <p>不同窗口独立选择发言身份。消息与人员共享，刷新或重启后仍能继续。</p>
    </div>
  </section>;
}

function PersonItem({ person, index, onChoose }: {
  person: Person;
  index: number;
  onChoose?: (person: Person) => void;
}) {
  return <div className={styles.person}>
    <Avatar name={person.name} index={index} />
    <div><b>{person.name}</b><small>{person.role}</small></div>
    {onChoose && <button className={styles.choose} onClick={() => onChoose(person)}>切换</button>}
  </div>;
}
