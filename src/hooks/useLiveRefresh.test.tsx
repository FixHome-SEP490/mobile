import React from 'react';
import { act, create } from 'react-test-renderer';
import { LIVE_REFRESH_DEBOUNCE_MS, useLiveRefresh } from './useLiveRefresh';
import { chatSocketService, type ChatSocketHandlers } from '../services/chat-socket.service';

jest.mock('@react-navigation/native', () => ({
  useFocusEffect: (effect: () => void | (() => void)) => {
    const R = jest.requireActual<typeof import('react')>('react');
    R.useEffect(effect, [effect]);
  },
}));
jest.mock('../services/chat-socket.service', () => {
  const handlers = new Set<unknown>();
  return {
    chatSocketService: {
      connect: jest.fn(async () => undefined),
      subscribe: jest.fn((h: unknown) => { handlers.add(h); return () => handlers.delete(h); }),
      __handlers: handlers,
    },
  };
});

const handlers = () => [...((chatSocketService as unknown as { __handlers: Set<ChatSocketHandlers> }).__handlers)];
const emit = (name: string, payload: Record<string, unknown> = {}) =>
  handlers().forEach((h) => h.onLiveUpdate?.({ name: name as never, payload }));

function Probe({ refresh, matches }: { refresh: () => void; matches?: (e: never) => boolean }) {
  useLiveRefresh(['order:updated'], refresh, matches as never);
  return null;
}

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

it('reads once for a burst of matching events, and ignores other kinds and other orders', () => {
  const refresh = jest.fn();
  let r!: ReturnType<typeof create>;
  act(() => { r = create(<Probe refresh={refresh} matches={((e: { payload: { id?: string } }) => e.payload.id === 'o1') as never} />); });

  act(() => { emit('booking:updated'); emit('order:updated', { id: 'other' }); jest.advanceTimersByTime(LIVE_REFRESH_DEBOUNCE_MS + 1); });
  expect(refresh).not.toHaveBeenCalled();

  act(() => { emit('order:updated', { id: 'o1' }); emit('order:updated', { id: 'o1' }); emit('order:updated', { id: 'o1' }); });
  expect(refresh).not.toHaveBeenCalled();
  act(() => { jest.advanceTimersByTime(LIVE_REFRESH_DEBOUNCE_MS + 1); });
  expect(refresh).toHaveBeenCalledTimes(1);

  // A resync always counts, whatever the screen asked for.
  act(() => { emit('realtime:resync'); jest.advanceTimersByTime(LIVE_REFRESH_DEBOUNCE_MS + 1); });
  expect(refresh).toHaveBeenCalledTimes(2);

  act(() => { r.unmount(); });
  expect(handlers()).toHaveLength(0);
});
