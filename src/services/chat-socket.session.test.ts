// The chat socket must not outlive the session that opened it.
import { chatSocketService } from './chat-socket.service';
import { useAuthStore } from '../store/auth.store';

type Listener = (...args: unknown[]) => void;
const mockFakeSocket = {
  connected: false,
  listeners: new Map<string, Listener>(),
  on: jest.fn((event: string, fn: Listener) => { mockFakeSocket.listeners.set(event, fn); }),
  emit: jest.fn(),
  removeAllListeners: jest.fn(),
  disconnect: jest.fn(),
};

jest.mock('socket.io-client', () => ({ io: jest.fn(() => mockFakeSocket) }));
jest.mock('./storage.service', () => ({ storageService: { getToken: jest.fn(async () => 'token') } }));

async function connected() {
  const pending = chatSocketService.connect();
  await Promise.resolve();
  await Promise.resolve();
  mockFakeSocket.connected = true;
  mockFakeSocket.listeners.get('connect')?.();
  await pending;
}

beforeEach(() => {
  chatSocketService.disconnect();
  mockFakeSocket.connected = false;
  mockFakeSocket.listeners.clear();
  jest.clearAllMocks();
});

it('drops the socket and its rooms when the user logs out', async () => {
  await connected();
  chatSocketService.joinConversation('c1');
  useAuthStore.getState().logout();
  expect(mockFakeSocket.disconnect).toHaveBeenCalled();
  mockFakeSocket.connected = false;
  jest.clearAllMocks();
  await connected();
  expect(mockFakeSocket.emit).not.toHaveBeenCalledWith('conversation:join', { conversationId: 'c1' });
});

it('drops the socket when another account signs in', async () => {
  const user = (id: string) => ({ id, role: 'customer' }) as never;
  useAuthStore.getState().setAuth('t1', user('a'));
  await connected();
  jest.clearAllMocks();
  useAuthStore.getState().setAuth('t2', user('b'));
  expect(mockFakeSocket.disconnect).toHaveBeenCalled();
});
