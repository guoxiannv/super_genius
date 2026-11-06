import type {
  AppOption, BridgeStatus, ChatSnapshot, Memory, Message, MessageInput, Person,
  ProgressStep, Role, Room, Skill, TeamSnapshot, UploadedImage,
} from './types';

async function requestJson<T>(
  path: string,
  { body, signal }: { body?: unknown; signal?: AbortSignal } = {},
): Promise<T> {
  const response = await fetch(path, body === undefined ? { signal } : {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });
  const data = await response.json().catch(() => {
    throw new Error(`本地服务响应无效（HTTP ${response.status}）`);
  });
  if (!response.ok) throw new Error(data?.error || '请求失败');
  return data as T;
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// Chat
type StateResponse = ChatSnapshot | { unchanged: true; revision: string; bridge: BridgeStatus };

export function getChatState(roomId: string | null, revision: string | undefined, signal: AbortSignal) {
  const query = new URLSearchParams({ room: roomId ?? '' });
  if (revision) query.set('since', revision);
  return requestJson<StateResponse>(`/api/state?${query}`, { signal });
}

export function sendMessage(roomId: string, input: MessageInput) {
  return requestJson<Message>(`/api/rooms/${encodeURIComponent(roomId)}/messages`, { body: input });
}

export function retryMessage(id: string) {
  return requestJson<Message>(`/api/messages/${encodeURIComponent(id)}/retry`, { body: {} });
}

export function getProgress(id: string, signal: AbortSignal) {
  return requestJson<{ progress: ProgressStep[] }>(`/api/messages/${encodeURIComponent(id)}/progress`, { signal });
}

export function uploadImage(name: string, data: string, signal: AbortSignal) {
  return requestJson<UploadedImage>('/api/uploads', { body: { name, data }, signal });
}

// Rooms and people
export function listApps(signal: AbortSignal) {
  return requestJson<{ apps: AppOption[] }>('/api/apps', { signal });
}

export function createRoom(input: { name: string; member_ids: string[]; app_id: string | null }) {
  return requestJson<Room>('/api/rooms', { body: input });
}

export function addMember(roomId: string, personId: string) {
  return requestJson<Room>(`/api/rooms/${encodeURIComponent(roomId)}/members`, {
    body: { person_id: personId },
  });
}

export function updateRoomDeletion(roomId: string, action: 'delete' | 'restore') {
  return requestJson<Room>(`/api/rooms/${encodeURIComponent(roomId)}/${action}`, { body: {} });
}

export function createPerson(input: Pick<Person, 'name' | 'role'>) {
  return requestJson<Person>('/api/people', { body: input });
}

// Team studio
export function getTeam(signal?: AbortSignal) {
  return requestJson<TeamSnapshot>('/api/team', { signal });
}

export function saveRole(body: Pick<Role, 'id' | 'revision' | 'name' | 'persona'>) {
  return requestJson<Role>('/api/team/role', { body });
}

export function reviewMemory(id: string, revision: number, status: 'active' | 'retired') {
  return requestJson<Memory>('/api/team/memory', { body: { id, revision, status } });
}

export function editSkill(body: Pick<Skill, 'id' | 'revision' | 'description' | 'body' | 'evidence'>) {
  return requestJson<Skill>('/api/team/skill/edit', { body });
}

export function activateSkill(id: string, revision: number) {
  return requestJson<Skill>('/api/team/skill', { body: { id, revision } });
}

export function importTemplate(body: unknown) {
  return requestJson<Role>('/api/team/import', { body });
}
