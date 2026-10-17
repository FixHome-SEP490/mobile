// The call screen (PO 18/10/2026): the web's buttons, plus the earpiece/loudspeaker switch.
import React from 'react';
import { Modal, Text, TouchableOpacity } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import CallOverlay from './CallOverlay';
import { useCallStore } from '../../store/call.store';

const mockSocket = {
  connect: jest.fn(async () => undefined),
  subscribe: jest.fn(() => () => undefined),
  callReject: jest.fn(async () => ({ ok: true })),
  callEnd: jest.fn(async () => ({ ok: true })),
  callCancel: jest.fn(async () => ({ ok: true })),
};
const mockMedia = { setMuted: jest.fn(), stop: jest.fn() };
const mockAudio = { startRingback: jest.fn(), startRingtone: jest.fn(), startCall: jest.fn(), setLoudspeaker: jest.fn(), stop: jest.fn() };
let mockSignedIn = true;

jest.mock('../../services/chat-socket.service', () => ({ get chatSocketService() { return mockSocket; } }));
jest.mock('../../services/call-native', () => ({ get callAudio() { return mockAudio; } }));
jest.mock('../../services/webrtc-call.service', () => ({
  CallMediaError: class extends Error {},
  get webRtcCallService() { return mockMedia; },
}));
jest.mock('../../api/messaging.api', () => ({ messagingApi: { getConversation: jest.fn() } }));
jest.mock('../../store/auth.store', () => ({
  useAuthStore: (select: (s: { isAuthenticated: boolean }) => unknown) => select({ isAuthenticated: mockSignedIn }),
}));
jest.mock('@expo/vector-icons', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const ReactModule = require('react');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Native = require('react-native');
  return { Ionicons: Object.assign(({ name }: { name: string }) => ReactModule.createElement(Native.Text, null, name), { glyphMap: {} }) };
});

const PEER = { name: 'Thợ Hai', role: 'Kỹ thuật viên' };

async function mount() {
  let tree!: ReactTestRenderer;
  await act(async () => { tree = create(<CallOverlay />); await Promise.resolve(); });
  return tree;
}
const byId = (tree: ReactTestRenderer, id: string) => tree.root.findAllByType(TouchableOpacity).find((n) => n.props.testID === id);
const texts = (tree: ReactTestRenderer) =>
  tree.root.findAllByType(Text).map((n) => (Array.isArray(n.props.children) ? n.props.children.join('') : String(n.props.children ?? '')));

beforeEach(() => {
  jest.clearAllMocks();
  mockSignedIn = true;
  useCallStore.getState().reset();
});
afterEach(() => useCallStore.getState().reset());

describe('CallOverlay', () => {
  it('listens for calls and keeps the socket up while signed in, and shows nothing when idle', async () => {
    const tree = await mount();
    try {
      expect(mockSocket.subscribe).toHaveBeenCalledTimes(1);
      expect(mockSocket.connect).toHaveBeenCalledTimes(1);
      expect(byId(tree, 'call-hangup')).toBeUndefined();
      expect(tree.root.findByType(Modal).props.visible).toBe(false);
    } finally { act(() => tree.unmount()); }
  });

  it('does not listen for calls when signed out', async () => {
    mockSignedIn = false;
    const tree = await mount();
    try {
      expect(mockSocket.subscribe).not.toHaveBeenCalled();
      expect(mockSocket.connect).not.toHaveBeenCalled();
    } finally { act(() => tree.unmount()); }
  });

  it('answers or declines a ringing call', async () => {
    const tree = await mount();
    try {
      await act(async () => { useCallStore.setState({ status: 'incoming', callId: 'call-1', conversationId: 'conv-1', role: 'callee', peer: PEER }); });
      expect(texts(tree)).toEqual(expect.arrayContaining(['Thợ Hai', 'Kỹ thuật viên', 'Nghe', 'Từ chối']));
      expect(byId(tree, 'call-accept')).toBeDefined();
      expect(tree.root.findByType(Modal).props.visible).toBe(true);
      expect(byId(tree, 'call-speaker')).toBeUndefined();
      await act(async () => { byId(tree, 'call-decline')!.props.onPress(); await Promise.resolve(); });
      expect(mockSocket.callReject).toHaveBeenCalledWith('call-1');
    } finally { act(() => tree.unmount()); }
  });

  it('starts on the earpiece and switches to the loudspeaker and back', async () => {
    const tree = await mount();
    try {
      await act(async () => { useCallStore.setState({ status: 'connected', callId: 'call-1', conversationId: 'conv-1', role: 'caller', peer: PEER }); });
      const speaker = () => byId(tree, 'call-speaker')!;
      expect(speaker().props.accessibilityLabel).toBe('Đang bật loa nhỏ, chạm để chuyển loa to');
      expect(texts(tree)).toContain('Loa nhỏ');

      await act(async () => { speaker().props.onPress(); });
      expect(mockAudio.setLoudspeaker).toHaveBeenLastCalledWith(true);
      expect(speaker().props.accessibilityLabel).toBe('Đang bật loa to, chạm để chuyển loa nhỏ');
      expect(speaker().props.accessibilityState.selected).toBe(true);
      expect(texts(tree)).toContain('Loa to');

      await act(async () => { speaker().props.onPress(); });
      expect(mockAudio.setLoudspeaker).toHaveBeenLastCalledWith(false);
      expect(texts(tree)).toContain('Loa nhỏ');
    } finally { act(() => tree.unmount()); }
  });

  it('mutes the microphone and hangs up', async () => {
    const tree = await mount();
    try {
      await act(async () => { useCallStore.setState({ status: 'connected', callId: 'call-1', conversationId: 'conv-1', role: 'caller', peer: PEER }); });
      await act(async () => { byId(tree, 'call-mute')!.props.onPress(); });
      expect(mockMedia.setMuted).toHaveBeenLastCalledWith(true);
      expect(texts(tree)).toContain('Micro đang tắt');
      await act(async () => { byId(tree, 'call-hangup')!.props.onPress(); await Promise.resolve(); });
      expect(mockSocket.callEnd).toHaveBeenCalledWith('call-1');
    } finally { act(() => tree.unmount()); }
  });

  it('offers a call back only when the ended call allows it', async () => {
    const tree = await mount();
    try {
      await act(async () => {
        useCallStore.setState({ status: 'ended', peer: PEER, endInfo: { title: 'Không nghe máy', detail: 'Thợ Hai chưa nghe máy.', canRedial: true, failed: false } });
      });
      expect(byId(tree, 'call-redial')).toBeDefined();
      expect(texts(tree)).toContain('Thợ Hai chưa nghe máy.');
      await act(async () => { byId(tree, 'call-close')!.props.onPress(); });
      expect(useCallStore.getState().status).toBe('idle');

      await act(async () => {
        useCallStore.setState({ status: 'ended', peer: PEER, endInfo: { title: 'Đã kết thúc', detail: '', canRedial: false, failed: false } });
      });
      expect(byId(tree, 'call-redial')).toBeUndefined();
    } finally { act(() => tree.unmount()); }
  });

  it('shows a short notice when there is no call screen', async () => {
    const tree = await mount();
    try {
      await act(async () => { useCallStore.setState({ notice: 'Gọi thoại cần bản cài đặt FixHome đầy đủ (không chạy trong Expo Go).' }); });
      expect(tree.root.findAll((n) => n.props.testID === 'call-notice')).not.toHaveLength(0);
      expect(texts(tree)).toContain('Gọi thoại cần bản cài đặt FixHome đầy đủ (không chạy trong Expo Go).');
    } finally { act(() => tree.unmount()); }
  });
});
