import React from 'react';
import { act, create } from 'react-test-renderer';
import { LIVE_REFRESH_DEBOUNCE_MS, useLiveRefresh, type LiveBatch } from './useLiveRefresh';
import { chatSocketService, type ChatSocketHandlers } from '../services/chat-socket.service';
import { kindsOf, listsNeedRead, mergeKinds, orderPartsFor } from '../services/live-kinds';

jest.mock('@react-navigation/native', () => ({
  useFocusEffect: (effect: () => void | (() => void)) => {
    const R = jest.requireActual<typeof import('react')>('react');
    R.useEffect(effect, [effect]);
  },
}));
jest.mock('../services/chat-socket.service', () => {
  const handlers = new Set<unknown>();
  const service = {
    connected: true,
    connect: jest.fn(async () => undefined),
    subscribe: jest.fn((h: unknown) => { handlers.add(h); return () => handlers.delete(h); }),
    __handlers: handlers,
  };
  return { chatSocketService: service };
});

const service = chatSocketService as unknown as { connected: boolean; __handlers: Set<ChatSocketHandlers> };
const handlers = () => [...service.__handlers];
const emit = (name: string, payload: Record<string, unknown> = {}) =>
  handlers().forEach((h) => h.onLiveUpdate?.({ name: name as never, payload }));
const setConnected = (connected: boolean) => {
  service.connected = connected;
  handlers().forEach((h) => h.onStatusChange?.(connected));
};
const tick = (ms = LIVE_REFRESH_DEBOUNCE_MS + 1) => act(() => { jest.advanceTimersByTime(ms); });

function Probe({ refresh, matches, pollMs }: { refresh: (b: LiveBatch) => void; matches?: Parameters<typeof useLiveRefresh>[2]; pollMs?: number }) {
  useLiveRefresh(['order:updated', 'wallet:updated'], refresh, matches, { pollMs });
  return null;
}

beforeEach(() => { jest.useFakeTimers(); service.connected = true; });
afterEach(() => jest.useRealTimers());

describe('useLiveRefresh', () => {
  it('reads once for a burst of matching events, and ignores other kinds and other orders', () => {
    const refresh = jest.fn();
    let r!: ReturnType<typeof create>;
    act(() => { r = create(<Probe refresh={refresh} matches={(e) => e.payload.id === 'o1'} />); });

    act(() => { emit('booking:updated'); emit('order:updated', { id: 'other' }); });
    tick();
    expect(refresh).not.toHaveBeenCalled();

    act(() => { emit('order:updated', { id: 'o1', kinds: ['evidence'] }); emit('order:updated', { id: 'o1', kinds: ['invoice'] }); });
    expect(refresh).not.toHaveBeenCalled();
    tick();
    expect(refresh).toHaveBeenCalledTimes(1);
    // The burst says everything that changed, so a screen reads only those parts.
    expect(refresh.mock.calls[0][0].kinds).toEqual(['evidence', 'invoice']);

    // A resync always counts and means "anything may have changed".
    act(() => { emit('realtime:resync'); });
    tick();
    expect(refresh).toHaveBeenCalledTimes(2);
    expect(refresh.mock.calls[1][0]).toMatchObject({ kinds: undefined, resync: true });

    act(() => { r.unmount(); });
    expect(handlers()).toHaveLength(0);
  });

  it('treats an order event without kinds (older server) as "anything changed"', () => {
    const refresh = jest.fn();
    act(() => { create(<Probe refresh={refresh} />); });
    act(() => { emit('order:updated', { kinds: ['evidence'] }); emit('order:updated', {}); });
    tick();
    expect(refresh.mock.calls[0][0].kinds).toBeUndefined();
  });

  it('polls only while the socket is down, and reads everything once it is back', () => {
    const refresh = jest.fn();
    service.connected = false;
    act(() => { create(<Probe refresh={refresh} pollMs={30_000} />); });
    act(() => { jest.advanceTimersByTime(30_000); });
    tick();
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(refresh.mock.calls[0][0].resync).toBe(true);

    act(() => setConnected(true));
    act(() => { jest.advanceTimersByTime(90_000); });
    tick();
    expect(refresh).toHaveBeenCalledTimes(1); // no polling while live updates work

    act(() => setConnected(false));
    act(() => { jest.advanceTimersByTime(30_000); });
    tick();
    expect(refresh).toHaveBeenCalledTimes(2);
  });
});

describe('live kinds', () => {
  it('reads only the parts a change touched', () => {
    expect(orderPartsFor(['evidence'])).toEqual({ detail: false, evidence: true, invoice: false, costs: false, parts: false });
    expect(orderPartsFor(['part'])).toMatchObject({ parts: true, detail: false });
    expect(orderPartsFor(['additional_cost'])).toMatchObject({ costs: true, evidence: false });
    expect(orderPartsFor(['status'])).toMatchObject({ detail: true, evidence: true, invoice: true, costs: true, parts: false });
    expect(orderPartsFor(undefined)).toEqual({ detail: true, evidence: true, invoice: true, costs: true, parts: true });
  });

  it('refreshes lists only for what moves an order between lists, never for a photo or a part', () => {
    const batch = (kinds: Parameters<typeof orderPartsFor>[0], names: string[] = ['order:updated']) =>
      ({ events: names.map((name) => ({ name })), kinds, resync: false });
    expect(listsNeedRead(batch(['evidence']))).toBe(false);
    expect(listsNeedRead(batch(['part', 'quotation']))).toBe(false);
    expect(listsNeedRead(batch(['status']))).toBe(true);
    expect(listsNeedRead(batch(undefined))).toBe(true);
    expect(listsNeedRead(batch(['evidence'], ['order:updated', 'invitation:updated']))).toBe(true);
    expect(listsNeedRead({ ...batch(['evidence']), resync: true })).toBe(true);
  });

  it('reads kinds defensively', () => {
    expect(kindsOf({ kinds: ['status', 'bogus'] })).toEqual(['status']);
    expect(kindsOf({ kinds: [] })).toBeUndefined();
    expect(kindsOf({ kinds: 'status' })).toBeUndefined();
    expect(mergeKinds(['b'] as never, ['a'] as never)).toEqual(['a', 'b']);
    expect(mergeKinds(undefined, ['a'] as never)).toBeUndefined();
  });
});
