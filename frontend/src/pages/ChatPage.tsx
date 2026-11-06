import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { errorMessage, retryMessage, updateRoomDeletion } from '../api';
import { ChatHeader, ConnectionStatus, TeamDrawer } from '../chat/ChatHeader';
import { MessageComposer } from '../chat/MessageComposer';
import { ChatLog, MessageList } from '../chat/MessageList';
import { AddMemberDialog, CreatePersonDialog, CreateRoomDialog, RecycleBinDialog } from '../chat/RoomDialogs';
import { MembersPanel, RoomSidebar } from '../chat/Sidebar';
import { openRoomWindow, roomUrl } from '../chat/room-window';
import { useChatState } from '../chat/useChatState';
import { useComposer } from '../chat/useComposer';
import { EmptyState, Toast } from '../components/ChatParts';
import styles from '../styles/chat.module.css';
import type { Message, Person, Room } from '../types';

type Panel = 'room' | 'person' | 'member' | 'trash' | 'team';
const query = () => new URL(location.href).searchParams;

export function ChatPage() {
  const [roomId, setRoomId] = useState(() => query().get('room'));
  const [windowId] = useState(() => query().get('window') || crypto.randomUUID());
  const [panel, setPanel] = useState<Panel | null>(null);
  const [teamSrc, setTeamSrc] = useState<string>();
  const { snapshot, error, refresh } = useChatState(roomId);
  const { message, notify } = useToast();
  const room = snapshot?.rooms.find(room => room.id === roomId);
  const people = snapshot?.people ?? [];
  const messages = useMemo(() => snapshot?.messages.filter(message => message.room_id === roomId) ?? [], [snapshot, roomId]);
  const active = messages.filter(message => message.delivery === 'queued' || message.delivery === 'submitted').length;
  const title = room ? room.name + ' · Local Room' : 'Local Room · App Factory';

  useEffect(() => {
    const url = new URL(location.href);
    url.searchParams.set('window', windowId);
    history.replaceState(history.state, '', url);
  }, [windowId]);
  useEffect(() => { document.title = title; }, [title]);

  function selectRoom(id: string | null) {
    if (roomId === id) {
      void refresh();
      return;
    }
    const url = new URL(location.href);
    if (id) url.searchParams.set('room', id);
    else url.searchParams.delete('room');
    history.replaceState(history.state, '', url);
    setRoomId(id);
  }

  function dismiss(closing: Panel) {
    setPanel(current => current === closing ? null : current);
  }

  function openTeam() {
    setTeamSrc('/team.html?embedded=1&room=' + encodeURIComponent(roomId || ''));
    setPanel('team');
  }

  async function deleteRoom() {
    if (!room) return;
    try {
      await updateRoomDeletion(room.id, 'delete');
      if (query().get('room') === room.id) selectRoom(null);
      await refresh();
      notify('已移入回收站，可恢复。');
    } catch (error) {
      notify(errorMessage(error));
    }
  }

  return <>
    <div className={styles.shell}>
      <aside className={styles.sidebar}>
        <RoomSidebar
          rooms={snapshot?.rooms ?? []} people={people} roomId={roomId} onSelect={selectRoom}
          onCreateRoom={() => setPanel('room')} onCreatePerson={() => setPanel('person')} onOpenTrash={() => setPanel('trash')}
        />
      </aside>
      <main className={styles.main}>
        <ChatHeader room={room} active={active} onOpenTeam={openTeam} onDelete={deleteRoom} onOpenWindow={() => {
          if (room && !openRoomWindow(roomUrl(room.id))) notify('浏览器阻止了弹窗；请允许本地页面弹窗，或在当前窗口打开群。');
        }} />
        <ConnectionStatus bridge={snapshot?.bridge} error={error} onRefresh={refresh} />
        <div className={styles.chatLayout}>
          {room ? <RoomConversation
            key={room.id} room={room} people={people} messages={messages} windowId={windowId}
            onAddMember={() => setPanel('member')} onOpenTeam={openTeam} refresh={refresh} notify={notify}
          /> : <>
            <section className={styles.conversation}>
              <ChatLog>
                {snapshot ? (roomId ? '这个群不存在或已移入回收站，请从左侧选择。' : '选择一个群，或创建新群。')
                  : <EmptyState title="一个窗口，一场讨论。" action={<button id="empty-create" onClick={() => setPanel('room')}>创建第一个群</button>}>
                    添加产品、设计、开发等人员，<br />每条消息都可以用不同身份发送。
                  </EmptyState>}
              </ChatLog>
            </section>
            <MembersPanel onAdd={() => setPanel('member')} onOpenTeam={openTeam} />
          </>}
        </div>
      </main>
    </div>
    <TeamDrawer open={panel === 'team'} src={teamSrc} onDismiss={() => dismiss('team')} />
    <Toast message={message} />
    <CreatePersonDialog open={panel === 'person'} roomId={room?.id} onDismiss={() => dismiss('person')} refresh={refresh} notify={notify} />
    <CreateRoomDialog open={panel === 'room'} people={people} onDismiss={() => dismiss('room')} notify={notify} onCreated={id => {
      dismiss('room');
      selectRoom(id);
    }} />
    <AddMemberDialog
      open={panel === 'member'} room={room} people={people} onDismiss={() => dismiss('member')}
      onCreate={() => setPanel('person')} refresh={refresh} notify={notify}
    />
    <RecycleBinDialog open={panel === 'trash'} rooms={snapshot?.deletedRooms ?? []} onDismiss={() => dismiss('trash')} notify={notify} onRestored={id => {
      dismiss('trash');
      selectRoom(id);
    }} />
  </>;
}

function RoomConversation({ room, people, messages, windowId, onAddMember, onOpenTeam, refresh, notify }: {
  room: Room;
  people: Person[];
  messages: Message[];
  windowId: string;
  onAddMember: () => void;
  onOpenTeam: () => void;
  refresh: () => Promise<void>;
  notify: (message: string) => void;
}) {
  const logRef = useRef<HTMLDivElement>(null);
  const members = people.filter(person => room.member_ids.includes(person.id));
  const composer = useComposer({
    roomId: room.id, windowId, members, notify,
    async onSent() {
      const log = logRef.current;
      log?.scrollTo({ top: log.scrollHeight, behavior: 'instant' });
      await refresh();
    },
  });
  const retry = useCallback(async (id: string) => {
    try {
      await retryMessage(id);
      await refresh();
    } catch (error) {
      notify(errorMessage(error));
    }
  }, [notify, refresh]);

  return <>
    <section className={styles.conversation}>
      <MessageList messages={messages} people={people} logRef={logRef} onQuote={composer.quote} onRetry={retry} />
      <MessageComposer members={members} composer={composer} quoted={messages.find(message => message.id === composer.quoteId)} />
    </section>
    <MembersPanel members={members} onAdd={onAddMember} onOpenTeam={onOpenTeam} onChoose={person => {
      composer.chooseSpeaker(person.id);
      notify('现在以 ' + person.name + ' 发言');
    }} />
  </>;
}

function useToast() {
  const [message, setMessage] = useState('');
  const timer = useRef<number>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const notify = useCallback((text: string) => {
    setMessage(text);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setMessage(''), 5000);
  }, []);
  return { message, notify };
}
