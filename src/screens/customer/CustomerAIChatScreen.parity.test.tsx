// The assistant on the phone as on the web (PO 18/10/2026): at most three photos
// and two videos per conversation; videos go to the technician and never to the
// AI; what is sent goes up at once in the background with how far it is; one-tap
// answers, "Đúng ý / Chưa đúng"; booking takes what arrived, and waits for,
// retries or leaves out the rest.
import React from 'react';
import { Alert, Text, TextInput, TouchableOpacity, type AlertButton } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { VIDEO_NOT_ANALYSED } from './ai-chat-logic';
import { ATTACHMENT_LIMIT_TEXT } from './chat-upload-queue';

const mockNavigate = jest.fn();
const mockAnalyze = jest.fn();
const mockAsk = jest.fn();
const mockFeedback = jest.fn();
const mockPickVideo = jest.fn();
const mockRecordVideo = jest.fn();
const mockPick = jest.fn();
const mockJpeg = jest.fn();
const mockUploadPhoto = jest.fn();
const mockUploadVideo = jest.fn();

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate, goBack: jest.fn() }),
  useRoute: () => ({ params: undefined }),
}));
jest.mock('react-native-safe-area-context', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const ReactModule = require('react');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Native = require('react-native');
  return {
    SafeAreaView: ({ children, ...props }: { children: React.ReactNode }) =>
      ReactModule.createElement(Native.View, props, children),
    useSafeAreaInsets: () => ({ top: 0, left: 0, right: 0, bottom: 16 }),
  };
});
jest.mock('@expo/vector-icons', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const ReactModule = require('react');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Native = require('react-native');
  return { Ionicons: ({ name }: { name: string }) => ReactModule.createElement(Native.Text, null, name) };
});
jest.mock('expo-haptics', () => ({
  selectionAsync: jest.fn(),
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: { Heavy: 'Heavy', Medium: 'Medium' },
}));
jest.mock('../../hooks/useKeyboardInset', () => ({ useKeyboardInset: () => 0 }));
jest.mock('../../services/image-for-ai', () => ({
  pickImagesForAi: (...args: unknown[]) => mockPick(...args),
  takePhotoForAi: jest.fn(async () => ({ images: [] })),
  shrinkForRetry: jest.fn(async () => []),
  pickVideoForAi: (...args: unknown[]) => mockPickVideo(...args),
  recordVideoForAi: (...args: unknown[]) => mockRecordVideo(...args),
  jpegForUpload: (...args: unknown[]) => mockJpeg(...args),
}));
jest.mock('../../api/media.api', () => ({
  mediaApi: {
    uploadBookingPhoto: (...args: unknown[]) => mockUploadPhoto(...args),
    uploadBookingVideo: (...args: unknown[]) => mockUploadVideo(...args),
  },
}));
// Expo Go / tests: no compressor, the original goes; picked originals must fit 50 MB.
jest.mock('../../services/video-shrink', () => ({ shrinkVideo: jest.fn(async () => null), canShrinkVideos: () => false }));
// One attempt per upload here; retrying is tested on its own (upload-retry.test.ts).
jest.mock('../../services/upload-retry', () => {
  const actual = jest.requireActual('../../services/upload-retry');
  return {
    ...actual,
    uploadWithRetry: (send: (a: { onProgress: (f: number) => void; signal: AbortSignal }) => Promise<unknown>, opts: { onProgress?: (f: number) => void; signal?: AbortSignal }) =>
      send({ onProgress: opts.onProgress ?? (() => undefined), signal: opts.signal ?? new AbortController().signal }),
  };
});
jest.mock('../../api/ai.api', () => ({
  AI_MAX_IMAGES: 3,
  looksLikeAQuestion: () => false,
  aiApi: {
    acknowledgements: jest.fn(async () => ({})),
    analyze: (...args: unknown[]) => mockAnalyze(...args),
    ask: (...args: unknown[]) => mockAsk(...args),
    feedback: (...args: unknown[]) => mockFeedback(...args),
  },
}));
jest.mock('../chat/TypingDots', () => () => null);

const VIDEO = { uri: 'file:///clip.mov', name: 'clip.mov', type: '', sizeBytes: 2048, durationMs: 23_400 };
const SERVICE = { serviceCode: 'SUA_VOI_NUOC', nameVi: 'Sửa vòi nước', serviceId: 'service-1' };
const REPLY = {
  sessionId: 'session-1',
  status: 'needs_clarification',
  messageVi: 'Dạ có thể gioăng vòi bị mòn ạ.',
  recommendedServices: [SERVICE],
  clarification: { questionsVi: ['Anh/chị đã thử khoá van tổng chưa?'] },
};
const BOOK = `Xem dịch vụ ${SERVICE.nameVi} để tiếp tục đặt lịch`;

async function mountScreen() {
  const { default: Screen } = jest.requireActual('./CustomerAIChatScreen') as { default: React.ComponentType };
  let tree!: ReactTestRenderer;
  await act(async () => { tree = create(React.createElement(Screen)); await Promise.resolve(); });
  return tree;
}
const button = (tree: ReactTestRenderer, label: string) =>
  tree.root.findAllByType(TouchableOpacity).find((node) => node.props.accessibilityLabel === label);
const texts = (tree: ReactTestRenderer) =>
  tree.root.findAllByType(Text).map((node) =>
    Array.isArray(node.props.children) ? node.props.children.join('') : String(node.props.children ?? ''));
const byTestId = (tree: ReactTestRenderer, id: string) => tree.root.findAll((node) => node.props.testID === id);
const settle = () => act(async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); });

/** The reply waits for a short reading beat (900 ms) before it lands. */
async function sendText(tree: ReactTestRenderer, text: string) {
  await act(async () => { tree.root.findByType(TextInput).props.onChangeText(text); });
  await act(async () => {
    button(tree, 'Gửi tin nhắn cho trợ lý')?.props.onPress();
    await new Promise((resolve) => setTimeout(resolve, 950));
  });
  await settle();
}

/** Answers the video Alert with the library choice; other Alerts are recorded. */
function answerAlerts(choice?: string) {
  return jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons?: AlertButton[]) => {
    buttons?.find((b) => b.text === 'Chọn video có sẵn')?.onPress?.();
    if (choice) buttons?.find((b) => b.text === choice)?.onPress?.();
  });
}
async function attachVideo(tree: ReactTestRenderer) {
  await act(async () => { button(tree, 'Gửi video cho kỹ thuật viên')?.props.onPress(); });
  await settle();
}

beforeEach(() => {
  jest.clearAllMocks();
  mockAnalyze.mockResolvedValue(REPLY);
  mockPick.mockResolvedValue({ images: [] });
  mockPickVideo.mockResolvedValue({ video: VIDEO });
  mockRecordVideo.mockResolvedValue({ video: null });
  mockJpeg.mockImplementation(async (uri: string) => `${uri}.jpg`);
  mockUploadPhoto.mockResolvedValue({ uploadId: 'upload-photo-1' });
  mockUploadVideo.mockResolvedValue({ uploadId: 'upload-video-1' });
});

describe('CustomerAIChatScreen parity with the web', () => {
  it('keeps a video away from the AI and sends it up in the background as soon as the message goes', async () => {
    const alert = answerAlerts();
    const tree = await mountScreen();
    try {
      await attachVideo(tree);
      expect(alert).toHaveBeenCalledWith('Gửi video cho kỹ thuật viên', VIDEO_NOT_ANALYSED, expect.any(Array));
      expect(byTestId(tree, 'ai-pending-videos')).not.toHaveLength(0);
      expect(texts(tree).some((t) => t.includes('Video 1/2'))).toBe(true);
      expect(mockUploadVideo).not.toHaveBeenCalled();

      await sendText(tree, 'Vòi rửa chén rỉ nước');
      expect(mockAnalyze.mock.calls[0][0]).toEqual({ description: 'Vòi rửa chén rỉ nước', images: [], sessionId: null });
      expect(JSON.stringify(mockAnalyze.mock.calls)).not.toContain('clip');
      expect(byTestId(tree, 'ai-pending-videos')).toHaveLength(0);
      expect(byTestId(tree, 'ai-message-videos')).not.toHaveLength(0);
      expect(byTestId(tree, 'ai-video-note').length).toBeGreaterThan(0);
      // Without a compressor the original goes, with the type the file name tells.
      expect(mockUploadVideo).toHaveBeenCalledWith({ uri: VIDEO.uri, name: VIDEO.name, type: 'video/quicktime' }, expect.objectContaining({ signal: expect.anything() }));
      expect(texts(tree)).toContain('Video đã gửi kèm cho thợ');
    } finally {
      alert.mockRestore();
      act(() => tree.unmount());
    }
  });

  it('allows two videos and three photos in the whole conversation, and no clip over a minute', async () => {
    const alert = answerAlerts();
    const tree = await mountScreen();
    try {
      for (let i = 0; i < 2; i += 1) {
        mockPickVideo.mockResolvedValueOnce({ video: { ...VIDEO, uri: `file:///clip-${i}.mp4` } });
        await attachVideo(tree);
      }
      alert.mockClear();
      await act(async () => { button(tree, 'Gửi video cho kỹ thuật viên')?.props.onPress(); });
      expect(alert).toHaveBeenCalledWith('Video', ATTACHMENT_LIMIT_TEXT);
      expect(mockPickVideo).toHaveBeenCalledTimes(2);

      // A clip over a minute is refused when picked (the phone cannot cut it).
      await act(async () => { button(tree, 'Bỏ video thứ 1')?.props.onPress(); });
      mockPickVideo.mockResolvedValueOnce({ video: { ...VIDEO, durationMs: 75_000 } });
      alert.mockClear();
      await attachVideo(tree);
      expect(alert).toHaveBeenCalledWith('Video', 'Video dài hơn 60 giây. Anh/chị quay đoạn ngắn hơn giúp em nhé.');

      // Photos: two sent, one more fits, then none.
      mockPick.mockResolvedValueOnce({ images: [{ uri: 'file:///a.jpg', dataUri: 'data:a' }, { uri: 'file:///b.jpg', dataUri: 'data:b' }] });
      await act(async () => { await button(tree, 'Chọn ảnh từ thư viện')?.props.onPress(); });
      await sendText(tree, 'Ảnh vòi');
      mockPick.mockResolvedValueOnce({ images: [{ uri: 'file:///c.jpg', dataUri: 'data:c' }] });
      await act(async () => { await button(tree, 'Chọn ảnh từ thư viện')?.props.onPress(); });
      expect(mockPick).toHaveBeenLastCalledWith(2);
      alert.mockClear();
      await act(async () => { await button(tree, 'Chọn ảnh từ thư viện')?.props.onPress(); });
      expect(alert).toHaveBeenCalledWith('Ảnh', ATTACHMENT_LIMIT_TEXT);
      expect(mockPick).toHaveBeenCalledTimes(2);
    } finally {
      alert.mockRestore();
      act(() => tree.unmount());
    }
  });

  it('offers one-tap answers to a yes/no question and a "Đúng ý / Chưa đúng" under the newest answer', async () => {
    const tree = await mountScreen();
    try {
      await sendText(tree, 'Vòi rửa chén rỉ nước');
      expect(byTestId(tree, 'ai-quick-replies')).not.toHaveLength(0);
      expect(button(tree, 'Trả lời Rồi')).toBeDefined();
      expect(texts(tree)).toContain('Câu trả lời này có đúng ý anh/chị không?');
      await act(async () => { button(tree, 'Đúng ý')?.props.onPress(); });
      expect(mockFeedback).toHaveBeenCalledWith({ sessionId: 'session-1', verdict: 'right', note: undefined, reply: 'Dạ có thể gioăng vòi bị mòn ạ.' });
      expect(texts(tree)).toContain('Em cảm ơn anh/chị, em ghi nhận để học thêm ạ.');

      mockAnalyze.mockResolvedValueOnce({ ...REPLY, messageVi: 'Dạ vậy anh/chị khoá van rồi gọi thợ nhé.', clarification: null });
      await act(async () => {
        button(tree, 'Trả lời Rồi')?.props.onPress();
        await new Promise((resolve) => setTimeout(resolve, 950));
      });
      expect(mockAnalyze).toHaveBeenLastCalledWith({ description: 'Rồi', images: [], sessionId: 'session-1' });
      expect(byTestId(tree, 'ai-quick-replies')).toHaveLength(0);
    } finally { act(() => tree.unmount()); }
  });

  it('sends a "Chưa đúng" with the note the customer writes', async () => {
    const tree = await mountScreen();
    try {
      await sendText(tree, 'Vòi rửa chén rỉ nước');
      await act(async () => { button(tree, 'Chưa đúng')?.props.onPress(); });
      const note = tree.root.findAllByType(TextInput).find((node) => node.props.accessibilityLabel === 'Góp ý cho trợ lý');
      await act(async () => { note?.props.onChangeText('Vòi nhà em là vòi nóng lạnh'); });
      await act(async () => { button(tree, 'Gửi góp ý')?.props.onPress(); });
      expect(mockFeedback).toHaveBeenCalledWith(expect.objectContaining({ sessionId: 'session-1', verdict: 'wrong', note: 'Vòi nhà em là vòi nóng lạnh' }));
    } finally { act(() => tree.unmount()); }
  });

  it('books with what already went up, uploading nothing again', async () => {
    const alert = answerAlerts();
    mockPick.mockResolvedValueOnce({ images: [{ uri: 'file:///photo.heic', dataUri: 'data:image/jpeg;base64,AAAA' }] });
    const tree = await mountScreen();
    try {
      await act(async () => { await button(tree, 'Chọn ảnh từ thư viện')?.props.onPress(); });
      await attachVideo(tree);
      await sendText(tree, 'Vòi rửa chén rỉ nước');
      // The AI saw the photo, never the video.
      expect(mockAnalyze.mock.calls[0][0].images).toEqual(['data:image/jpeg;base64,AAAA']);
      expect(mockJpeg).toHaveBeenCalledWith('file:///photo.heic');
      expect(mockUploadPhoto).toHaveBeenCalledWith({ uri: 'file:///photo.heic.jpg', name: 'tro-ly.jpg', type: 'image/jpeg' }, expect.anything());
      expect(texts(tree)).toEqual(expect.arrayContaining(['Ảnh đã gửi kèm cho thợ', 'Video đã gửi kèm cho thợ']));

      await act(async () => { button(tree, BOOK)?.props.onPress(); });
      expect(mockNavigate).toHaveBeenCalledWith('CustomerAIDiagnosis', {
        prefill: {
          serviceId: 'service-1', serviceCode: 'SUA_VOI_NUOC', serviceName: 'Sửa vòi nước',
          description: 'Vòi rửa chén rỉ nước', aiSessionId: 'session-1',
          attachmentUploadIds: [{ uploadId: 'upload-photo-1', kind: 'image' }, { uploadId: 'upload-video-1', kind: 'video' }],
        },
      });
      await act(async () => { button(tree, BOOK)?.props.onPress(); });
      expect(mockUploadPhoto).toHaveBeenCalledTimes(1);
      expect(mockUploadVideo).toHaveBeenCalledTimes(1);
    } finally {
      alert.mockRestore();
      act(() => tree.unmount());
    }
  });

  it('asks to wait or book without a video still on its way, saying how far it is', async () => {
    const alert = answerAlerts();
    let progress!: (n: number) => void;
    mockUploadVideo.mockImplementationOnce((_v: unknown, opts: { onProgress: (n: number) => void }) => {
      progress = opts.onProgress;
      return new Promise(() => undefined);
    });
    const tree = await mountScreen();
    try {
      await attachVideo(tree);
      await sendText(tree, 'Vòi rửa chén rỉ nước');
      await act(async () => { progress(0.4); });
      expect(texts(tree)).toContain('Đang gửi video cho thợ 40%');
      alert.mockClear();
      await act(async () => { button(tree, BOOK)?.props.onPress(); });
      expect(alert).toHaveBeenCalledWith('Ảnh, video đang gửi cho thợ', expect.stringContaining('40%'), expect.any(Array));
      expect(mockNavigate).not.toHaveBeenCalled();
      const buttons = alert.mock.calls[0][2] as AlertButton[];
      await act(async () => { buttons.find((b) => b.text === 'Đặt thợ không kèm')?.onPress?.(); });
      expect(mockNavigate.mock.calls[0][1].prefill).not.toHaveProperty('attachmentUploadIds');
    } finally {
      alert.mockRestore();
      act(() => tree.unmount());
    }
  });

  it('says why an upload failed, sends it again with Thử lại, then books with it', async () => {
    const alert = answerAlerts();
    mockUploadVideo.mockRejectedValueOnce(new Error('Network Error'));
    const tree = await mountScreen();
    try {
      await attachVideo(tree);
      await sendText(tree, 'Vòi rửa chén rỉ nước');
      expect(texts(tree)).toContain('Mạng yếu nên chưa gửi được. Bấm Thử lại khi mạng ổn hơn.');
      alert.mockClear();
      await act(async () => { button(tree, BOOK)?.props.onPress(); });
      expect(alert).toHaveBeenCalledWith('Có ảnh hoặc video chưa gửi được', expect.any(String), expect.any(Array));
      expect(mockNavigate).not.toHaveBeenCalled();

      await act(async () => { button(tree, 'Gửi lại tệp này')?.props.onPress(); });
      await settle();
      expect(texts(tree)).toContain('Video đã gửi kèm cho thợ');
      await act(async () => { button(tree, BOOK)?.props.onPress(); });
      expect(mockNavigate.mock.calls[0][1].prefill.attachmentUploadIds).toEqual([{ uploadId: 'upload-video-1', kind: 'video' }]);
    } finally {
      alert.mockRestore();
      act(() => tree.unmount());
    }
  });

  it('books without uploading anything when the chat had only words', async () => {
    const tree = await mountScreen();
    try {
      await sendText(tree, 'Vòi rửa chén rỉ nước');
      await act(async () => { button(tree, BOOK)?.props.onPress(); });
      expect(mockUploadPhoto).not.toHaveBeenCalled();
      expect(mockUploadVideo).not.toHaveBeenCalled();
      expect(mockNavigate.mock.calls[0][1].prefill).not.toHaveProperty('attachmentUploadIds');
    } finally { act(() => tree.unmount()); }
  });
});
