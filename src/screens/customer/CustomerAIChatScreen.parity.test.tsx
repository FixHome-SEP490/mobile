// The assistant on the phone as on the web (PO 18/10/2026): videos go to the
// technician and never to the AI, one-tap answers, "Đúng ý / Chưa đúng", and
// the chat's photos and videos travel into the booking.
import React from 'react';
import { Alert, Text, TextInput, TouchableOpacity, type AlertButton } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { VIDEO_NOT_ANALYSED } from './ai-chat-logic';

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

/** The reply waits for a short reading beat (900 ms) before it lands. */
async function sendText(tree: ReactTestRenderer, text: string) {
  await act(async () => { tree.root.findByType(TextInput).props.onChangeText(text); });
  await act(async () => {
    button(tree, 'Gửi tin nhắn cho trợ lý')?.props.onPress();
    await new Promise((resolve) => setTimeout(resolve, 950));
  });
}

/** Answers the video Alert with the library choice. */
function chooseLibraryVideo() {
  return jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons?: AlertButton[]) => {
    buttons?.find((b) => b.text === 'Chọn video có sẵn')?.onPress?.();
  });
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
  it('keeps a video for the technician and never sends it to the AI', async () => {
    const alert = chooseLibraryVideo();
    const tree = await mountScreen();
    try {
      const videoButton = button(tree, 'Gửi video cho kỹ thuật viên');
      expect(videoButton).toBeDefined();
      await act(async () => { videoButton?.props.onPress(); await Promise.resolve(); await Promise.resolve(); });
      expect(alert).toHaveBeenCalledWith('Gửi video cho kỹ thuật viên', VIDEO_NOT_ANALYSED, expect.any(Array));
      expect(mockPickVideo).toHaveBeenCalledTimes(1);
      expect(byTestId(tree, 'ai-pending-videos')).not.toHaveLength(0);
      expect(texts(tree)).toContain('0:23');

      await sendText(tree, 'Vòi rửa chén rỉ nước');
      expect(mockAnalyze).toHaveBeenCalledTimes(1);
      const payload = mockAnalyze.mock.calls[0][0];
      expect(payload).toEqual({ description: 'Vòi rửa chén rỉ nước', images: [], sessionId: null });
      expect(JSON.stringify(payload)).not.toContain('clip');
      expect(byTestId(tree, 'ai-pending-videos')).toHaveLength(0);
      expect(byTestId(tree, 'ai-message-videos')).not.toHaveLength(0);
      expect(byTestId(tree, 'ai-video-note').length).toBeGreaterThan(0);
      expect(mockUploadVideo).not.toHaveBeenCalled();
    } finally {
      alert.mockRestore();
      act(() => tree.unmount());
    }
  });

  it('refuses a third video', async () => {
    const alert = chooseLibraryVideo();
    const tree = await mountScreen();
    try {
      for (let i = 0; i < 2; i += 1) {
        mockPickVideo.mockResolvedValueOnce({ video: { ...VIDEO, uri: `file:///clip-${i}.mp4` } });
        await act(async () => { button(tree, 'Gửi video cho kỹ thuật viên')?.props.onPress(); await Promise.resolve(); await Promise.resolve(); });
      }
      expect(mockPickVideo).toHaveBeenCalledTimes(2);
      alert.mockClear();
      await act(async () => { button(tree, 'Gửi video cho kỹ thuật viên')?.props.onPress(); });
      expect(alert).toHaveBeenCalledWith('Video', 'Gửi được tối đa 2 video.');
      expect(mockPickVideo).toHaveBeenCalledTimes(2);
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
      expect(button(tree, 'Trả lời Chưa')).toBeDefined();
      expect(texts(tree)).toContain('Câu trả lời này có đúng ý anh/chị không?');

      await act(async () => { button(tree, 'Đúng ý')?.props.onPress(); });
      expect(mockFeedback).toHaveBeenCalledWith({
        sessionId: 'session-1', verdict: 'right', note: undefined, reply: 'Dạ có thể gioăng vòi bị mòn ạ.',
      });
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
      expect(note).toBeDefined();
      await act(async () => { note?.props.onChangeText('Vòi nhà em là vòi nóng lạnh'); });
      await act(async () => { button(tree, 'Gửi góp ý')?.props.onPress(); });
      expect(mockFeedback).toHaveBeenCalledWith(expect.objectContaining({
        sessionId: 'session-1', verdict: 'wrong', note: 'Vòi nhà em là vòi nóng lạnh',
      }));
    } finally { act(() => tree.unmount()); }
  });

  it('uploads the chat photos and videos when the customer books, and carries their ids', async () => {
    const alert = chooseLibraryVideo();
    mockPick.mockResolvedValueOnce({ images: [{ uri: 'file:///photo.heic', dataUri: 'data:image/jpeg;base64,AAAA' }] });
    const tree = await mountScreen();
    try {
      await act(async () => { await button(tree, 'Chọn ảnh từ thư viện')?.props.onPress(); });
      await act(async () => { button(tree, 'Gửi video cho kỹ thuật viên')?.props.onPress(); await Promise.resolve(); await Promise.resolve(); });
      await sendText(tree, 'Vòi rửa chén rỉ nước');
      // The AI saw the photo, never the video.
      expect(mockAnalyze.mock.calls[0][0].images).toEqual(['data:image/jpeg;base64,AAAA']);

      const book = button(tree, `Xem dịch vụ ${SERVICE.nameVi} để tiếp tục đặt lịch`);
      expect(book).toBeDefined();
      await act(async () => { await book?.props.onPress(); await Promise.resolve(); });
      expect(mockJpeg).toHaveBeenCalledWith('file:///photo.heic');
      expect(mockUploadPhoto).toHaveBeenCalledWith({ uri: 'file:///photo.heic.jpg', name: 'tro-ly.jpg', type: 'image/jpeg' });
      expect(mockUploadVideo).toHaveBeenCalledWith({ uri: VIDEO.uri, name: VIDEO.name, type: 'video/quicktime' });
      expect(mockNavigate).toHaveBeenCalledWith('CustomerAIDiagnosis', {
        prefill: {
          serviceId: 'service-1',
          serviceCode: 'SUA_VOI_NUOC',
          serviceName: 'Sửa vòi nước',
          description: 'Vòi rửa chén rỉ nước',
          aiSessionId: 'session-1',
          attachmentUploadIds: [
            { uploadId: 'upload-photo-1', kind: 'image' },
            { uploadId: 'upload-video-1', kind: 'video' },
          ],
        },
      });

      // Booking again does not upload the same files twice.
      await act(async () => { await book?.props.onPress(); await Promise.resolve(); });
      expect(mockUploadPhoto).toHaveBeenCalledTimes(1);
      expect(mockUploadVideo).toHaveBeenCalledTimes(1);
      expect(mockNavigate).toHaveBeenCalledTimes(2);
    } finally {
      alert.mockRestore();
      act(() => tree.unmount());
    }
  });

  it('stays on the chat and says so when an upload fails', async () => {
    const alert = chooseLibraryVideo();
    mockUploadVideo.mockRejectedValueOnce(new Error('network'));
    const tree = await mountScreen();
    try {
      await act(async () => { button(tree, 'Gửi video cho kỹ thuật viên')?.props.onPress(); await Promise.resolve(); await Promise.resolve(); });
      await sendText(tree, 'Vòi rửa chén rỉ nước');
      alert.mockClear();
      await act(async () => { await button(tree, `Xem dịch vụ ${SERVICE.nameVi} để tiếp tục đặt lịch`)?.props.onPress(); await Promise.resolve(); });
      expect(alert).toHaveBeenCalledWith('Chưa tải được ảnh hoặc video', expect.any(String));
      expect(mockNavigate).not.toHaveBeenCalled();
      expect(button(tree, `Xem dịch vụ ${SERVICE.nameVi} để tiếp tục đặt lịch`)?.props.disabled).toBe(false);
    } finally {
      alert.mockRestore();
      act(() => tree.unmount());
    }
  });

  it('books without uploading anything when the chat had only words', async () => {
    const tree = await mountScreen();
    try {
      await sendText(tree, 'Vòi rửa chén rỉ nước');
      await act(async () => { await button(tree, `Xem dịch vụ ${SERVICE.nameVi} để tiếp tục đặt lịch`)?.props.onPress(); await Promise.resolve(); });
      expect(mockUploadPhoto).not.toHaveBeenCalled();
      expect(mockUploadVideo).not.toHaveBeenCalled();
      expect(mockNavigate.mock.calls[0][1].prefill).not.toHaveProperty('attachmentUploadIds');
    } finally { act(() => tree.unmount()); }
  });
});
