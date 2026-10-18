// Voice calls on the phone (PO 18/10/2026): the same life as the web's, plus the speaker switch.
import { useCallStore, callStatusLabel, END_SCREEN_REDIAL_MS, CONNECT_TIMEOUT_MS } from './call.store';
import { CallMediaError } from '../services/webrtc-call.service';

const mockSocket = {
  handlers: [] as Record<string, (...args: any[]) => unknown>[],
  iceServers: [{ urls: 'stun:stun.example.test' }],
  subscribe: jest.fn((h: Record<string, (...args: any[]) => unknown>) => {
    mockSocket.handlers.push(h);
    return () => { mockSocket.handlers = mockSocket.handlers.filter((x) => x !== h); };
  }),
  callInvite: jest.fn(),
  callRinging: jest.fn(),
  callAccept: jest.fn(),
  callReject: jest.fn(),
  callCancel: jest.fn(),
  callEnd: jest.fn(),
  sendOffer: jest.fn(),
  sendAnswer: jest.fn(),
  sendIceCandidate: jest.fn(),
};
const emit = (event: string, payload: unknown) => Promise.all(mockSocket.handlers.map((h) => h[event]?.(payload)));

const mockMedia = {
  acquireMicrophone: jest.fn(),
  open: jest.fn(),
  createOffer: jest.fn(async () => ({ type: 'offer', sdp: 'o' })),
  acceptOffer: jest.fn(async () => ({ type: 'answer', sdp: 'a' })),
  acceptAnswer: jest.fn(),
  addIceCandidate: jest.fn(),
  setMuted: jest.fn(),
  stop: jest.fn(),
};
const mockAudio = { startRingback: jest.fn(), startRingtone: jest.fn(), startCall: jest.fn(), setLoudspeaker: jest.fn(), stop: jest.fn() };

// Getters: jest runs these mocks before the imports, before the doubles above exist.
jest.mock('../services/chat-socket.service', () => ({ get chatSocketService() { return mockSocket; } }));
jest.mock('../services/call-native', () => ({ get callAudio() { return mockAudio; } }));
jest.mock('../services/webrtc-call.service', () => {
  class CallMediaError extends Error {
    kind: string;
    constructor(kind: string, message: string) {
      super(message);
      this.kind = kind;
    }
  }
  return { CallMediaError, get webRtcCallService() { return mockMedia; } };
});
jest.mock('../api/messaging.api', () => ({
  messagingApi: { getConversation: jest.fn(async () => ({ counterpart: { fullName: 'Thợ Hai', role: 'technician' } })) },
}));


const store = () => useCallStore.getState();

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  mockSocket.handlers = [];
  store().reset();
  store().initCallSignalling()();
  store().initCallSignalling();
});
afterEach(() => {
  store().reset();
  jest.useRealTimers();
});

describe('placing a call', () => {
  it('opens the microphone first, rings, connects on the earpiece and switches the speaker', async () => {
    mockSocket.callInvite.mockResolvedValue({ ok: true, callId: 'call-1' });
    await store().startCall('conv-1', { name: 'Thợ Hai', role: 'Kỹ thuật viên' });
    expect(mockMedia.acquireMicrophone.mock.invocationCallOrder[0]).toBeLessThan(mockSocket.callInvite.mock.invocationCallOrder[0]);
    expect(store()).toMatchObject({ status: 'outgoing', callId: 'call-1', role: 'caller', isLoudspeaker: false });
    expect(callStatusLabel(store())).toBe('Đang gọi…');

    await emit('onCallRinging', { callId: 'call-1' });
    expect(store().status).toBe('ringing');
    expect(mockAudio.startRingback).toHaveBeenCalled();

    await emit('onCallAccepted', { callId: 'call-1' });
    expect(store().status).toBe('connecting');
    expect(mockMedia.open).toHaveBeenCalledWith(mockSocket.iceServers, expect.any(Object));
    expect(mockAudio.startCall).toHaveBeenCalledWith(false);
    expect(mockSocket.sendOffer).toHaveBeenCalledWith('call-1', { type: 'offer', sdp: 'o' });

    const handlers = mockMedia.open.mock.calls[0][1];
    handlers.onIceCandidate({ candidate: 'c1', sdpMid: '0', sdpMLineIndex: 0 });
    expect(mockSocket.sendIceCandidate).toHaveBeenCalledWith('call-1', { candidate: 'c1', sdpMid: '0', sdpMLineIndex: 0 });
    handlers.onConnectionStateChange('connected');
    expect(store().status).toBe('connected');
    jest.advanceTimersByTime(65_000);
    expect(callStatusLabel(store())).toBe('1:05');

    store().toggleLoudspeaker();
    expect(store().isLoudspeaker).toBe(true);
    expect(mockAudio.setLoudspeaker).toHaveBeenLastCalledWith(true);
    store().toggleLoudspeaker();
    expect(mockAudio.setLoudspeaker).toHaveBeenLastCalledWith(false);
    store().toggleMute();
    expect(mockMedia.setMuted).toHaveBeenLastCalledWith(true);

    await store().hangUp();
    expect(mockSocket.callEnd).toHaveBeenCalledWith('call-1');
    expect(store().status).toBe('ended');
    expect(store().endInfo?.detail).toBe('Thời lượng 1:05');
    expect(mockMedia.stop).toHaveBeenCalled();
    expect(mockAudio.stop).toHaveBeenCalled();
  });

  it('says why when the microphone cannot open (Expo Go included) and never rings', async () => {
    mockMedia.acquireMicrophone.mockRejectedValueOnce(new CallMediaError('unsupported', 'Gọi thoại cần bản cài đặt FixHome đầy đủ (không chạy trong Expo Go).'));
    await store().startCall('conv-1');
    expect(mockSocket.callInvite).not.toHaveBeenCalled();
    expect(store().status).toBe('idle');
    expect(store().notice).toContain('Expo Go');
  });

  it.each([
    [{ ok: false, reason: 'offline' }, 'Không liên lạc được'],
    [{ ok: false, reason: 'busy' }, 'Máy bận'],
  ])('shows the end screen with "Gọi lại" when the server answers %o', async (answer, title) => {
    mockSocket.callInvite.mockResolvedValue(answer);
    await store().startCall('conv-1', { name: 'Khách Một', role: 'Khách hàng' });
    expect(store()).toMatchObject({ status: 'ended', endInfo: { title, canRedial: true } });
    jest.advanceTimersByTime(END_SCREEN_REDIAL_MS);
    expect(store().status).toBe('idle');
  });

  it('cancels a call still ringing and gives up when the audio never connects', async () => {
    mockSocket.callInvite.mockResolvedValue({ ok: true, callId: 'call-2' });
    await store().startCall('conv-1');
    await store().hangUp();
    expect(mockSocket.callCancel).toHaveBeenCalledWith('call-2');
    expect(store().status).toBe('idle');

    mockSocket.callInvite.mockResolvedValue({ ok: true, callId: 'call-3' });
    await store().startCall('conv-1');
    await emit('onCallAccepted', { callId: 'call-3' });
    jest.advanceTimersByTime(CONNECT_TIMEOUT_MS);
    expect(store()).toMatchObject({ status: 'ended', endInfo: { title: 'Không kết nối được' } });
    expect(mockSocket.callEnd).toHaveBeenCalledWith('call-3');
  });
});

describe('receiving a call', () => {
  it('rings, tells the caller, names the caller from the conversation, and answers', async () => {
    await emit('onCallIncoming', { callId: 'call-9', conversationId: 'conv-9', fromUserId: 'u2' });
    expect(store()).toMatchObject({ status: 'incoming', role: 'callee' });
    expect(mockSocket.callRinging).toHaveBeenCalledWith('call-9');
    expect(mockAudio.startRingtone).toHaveBeenCalled();
    await Promise.resolve();
    expect(store().peer).toEqual({ name: 'Thợ Hai', role: 'Kỹ thuật viên' });

    mockSocket.callAccept.mockResolvedValue({ ok: true });
    await store().acceptCall();
    expect(mockMedia.open).toHaveBeenCalled();
    expect(mockSocket.callAccept).toHaveBeenCalledWith('call-9');
    expect(store().status).toBe('connecting');

    await emit('onCallOffer', { callId: 'call-9', data: { type: 'offer', sdp: 'o' } });
    expect(mockSocket.sendAnswer).toHaveBeenCalledWith('call-9', { type: 'answer', sdp: 'a' });
    await emit('onCallEnded', { callId: 'call-9', conversationId: 'conv-9', reason: 'ended' });
    expect(store()).toMatchObject({ status: 'ended', endInfo: { title: 'Cuộc gọi đã kết thúc', canRedial: false } });
  });

  it('ignores events of another call and a second call while busy', async () => {
    await emit('onCallIncoming', { callId: 'call-1', conversationId: 'conv-1', fromUserId: 'u2' });
    await emit('onCallIncoming', { callId: 'call-2', conversationId: 'conv-2', fromUserId: 'u3' });
    expect(store().callId).toBe('call-1');
    await emit('onCallEnded', { callId: 'other', conversationId: 'conv-1', reason: 'ended' });
    expect(store().status).toBe('incoming');
    await emit('onCallEnded', { callId: 'call-1', conversationId: 'conv-1', reason: 'cancelled' });
    expect(store()).toMatchObject({ status: 'ended', endInfo: { title: 'Cuộc gọi nhỡ' } });
  });

  it('declines, and stops ringing when answered on another device', async () => {
    await emit('onCallIncoming', { callId: 'call-1', conversationId: 'conv-1', fromUserId: 'u2' });
    await store().declineCall();
    expect(mockSocket.callReject).toHaveBeenCalledWith('call-1');
    expect(store().status).toBe('idle');
    await emit('onCallIncoming', { callId: 'call-2', conversationId: 'conv-1', fromUserId: 'u2' });
    await emit('onCallEnded', { callId: 'call-2', conversationId: 'conv-1', reason: 'answered_elsewhere' });
    expect(store().status).toBe('idle');
    expect(mockAudio.stop).toHaveBeenCalled();
  });

  it('ends a live call when the socket drops', async () => {
    await emit('onCallIncoming', { callId: 'call-1', conversationId: 'conv-1', fromUserId: 'u2' });
    await emit('onStatusChange', false);
    expect(store()).toMatchObject({ status: 'ended', endInfo: { title: 'Mất kết nối máy chủ' } });
  });
});
