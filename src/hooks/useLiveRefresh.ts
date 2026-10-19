// src/hooks/useLiveRefresh.ts
//
// Real-time refresh (PO 18/10/2026: not "reload the page"): while a screen is focused, a socket event that
// concerns it asks the screen to read again, quietly, instead of waiting for the next visit or a pull.
// Events within 150 ms are gathered into one read. After a reconnect nothing was pushed while the socket was
// down, so the screen reads again too (the server also sends `realtime:resync`).
import { useCallback, useEffect, useRef } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { chatSocketService, type LiveEvent, type LiveEventName } from '../services/chat-socket.service';

export const LIVE_REFRESH_DEBOUNCE_MS = 150;

/** `matches` lets a screen skip events about something else (e.g. another order). */
export function useLiveRefresh(
  names: readonly LiveEventName[],
  refresh: () => void,
  matches?: (event: LiveEvent) => boolean,
): void {
  const latest = useRef({ names, refresh, matches });
  useEffect(() => {
    latest.current = { names, refresh, matches };
  });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const schedule = useCallback(() => {
    if (timer.current) return;
    timer.current = setTimeout(() => {
      timer.current = null;
      latest.current.refresh();
    }, LIVE_REFRESH_DEBOUNCE_MS);
  }, []);

  useFocusEffect(useCallback(() => {
    void chatSocketService.connect();
    const unsubscribe = chatSocketService.subscribe({
      onLiveUpdate: (event) => {
        const { names: wanted, matches: accept } = latest.current;
        if (event.name !== 'realtime:resync' && !wanted.includes(event.name)) return;
        if (event.name !== 'realtime:resync' && accept && !accept(event)) return;
        schedule();
      },
      onReconnected: schedule,
    });
    return () => {
      unsubscribe();
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
    };
  }, [schedule]));
}
