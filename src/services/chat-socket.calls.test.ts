// Call signalling on the chat socket (PO 18/10/2026): the same events and acknowledgements as the web.
import { CALL_ACK_TIMEOUT_MS, chatSocketService } from './chat-socket.service';

type Listener = (...args: unknown[]) => void;
const mockFakeSocket = {
  connected: false,
  listeners: new Map<string, Listener>(),
  on: jest.fn((event: string, fn: Listener) => { mockFakeSocket.listeners.set(event, fn); }),
  emit: jest.fn(),
  removeAllListeners: jest.fn(),
  disconnect: jest.fn(),
};
const fire = (event: string, payload?: unknown) => mockFakeSocket.listeners.get(event)?.(payload);

jest.mock('socket.io-client', () => ({ io: jest.fn(() => mockFakeSocket) }));
jest.mock('./storage.service', () => ({ storageService: { getToken: jest.fn(async () => 'token') } }));

async function connected() {
  const pending = chatSocketService.connect();
  await Promise.resolve();
  await Promise.resolve();
  mockFakeSocket.connected = true;
  fire('connect');
  await pending;
}

beforeEach(() => {
  chatSocketService.disconnect();
  mockFakeSocket.connected = false;
  mockFakeSocket.listeners.clear();
  jest.clearAllMocks();
});

describe('call signalling on the chat socket', () => {
  it('keeps the STUN/TURN servers handed over on connect:ready and forgets them on disconnect', async () => {
    await connected();
    expect(chatSocketService.iceServers).toEqual([]);
    fire('connect:ready', { iceServers: [{ urls: 'stun:stun.example.test' }] });
    expect(chatSocketService.iceServers).toEqual([{ urls: 'stun:stun.example.test' }]);
    fire('connect:ready', { iceServers: 'nonsense' });
    expect(chatSocketService.iceServers).toEqual([]);
    chatSocketService.disconnect();
    expect(chatSocketService.iceServers).toEqual([]);
  });

  it('passes every call event to the screens listening', async () => {
    await connected();
    const handlers = {
      onCallIncoming: jest.fn(), onCallRinging: jest.fn(), onCallAccepted: jest.fn(), onCallMissed: jest.fn(),
      onCallEnded: jest.fn(), onCallOffer: jest.fn(), onCallAnswer: jest.fn(), onCallIce: jest.fn(),
    };
    const stop = chatSocketService.subscribe(handlers);
    fire('call:incoming', { callId: 'c1', conversationId: 'v1', fromUserId: 'u1' });
    fire('call:ringing', { callId: 'c1' });
    fire('call:accepted', { callId: 'c1' });
    fire('call:missed', { callId: 'c1' });
    fire('call:ended', { callId: 'c1', conversationId: 'v1', reason: 'hangup' });
    fire('call:offer', { callId: 'c1', data: { type: 'offer', sdp: 'o' } });
    fire('call:answer', { callId: 'c1', data: { type: 'answer', sdp: 'a' } });
    fire('call:ice', { callId: 'c1', data: { candidate: 'x' } });
    for (const fn of Object.values(handlers)) expect(fn).toHaveBeenCalledTimes(1);
    expect(handlers.onCallIncoming).toHaveBeenCalledWith({ callId: 'c1', conversationId: 'v1', fromUserId: 'u1' });
    expect(handlers.onCallEnded).toHaveBeenCalledWith({ callId: 'c1', conversationId: 'v1', reason: 'hangup' });
    stop();
    fire('call:incoming', { callId: 'c2', conversationId: 'v1', fromUserId: 'u1' });
    expect(handlers.onCallIncoming).toHaveBeenCalledTimes(1);
  });

  it('asks the server and returns its answer', async () => {
    await connected();
    mockFakeSocket.emit.mockImplementation((_event: string, _payload: unknown, ack?: (a: unknown) => void) => ack?.({ ok: true, callId: 'c1' }));
    await expect(chatSocketService.callInvite('v1')).resolves.toEqual({ ok: true, callId: 'c1' });
    expect(mockFakeSocket.emit).toHaveBeenCalledWith('call:invite', { conversationId: 'v1' }, expect.any(Function));
    await chatSocketService.callAccept('c1');
    await chatSocketService.callReject('c1');
    await chatSocketService.callCancel('c1');
    await chatSocketService.callEnd('c1');
    expect(mockFakeSocket.emit.mock.calls.map((call) => call[0])).toEqual(['call:invite', 'call:accept', 'call:reject', 'call:cancel', 'call:end']);
  });

  it('sends the WebRTC handshake and the ringing step without waiting', async () => {
    await connected();
    chatSocketService.callRinging('c1');
    chatSocketService.sendOffer('c1', { type: 'offer', sdp: 'o' });
    chatSocketService.sendAnswer('c1', { type: 'answer', sdp: 'a' });
    chatSocketService.sendIceCandidate('c1', { candidate: 'x', sdpMid: '0', sdpMLineIndex: 0 });
    expect(mockFakeSocket.emit.mock.calls).toEqual([
      ['call:ringing', { callId: 'c1' }],
      ['call:offer', { callId: 'c1', data: { type: 'offer', sdp: 'o' } }],
      ['call:answer', { callId: 'c1', data: { type: 'answer', sdp: 'a' } }],
      ['call:ice', { callId: 'c1', data: { candidate: 'x', sdpMid: '0', sdpMLineIndex: 0 } }],
    ]);
  });

  it('counts no answer, or no socket, as a refusal so no screen is left ringing', async () => {
    await expect(chatSocketService.callInvite('v1')).resolves.toEqual({ ok: false, reason: 'invalid' });
    await connected();
    jest.useFakeTimers();
    try {
      mockFakeSocket.emit.mockImplementation(() => undefined);
      const pending = chatSocketService.callInvite('v1');
      jest.advanceTimersByTime(CALL_ACK_TIMEOUT_MS);
      await expect(pending).resolves.toEqual({ ok: false, reason: 'invalid' });
    } finally {
      jest.useRealTimers();
    }
  });
});
