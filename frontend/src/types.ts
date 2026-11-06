export interface Person {
  id: string;
  name: string;
  role: string;
}

export interface Room {
  id: string;
  name: string;
  app_id?: string | null;
  member_ids: string[];
  message_count?: number;
}

export type DeletedRoom = Pick<Room, 'id' | 'name'>;

export interface AppOption {
  id: string;
  name: string;
}

export interface BridgeStatus {
  connected: boolean;
  note?: string;
  runtime?: string;
  router?: string;
}

export interface UploadedImage {
  id: string;
  name: string;
  path: string;
  url: string;
  mime: string;
}

export interface VersionPreview {
  revision: string;
  status: 'preview' | 'verified' | 'blocked';
  checks: { profile: string; status: 'pending' | 'passed' | 'failed' | 'unavailable'; evidence?: string }[];
  images: { profile: string; url: string }[];
}

export interface Message {
  id: string;
  room_id: string;
  type: 'human' | 'bot';
  person_id?: string;
  author: Pick<Person, 'name' | 'role'>;
  text: string;
  created_at: string;
  delivery?: string;
  stage?: string;
  reply_to?: string | null;
  preview?: VersionPreview;
  attachments?: UploadedImage[];
  artifactDir?: string;
  artifactDirs?: string[];
  progress_count?: number;
  disposition?: string;
  error?: string;
}

export interface ProgressStep {
  role?: string;
  type: string;
  text: string;
}

export interface ChatSnapshot {
  rooms: Room[];
  people: Person[];
  messages: Message[];
  deletedRooms: DeletedRoom[];
  bridge: BridgeStatus;
  revision: string;
}

export interface MessageInput {
  client_id: string;
  person_id: string;
  text: string;
  reply_to: string | null;
  attachments: UploadedImage[];
}

export interface Role {
  id: string;
  name: string;
  persona: string;
  canDelegate: boolean;
  revision?: number;
}

export interface Instance {
  id: string;
  role?: string;
  parent?: string;
  app?: string;
  createdAt: string;
  observedAt?: string;
  loadedRoleRevision?: number;
  catalogError?: string;
  skillCatalogComplete?: boolean;
  skillCatalog?: {
    name: string;
    description: string;
    body?: string;
    bodyError?: string;
    source: string;
    provider: string;
    path?: string;
  }[];
}

export interface Memory {
  id: string;
  title: string;
  body: string;
  source: string;
  scope: string;
  key: string;
  revision: number;
  status: 'proposed' | 'active' | 'retired';
}

export interface Skill {
  id: string;
  name: string;
  owner: string;
  revision: number;
  status: string;
  description: string;
  body: string;
  evidence: string;
}

export interface TeamSnapshot {
  roles: Role[];
  instances: Instance[];
  memories: Memory[];
  skills: Skill[];
  demo?: boolean;
}
