import React from 'react';
import { Text, TextInput, TouchableOpacity } from 'react-native';
import { act, create } from 'react-test-renderer';
import ChatListScreen from './ChatListScreen';
import ChatThreadScreen from './ChatThreadScreen';
import { messagingApi } from '../../api/messaging.api';

jest.mock('../../components/customer/CustomerSkeleton', () => ({ __esModule: true, default: () => null }));
jest.mock('expo-haptics', () => ({
  selectionAsync: jest.fn(),
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: { Medium: 'medium' },
}));

jest.mock('@expo/vector-icons', () => {
  const ReactModule = jest.requireActual<typeof import('react')>('react');
  const { View: NativeView } = jest.requireActual<typeof import('react-native')>('react-native');
  const Icon = () => ReactModule.createElement(NativeView, null);
  return { Ionicons: Icon };
});

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn() }),
  useFocusEffect: (callback: () => void) => callback(),
  useRoute: () => ({
    params: { conversationId: 'conv-1', counterpartName: 'Đối phương' },
  }),
}));

jest.mock('react-native-safe-area-context', () => {
  const ReactModule = jest.requireActual<typeof import('react')>('react');
  const { View: NativeView } = jest.requireActual<typeof import('react-native')>('react-native');
  const Passthrough = ({ children, ...props }: { children?: React.ReactNode }) =>
    ReactModule.createElement(NativeView, props, children);
  return {
    SafeAreaProvider: Passthrough,
    SafeAreaView: Passthrough,
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  };
});
jest.mock('../../api/messaging.api', () => ({
  messagingApi: {
    listConversations: jest.fn(),
    getConversation: jest.fn(),
    listMessages: jest.fn(),
    sendMessage: jest.fn(),
    editMessage: jest.fn(),
    deleteMessage: jest.fn(),
    markRead: jest.fn(),
  },
}));

jest.mock('../../services/chat-socket.service', () => ({
  chatSocketService: {
    connect: jest.fn(async () => undefined),
    subscribe: jest.fn(() => () => undefined),
    joinConversation: jest.fn(),
    forgetConversation: jest.fn(),
    sendTyping: jest.fn(),
  },
}));

const mockedApi = messagingApi as unknown as {
  listConversations: jest.Mock;
  getConversation: jest.Mock;
  listMessages: jest.Mock;
  markRead: jest.Mock;
};

async function flushMicrotasks(times = 3) {
  for (let i = 0; i < times; i += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
}

function visibleText(renderer: ReturnType<typeof create>) {
  return renderer.root
    .findAllByType(Text)
    .map((node) => {
      const children = node.props.children;
      if (typeof children === 'string') return children;
      if (Array.isArray(children))
        return children.filter((child) => typeof child === 'string').join('');
      return '';
    })
    .join('\n');
}

beforeEach(() => {
  jest.clearAllMocks();
  mockedApi.markRead.mockResolvedValue(undefined);
});

describe('ChatListScreen real-UI presentation', () => {
  it('shows the Vietnamese title, loading copy, then honest empty copy without fake actions', async () => {
    mockedApi.listConversations.mockResolvedValue([]);
    let renderer!: ReturnType<typeof create>;
    await act(async () => {
      renderer = create(<ChatListScreen />);
    });
    await flushMicrotasks();

    const text = visibleText(renderer);
    expect(text).toContain('Tin nhắn');
    expect(text).toContain('Chưa có cuộc trò chuyện nào');
    expect(text).toContain('Cuộc trò chuyện sẽ mở ra sau khi bạn đặt lịch');
    // No compose CTA: conversations only open from a received job, never created here.
    expect(
      renderer.root.findAllByProps({ accessibilityLabel: 'Soạn tin nhắn mới' }),
    ).toHaveLength(0);
    // No fabricated delivery, read-receipt, success or address claims.
    expect(text).not.toMatch(/đã gửi thành công|gửi thành công|đã đọc|đã nhận|chưa đọc/i);
    expect(text).not.toMatch(/\b(?:số nhà|đường|phường|quận)\b/i);
  });

  it('renders backend-provided rows and retries after a load failure', async () => {
    mockedApi.listConversations.mockRejectedValue(new Error('offline'));
    let renderer!: ReturnType<typeof create>;
    await act(async () => {
      renderer = create(<ChatListScreen />);
    });
    await flushMicrotasks();

    expect(visibleText(renderer)).toContain('Không tải được danh sách tin nhắn');
    const callsBeforeRetry = mockedApi.listConversations.mock.calls.length;
    mockedApi.listConversations.mockResolvedValue([
      {
        id: 'conv-1',
        bookingId: 'booking-1',
        serviceOrderId: null,
        status: 'active',
        serviceName: 'Sửa điều hòa',
        counterpart: { id: 'user-2', fullName: 'Đối phương', avatarUrl: null, role: 'technician' },
        lastMessageAt: null,
        lastMessagePreview: 'Xin chào',
        unreadCount: 3,
        canSend: true,
      },
    ]);
    await act(async () => {
      renderer.root
        .findByProps({ accessibilityLabel: 'Thử tải lại danh sách tin nhắn' })
        .props.onPress();
    });
    await flushMicrotasks();

    expect(mockedApi.listConversations.mock.calls.length).toBeGreaterThan(callsBeforeRetry);
    const text = visibleText(renderer);
    expect(text).toContain('Đối phương');
    expect(text).toContain('Xin chào');
    expect(
      renderer.root.findAll(
        (node) =>
          node.type === TouchableOpacity &&
          node.props.accessibilityLabel === 'Cuộc trò chuyện với Đối phương',
      ),
    ).toHaveLength(1);
  });
});

describe('ChatThreadScreen real-UI presentation', () => {
  function mockThreadLoaded(canSend: boolean) {
    mockedApi.getConversation.mockResolvedValue({
      id: 'conv-1',
      bookingId: 'booking-1',
      serviceOrderId: null,
      status: 'active',
      serviceName: null,
      counterpart: { id: 'user-2', fullName: 'Đối phương', avatarUrl: null, role: 'technician' },
      lastMessageAt: null,
      lastMessagePreview: null,
      unreadCount: 0,
      canSend,
    });
    mockedApi.listMessages.mockResolvedValue({ data: [], nextBefore: null });
  }

  it('shows the real counterpart name with an honest empty state and labelled composer', async () => {
    mockThreadLoaded(true);
    let renderer!: ReturnType<typeof create>;
    await act(async () => {
      renderer = create(<ChatThreadScreen />);
    });
    await flushMicrotasks();

    const text = visibleText(renderer);
    expect(text).toContain('Đối phương');
    expect(text).toContain('Hãy gửi tin nhắn đầu tiên để trao đổi về công việc.');
    expect(
      renderer.root.findAll(
        (node) =>
          node.type === TextInput && node.props.accessibilityLabel === 'Nhập tin nhắn',
      ),
    ).toHaveLength(1);
    expect(text).not.toMatch(/đã gửi thành công|gửi thành công|đã đọc|đã nhận|đã xem/i);
    expect(text).not.toMatch(/\b(?:số nhà|đường|phường|quận)\b/i);
  });

  it('shows a retryable error instead of a misleading empty state when loading fails', async () => {
    mockedApi.getConversation.mockRejectedValue(new Error('offline'));
    mockedApi.listMessages.mockResolvedValue({ data: [], nextBefore: null });
    let renderer!: ReturnType<typeof create>;
    await act(async () => {
      renderer = create(<ChatThreadScreen />);
    });
    await flushMicrotasks();

    expect(visibleText(renderer)).toContain('Không tải được cuộc trò chuyện');
    const callsBeforeRetry = mockedApi.getConversation.mock.calls.length;
    mockedApi.getConversation.mockResolvedValue({
      id: 'conv-1',
      bookingId: 'booking-1',
      serviceOrderId: null,
      status: 'active',
      serviceName: null,
      counterpart: { id: 'user-2', fullName: 'Đối phương', avatarUrl: null, role: 'technician' },
      lastMessageAt: null,
      lastMessagePreview: null,
      unreadCount: 0,
      canSend: true,
    });
    await act(async () => {
      renderer.root
        .findByProps({ accessibilityLabel: 'Thử tải lại cuộc trò chuyện' })
        .props.onPress();
    });
    await flushMicrotasks();

    expect(mockedApi.getConversation.mock.calls.length).toBeGreaterThan(callsBeforeRetry);
    expect(visibleText(renderer)).toContain('Đối phương');
  });

  it('keeps the send composer hidden until the server confirms chat permission', async () => {
    mockedApi.getConversation.mockImplementation(() => new Promise(() => undefined));
    mockedApi.listMessages.mockImplementation(() => new Promise(() => undefined));
    let renderer!: ReturnType<typeof create>;
    await act(async () => {
      renderer = create(<ChatThreadScreen />);
    });
    expect(visibleText(renderer)).toContain('Đang xác minh quyền nhắn tin');
    expect(renderer.root.findAll((node) =>
      node.type === TextInput && node.props.accessibilityLabel === 'Nhập tin nhắn',
    )).toHaveLength(0);
    expect(renderer.root.findAll((node) =>
      node.type === TouchableOpacity && node.props.accessibilityLabel === 'Gửi tin nhắn',
    )).toHaveLength(0);
    await act(async () => renderer.unmount());
  });

  it('hides the composer and keeps an honest read-only note when sending is not allowed', async () => {
    mockThreadLoaded(false);
    let renderer!: ReturnType<typeof create>;
    await act(async () => {
      renderer = create(<ChatThreadScreen />);
    });
    await flushMicrotasks();

    expect(visibleText(renderer)).toContain(
      'Cuộc trò chuyện này chỉ còn xem lại được.',
    );
    expect(
      renderer.root.findAll(
        (node) =>
          node.type === TextInput && node.props.accessibilityLabel === 'Nhập tin nhắn',
      ),
    ).toHaveLength(0);
    expect(
      renderer.root.findAllByType(TouchableOpacity).filter(
        (node) => node.props.accessibilityLabel === 'Gửi tin nhắn',
      ),
    ).toHaveLength(0);
  });
});
