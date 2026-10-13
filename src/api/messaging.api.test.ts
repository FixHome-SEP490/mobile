import apiClient from './client';
import { messagingApi, type ConversationItem, type ChatMessage } from './messaging.api';

jest.mock('./client', () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
  },
}));

const get = apiClient.get as jest.Mock;
const CONVERSATION_ID = 'conversation-1';

const conversation: ConversationItem = {
  id: CONVERSATION_ID,
  bookingId: 'booking-1',
  serviceOrderId: null,
  status: 'active',
  serviceName: 'Sửa máy giặt',
  counterpart: {
    id: 'technician-1',
    fullName: 'Kỹ thuật viên',
    avatarUrl: null,
    role: 'technician',
  },
  lastMessageAt: null,
  lastMessagePreview: null,
  unreadCount: 0,
  canSend: true,
};

const message: ChatMessage = {
  id: 'message-1',
  conversationId: CONVERSATION_ID,
  senderId: 'technician-1',
  content: 'Tôi sẽ cập nhật tiến độ sửa chữa.',
  createdAt: '2026-10-11T02:00:00.000Z',
  editedAt: null,
  isDeleted: false,
  clientMessageId: null,
};

beforeEach(() => jest.resetAllMocks());

describe('messagingApi.listConversations', () => {
  it('keeps an empty raw array as a valid empty conversation list', async () => {
    get.mockResolvedValue({ data: [] });

    await expect(messagingApi.listConversations()).resolves.toEqual([]);
    expect(get).toHaveBeenCalledWith('/conversations');
  });

  it('accepts the current transformed envelope with an empty array', async () => {
    get.mockResolvedValue({
      data: { success: true, statusCode: 200, message: 'Success', data: [] },
    });

    await expect(messagingApi.listConversations()).resolves.toEqual([]);
  });

  it('accepts populated current and nested legacy envelopes', async () => {
    get.mockResolvedValue({
      data: {
        success: true,
        statusCode: 200,
        message: 'Success',
        data: [conversation],
      },
    });

    await expect(messagingApi.listConversations()).resolves.toEqual([conversation]);

    get.mockResolvedValue({ data: { data: { data: [conversation] } } });

    await expect(messagingApi.listConversations()).resolves.toEqual([conversation]);
  });

  it.each([
    ['null body', null],
    ['missing data', { success: true }],
    ['null data', { data: null }],
    ['object data', { data: { items: [] } }],
    ['primitive body', 'not an array'],
  ] as [string, unknown][])('rejects a successful response with %s', async (_label, body) => {
    get.mockResolvedValue({ data: body });

    await expect(messagingApi.listConversations()).rejects.toThrow('Invalid conversations response');
  });
});

describe('messagingApi.listMessages', () => {
  it('accepts an empty transformed page and preserves its null cursor', async () => {
    get.mockResolvedValue({
      data: {
        success: true,
        statusCode: 200,
        message: 'Success',
        data: [],
        meta: { nextBefore: null },
      },
    });

    await expect(messagingApi.listMessages(CONVERSATION_ID)).resolves.toEqual({
      data: [],
      nextBefore: null,
    });
    expect(get).toHaveBeenCalledWith('/conversations/' + CONVERSATION_ID + '/messages', {
      params: {},
    });
  });

  it('returns populated messages and the Backend cursor without changing the request query', async () => {
    get.mockResolvedValue({
      data: {
        success: true,
        statusCode: 200,
        message: 'Success',
        data: [message],
        meta: { nextBefore: 'message-cursor-2' },
      },
    });

    await expect(
      messagingApi.listMessages(CONVERSATION_ID, { limit: 20, before: 'message-cursor-1' }),
    ).resolves.toEqual({
      data: [message],
      nextBefore: 'message-cursor-2',
    });
    expect(get).toHaveBeenCalledWith('/conversations/' + CONVERSATION_ID + '/messages', {
      params: { limit: 20, before: 'message-cursor-1' },
    });
  });

  it('keeps the supported raw page envelope shape', async () => {
    get.mockResolvedValue({
      data: { data: [message], meta: { nextBefore: 'legacy-cursor' } },
    });

    await expect(messagingApi.listMessages(CONVERSATION_ID)).resolves.toEqual({
      data: [message],
      nextBefore: 'legacy-cursor',
    });
  });

  it.each([
    ['null body', null],
    ['missing data', { success: true }],
    ['null data', { data: null }],
    ['object data', { data: { items: [] } }],
    ['primitive body', 'not a page'],
  ] as [string, unknown][])('rejects a successful response with %s', async (_label, body) => {
    get.mockResolvedValue({ data: body });

    await expect(messagingApi.listMessages(CONVERSATION_ID)).rejects.toThrow(
      'Invalid messages response',
    );
  });
});
