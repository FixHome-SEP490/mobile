import React from 'react';
import { Alert, Text, TouchableOpacity } from 'react-native';
import { act, create } from 'react-test-renderer';
import ChatThreadScreen from './ChatThreadScreen';
import { messagingApi } from '../../api/messaging.api';
import { attachmentProblem, sendChatAttachment, type SendDeps } from './chat-attachment';

const mockNavigate = jest.fn();
jest.mock('expo-haptics', () => ({ selectionAsync: jest.fn(), impactAsync: jest.fn(), ImpactFeedbackStyle: { Medium: 'medium' } }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('./ChatAttachmentView', () => ({ __esModule: true, default: () => null }));
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate, goBack: jest.fn() }),
  useRoute: () => ({ params: { conversationId: 'conv-1', counterpartName: 'Thợ A' } }),
}));
jest.mock('react-native-safe-area-context', () => {
  const R = jest.requireActual<typeof import('react')>('react');
  const Passthrough = ({ children }: { children?: React.ReactNode }) => R.createElement(R.Fragment, null, children);
  return { SafeAreaProvider: Passthrough, SafeAreaView: Passthrough, useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) };
});
jest.mock('../../api/messaging.api', () => ({
  ...jest.requireActual('../../api/messaging.api'),
  messagingApi: {
    getConversation: jest.fn(), listMessages: jest.fn(), sendMessage: jest.fn(), markRead: jest.fn(), sendAttachment: jest.fn(),
  },
}));
jest.mock('../../services/chat-socket.service', () => ({
  chatSocketService: {
    connect: jest.fn(async () => undefined), subscribe: jest.fn(() => () => undefined),
    joinConversation: jest.fn(), forgetConversation: jest.fn(), sendTyping: jest.fn(),
  },
}));
jest.mock('./chat-attachment', () => ({
  ...jest.requireActual('./chat-attachment'),
  pickChatAttachment: jest.fn(),
  sendChatAttachment: jest.fn(),
}));

const api = messagingApi as unknown as Record<'getConversation' | 'listMessages' | 'markRead', jest.Mock>;
const flush = () => act(async () => { for (let i = 0; i < 6; i++) await new Promise((r) => setTimeout(r, 0)); });
const texts = (r: ReturnType<typeof create>) => r.root.findAllByType(Text).map((n) => [n.props.children].flat().filter((c) => typeof c === 'string').join('')).join('\n');

const conversation = (over: Record<string, unknown> = {}) => ({
  id: 'conv-1', bookingId: 'b1', serviceOrderId: 'o1', status: 'active', serviceName: 'Sửa máy lạnh', orderCode: 'FH-0042',
  counterpart: { id: 'u2', fullName: 'Thợ A', avatarUrl: null, role: 'technician' },
  lastMessageAt: null, lastMessagePreview: null, unreadCount: 0, canSend: true, ...over,
});

async function mount(conv: Record<string, unknown>, messages: unknown[] = []) {
  api.getConversation.mockResolvedValue(conv);
  api.listMessages.mockResolvedValue({ data: messages, nextBefore: null });
  api.markRead.mockResolvedValue(undefined);
  let r!: ReturnType<typeof create>;
  await act(async () => { r = create(<ChatThreadScreen />); });
  await flush();
  return r;
}

beforeEach(() => jest.clearAllMocks());

describe('chat lock after the order completes', () => {
  it('tells the customer why, and sends them to the warranty claim', async () => {
    const r = await mount(conversation({ canSend: false, closedReason: 'order_completed' }));
    expect(texts(r)).toContain('Đơn đã hoàn tất nên cuộc trò chuyện đã khoá. Nếu thiết bị gặp lại vấn đề');
    expect(r.root.findAllByProps({ testID: 'chat-attach' })).toHaveLength(0);
    await act(async () => { r.root.findAllByType(TouchableOpacity).find((t) => t.props.accessibilityLabel === 'Gửi yêu cầu bảo hành')!.props.onPress(); });
    expect(mockNavigate).toHaveBeenCalledWith('CustomerOrderDetail', { serviceOrderId: 'o1', screen: 'CustomerWarranty' });
  });

  it('tells the technician the chat reopens when the customer claims warranty', async () => {
    const r = await mount(conversation({ canSend: false, closedReason: 'order_completed', counterpart: { id: 'u3', fullName: 'Khách', avatarUrl: null, role: 'customer' } }));
    expect(texts(r)).toContain('Khi khách gửi yêu cầu bảo hành, cuộc trò chuyện sẽ mở lại.');
    expect(r.root.findAllByType(TouchableOpacity).some((t) => t.props.accessibilityLabel === 'Gửi yêu cầu bảo hành')).toBe(false);
  });

  it('shows the order code beside the service name', async () => {
    const r = await mount(conversation());
    expect(texts(r)).toContain('Sửa máy lạnh · FH-0042');
  });
});

describe('sending a photo or video', () => {
  it('offers the attach button only where the server lets this person write', async () => {
    const r = await mount(conversation());
    expect(r.root.findAllByProps({ testID: 'chat-attach' }).length).toBeGreaterThan(0);
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    await act(async () => { r.root.findAllByProps({ testID: 'chat-attach' })[0].props.onPress(); });
    expect(alert).toHaveBeenCalledWith('Gửi ảnh hoặc video', expect.any(String), expect.arrayContaining([expect.objectContaining({ text: 'Thư viện' })]));
  });
});

describe('attachment rules', () => {
  const deps = (over: Partial<SendDeps> = {}): SendDeps => ({
    jpeg: jest.fn(async () => 'file:///p.jpg'),
    shrink: jest.fn(async () => null),
    send: jest.fn(async () => ({ id: 'm1' } as never)),
    retry: (async (send: Parameters<SendDeps['retry']>[0]) => send({ onProgress: () => undefined, signal: new AbortController().signal })) as SendDeps['retry'],
    ...over,
  });
  const { sendChatAttachment: realSend } = jest.requireActual('./chat-attachment') as { sendChatAttachment: typeof sendChatAttachment };

  it('refuses what the server would refuse, before uploading', () => {
    expect(attachmentProblem({ kind: 'image', type: 'image/jpeg', sizeBytes: 11 * 1024 * 1024, durationMs: null })).toMatch(/10 MB/);
    expect(attachmentProblem({ kind: 'video', type: 'video/mp4', sizeBytes: 1, durationMs: 90_000 })).toMatch(/60 giây/);
    expect(attachmentProblem({ kind: 'video', type: 'video/avi', sizeBytes: 1, durationMs: 1000 })).toMatch(/Chỉ gửi được/);
    expect(attachmentProblem({ kind: 'image', type: 'image/png', sizeBytes: 1000, durationMs: null })).toBeNull();
  });

  it('re-encodes a photo as JPEG and sends it with its caption and client id', async () => {
    const d = deps();
    await realSend('conv-1', { kind: 'image', uri: 'file:///a.heic', name: 'a.heic', type: 'image/heic', sizeBytes: 500, durationMs: null },
      { caption: 'Máy rò nước', clientMessageId: 'c1' }, d);
    expect(d.send).toHaveBeenCalledWith('conv-1', { uri: 'file:///p.jpg', name: 'a.jpg', type: 'image/jpeg' }, 'Máy rò nước', 'c1', expect.anything());
  });

  it('sends the light copy of a video, and keeps the original when it cannot be shrunk', async () => {
    const picked = { kind: 'video' as const, uri: 'file:///v.mov', name: 'v.mov', type: 'video/quicktime', sizeBytes: 20_000_000, durationMs: 30_000 };
    const small = deps({ shrink: jest.fn(async () => ({ uri: 'file:///v.mp4', type: 'video/mp4' as const, name: 'v.mp4' })) });
    await realSend('conv-1', picked, { clientMessageId: 'c2' }, small);
    expect(small.send).toHaveBeenCalledWith('conv-1', { uri: 'file:///v.mp4', name: 'v.mp4', type: 'video/mp4' }, undefined, 'c2', expect.anything());
    const plain = deps();
    await realSend('conv-1', picked, { clientMessageId: 'c3' }, plain);
    expect(plain.send).toHaveBeenCalledWith('conv-1', { uri: 'file:///v.mov', name: 'v.mov', type: 'video/quicktime' }, undefined, 'c3', expect.anything());
  });

  it('stops a heavy video that could not be made smaller', async () => {
    const d = deps();
    await expect(realSend('conv-1', { kind: 'video', uri: 'file:///v.mp4', name: 'v.mp4', type: 'video/mp4', sizeBytes: 60 * 1024 * 1024, durationMs: 40_000 },
      { clientMessageId: 'c4' }, d)).rejects.toThrow(/50 MB/);
    expect(d.send).not.toHaveBeenCalled();
  });
});
