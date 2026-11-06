const popupFeatures = 'popup,width=1240,height=850';

export function roomUrl(id: string) {
  const url = new URL('/', location.origin);
  url.searchParams.set('room', id);
  url.searchParams.set('window', crypto.randomUUID());
  return url.href;
}

export function openRoomWindow(url: string) {
  const popup = window.open(url, '_blank', popupFeatures);
  if (popup) popup.opener = null;
  return popup;
}

export function roomStorageKey(windowId: string, roomId: string, field: 'speaker' | 'draft') {
  return `local-chat:${windowId}:${roomId}:${field}`;
}
