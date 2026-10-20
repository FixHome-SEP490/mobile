// src/hooks/useLiveRefresh.ts
//
// Real-time refresh (PO 18/10/2026: not "reload the page"): while a screen is focused, a socket event that
// concerns it asks the screen to read again, quietly, instead of waiting for the next visit or a pull.
// Events within 150 ms are gathered into one read that says everything that changed (`batch.kinds`), so a
// screen can read only that part. After a reconnect or a `realtime:resync` nothing is known about what was
// missed, so the screen reads everything. A screen that must keep up even without live updates asks for
// `pollMs`: it then polls only while the socket is down.
import { useCallback, useEffect, useRef } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { chatSocketService, type LiveEvent, type LiveEventName } from '../services/chat-socket.service';
import { kindsOf, mergeKinds, type OrderChangeKind } from '../services/live-kinds';

export const LIVE_REFRESH_DEBOUNCE_MS = 150;

export interface LiveBatch {
  events: LiveEvent[];
  /** What the order events of this burst touched; undefined when unknown (resync, reconnect, an older server). */
  kinds: OrderChangeKind[] | undefined;
  /** True after a reconnect or `realtime:resync`: everything may have changed. */
  resync: boolean;
}

/** `matches` lets a screen skip events about something else (e.g. another order). */
export function useLiveRefresh(
  names: readonly LiveEventName[],
  refresh: (batch: LiveBatch) => void,
  matches?: (event: LiveEvent) => boolean,
  opts: { pollMs?: number } = {},
): void {
  const latest = useRef({ names, refresh, matches });
  useEffect(() => {
    latest.current = { names, refresh, matches };
  });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<{ events: LiveEvent[]; kinds: OrderChangeKind[] | undefined; seenOrder: boolean; resync: boolean }>(
    { events: [], kinds: undefined, seenOrder: false, resync: false },
  );
  const { pollMs } = opts;

  const schedule = useCallback((event: LiveEvent | null) => {
    const p = pending.current;
    if (event) {
      p.events.push(event);
      if (event.name === 'order:updated') {
        const kinds = kindsOf(event.payload);
        p.kinds = p.seenOrder ? mergeKinds(p.kinds, kinds) : kinds;
        p.seenOrder = true;
      }
      if (event.name === 'realtime:resync') p.resync = true;
    } else {
      p.resync = true;
    }
    if (timer.current) return;
    timer.current = setTimeout(() => {
      timer.current = null;
      const batch: LiveBatch = {
        events: p.events,
        kinds: p.resync ? undefined : p.kinds,
        resync: p.resync,
      };
      pending.current = { events: [], kinds: undefined, seenOrder: false, resync: false };
      latest.current.refresh(batch);
    }, LIVE_REFRESH_DEBOUNCE_MS);
  }, []);

  useFocusEffect(useCallback(() => {
    void chatSocketService.connect();
    let poll: ReturnType<typeof setInterval> | null = null;
    const stopPoll = () => {
      if (poll) clearInterval(poll);
      poll = null;
    };
    const startPoll = () => {
      if (pollMs && !poll) poll = setInterval(() => schedule(null), pollMs);
    };
    if (!chatSocketService.connected) startPoll();

    const unsubscribe = chatSocketService.subscribe({
      onLiveUpdate: (event) => {
        const { names: wanted, matches: accept } = latest.current;
        if (event.name !== 'realtime:resync' && !wanted.includes(event.name)) return;
        if (event.name !== 'realtime:resync' && accept && !accept(event)) return;
        schedule(event);
      },
      onStatusChange: (connected) => (connected ? stopPoll() : startPoll()),
      onReconnected: () => schedule(null),
    });
    return () => {
      unsubscribe();
      stopPoll();
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
      pending.current = { events: [], kinds: undefined, seenOrder: false, resync: false };
    };
  }, [schedule, pollMs]));
}
