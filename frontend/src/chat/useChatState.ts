import { useCallback, useEffect, useRef, useState } from 'react';
import { errorMessage, getChatState } from '../api';
import type { ChatSnapshot } from '../types';

export function useChatState(roomId: string | null) {
  const [snapshot, setSnapshot] = useState<ChatSnapshot>();
  const [error, setError] = useState('');
  const refreshRef = useRef<() => Promise<void>>(() => Promise.resolve());
  const refresh = useCallback(() => refreshRef.current(), []);

  useEffect(() => {
    const controller = new AbortController();
    let revision: string | undefined;
    let inFlight: Promise<void> | undefined;
    let queued: Promise<void> | undefined;

    async function fetchState() {
      try {
        const state = await getChatState(roomId, revision, controller.signal);
        if (controller.signal.aborted) return;
        revision = state.revision;
        if (!('unchanged' in state)) setSnapshot(state);
        setError('');
      } catch (error) {
        if (!controller.signal.aborted) setError(errorMessage(error));
      }
    }

    function poll(): Promise<void> {
      if (controller.signal.aborted) return Promise.resolve();
      inFlight ??= fetchState().finally(() => { inFlight = undefined; });
      return inFlight;
    }

    // A mutation may finish while a poll is reading the old state.
    refreshRef.current = () => {
      if (!inFlight) return poll();
      queued ??= inFlight.then(() => {
        queued = undefined;
        return poll();
      });
      return queued;
    };

    const onFocus = () => { void poll(); };
    const interval = window.setInterval(() => {
      if (!document.hidden) void poll();
    }, 3000);
    window.addEventListener('focus', onFocus);
    void poll();

    return () => {
      controller.abort();
      window.clearInterval(interval);
      window.removeEventListener('focus', onFocus);
    };
  }, [roomId]);

  return { snapshot, error, refresh };
}
