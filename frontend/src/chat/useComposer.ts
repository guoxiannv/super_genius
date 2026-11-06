import { useCallback, useRef, useState } from 'react';
import { errorMessage, sendMessage } from '../api';
import type { Person, UploadedImage } from '../types';
import { roomStorageKey } from './room-window';
import { useAttachments } from './useAttachments';

export function useComposer({ roomId, windowId, members, notify, onSent }: {
  roomId: string;
  windowId: string;
  members: Person[];
  notify: (message: string) => void;
  onSent: () => Promise<void>;
}) {
  const draftKey = roomStorageKey(windowId, roomId, 'draft');
  const speakerKey = roomStorageKey(windowId, roomId, 'speaker');
  const [draft, setDraft] = useState(() => sessionStorage.getItem(draftKey) || '');
  const [chosenSpeaker, setChosenSpeaker] = useState(() => sessionStorage.getItem(speakerKey));
  const [quoteId, setQuoteId] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const latestDraft = useRef(draft);
  const posting = useRef(false);
  const pending = useRef<{ signature: string; id: string } | null>(null);
  const attachments = useAttachments(notify);
  const speakerId = members.find(person => person.id === chosenSpeaker)?.id ?? members[0]?.id ?? '';

  function changeDraft(value: string) {
    latestDraft.current = value;
    setDraft(value);
    if (value) sessionStorage.setItem(draftKey, value);
    else sessionStorage.removeItem(draftKey);
  }

  function chooseSpeaker(id: string) {
    setChosenSpeaker(id);
    sessionStorage.setItem(speakerKey, id);
  }

  const quote = useCallback((id: string | null) => {
    setQuoteId(id);
    if (id) inputRef.current?.focus();
  }, []);

  async function send() {
    if (posting.current || (!draft.trim() && !attachments.images.length)) return;
    const uploaded: UploadedImage[] = [];
    for (const image of attachments.images) {
      if (image.status !== 'ready') {
        notify('请等待图片上传完成，或重试 / 移除失败图片。');
        return;
      }
      uploaded.push(image.uploaded);
    }

    const body = { person_id: speakerId, text: draft, reply_to: quoteId, attachments: uploaded };
    const signature = JSON.stringify(body);
    if (pending.current?.signature !== signature) pending.current = { signature, id: crypto.randomUUID() };
    posting.current = true;
    setSending(true);
    try {
      await sendMessage(roomId, { ...body, client_id: pending.current.id });
      pending.current = null;
      // A room switch unmounts this composer, so late responses cannot clear another draft.
      if (inputRef.current) {
        attachments.clear();
        if (latestDraft.current === draft) changeDraft('');
        setQuoteId(null);
      }
      await onSent();
      inputRef.current?.focus();
    } catch (error) {
      notify(errorMessage(error));
    } finally {
      posting.current = false;
      setSending(false);
    }
  }

  return { inputRef, draft, changeDraft, speakerId, chooseSpeaker, quoteId, quote, attachments, sending, send };
}
