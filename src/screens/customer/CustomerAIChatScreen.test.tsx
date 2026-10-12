import React from 'react';
import { Alert, StyleSheet, Text, TextInput, TouchableOpacity, type ViewStyle } from 'react-native';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';

const mockNavigate = jest.fn();
const mockBack = jest.fn();
const mockRoute = jest.fn();
const mockPick = jest.fn();
const mockCamera = jest.fn();
const mockAnalyze = jest.fn();
const mockAsk = jest.fn();
const mockAcks = jest.fn();

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate, goBack: mockBack }),
  useRoute: () => mockRoute(),
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
  return {
    Ionicons: ({ name }: { name: string }) => ReactModule.createElement(Native.Text, null, name),
  };
});
jest.mock('expo-haptics', () => ({
  selectionAsync: jest.fn(),
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: { Heavy: 'Heavy', Medium: 'Medium' },
}));
jest.mock('../../hooks/useKeyboardInset', () => ({ useKeyboardInset: () => 0 }));
jest.mock('../../services/image-for-ai', () => ({
  pickImagesForAi: (...args: unknown[]) => mockPick(...args),
  takePhotoForAi: (...args: unknown[]) => mockCamera(...args),
  shrinkForRetry: jest.fn(),
}));
jest.mock('../../api/ai.api', () => ({
  AI_MAX_IMAGES: 3,
  looksLikeAQuestion: () => false,
  aiApi: {
    acknowledgements: (...args: unknown[]) => mockAcks(...args),
    analyze: (...args: unknown[]) => mockAnalyze(...args),
    ask: (...args: unknown[]) => mockAsk(...args),
  },
}));
jest.mock('../chat/TypingDots', () => () => null);

async function mountScreen() {
  const { default: Screen } = jest.requireActual('./CustomerAIChatScreen') as {
    default: React.ComponentType;
  };
  let tree!: ReactTestRenderer;
  await act(async () => { tree = create(React.createElement(Screen)); await Promise.resolve(); });
  return tree;
}
function button(tree: ReactTestRenderer, label: string) {
  return tree.root.findAllByType(TouchableOpacity).find((node) => node.props.accessibilityLabel === label);
}
function textValues(tree: ReactTestRenderer) {
  return tree.root.findAllByType(Text).map((node) =>
    Array.isArray(node.props.children)
      ? node.props.children.join('')
      : String(node.props.children ?? ''),
  );
}
function styleOf(node: ReactTestInstance | undefined): ViewStyle {
  return StyleSheet.flatten(node?.props.style ?? {}) as ViewStyle;
}
beforeEach(() => {
  jest.clearAllMocks();
  mockRoute.mockReturnValue({ params: undefined });
  mockAcks.mockResolvedValue({});
  mockPick.mockResolvedValue({ images: [] });
  mockCamera.mockResolvedValue({ images: [] });
});

describe('CustomerAIChatScreen REAL presentation', () => {
  it('keeps a readable, accessible chat composer with no AI message sent on mount', async () => {
    const tree = await mountScreen();
    try {
      expect(textValues(tree)).toContain('Trợ lý FixHome');
      expect(textValues(tree)).toContain('Chẩn đoán sơ bộ, không thay thợ');
      const input = tree.root.findByType(TextInput);
      expect(input.props.accessibilityLabel).toBe('Nhắn tin cho trợ lý FixHome');
      expect(input.props.placeholderTextColor).toBe('#94A3B8');
      for (const label of ['Quay lại', 'Bắt đầu phiên chat mới', 'Chọn ảnh từ thư viện', 'Chụp ảnh', 'Gửi tin nhắn cho trợ lý']) {
        const el = button(tree, label);
        expect(el).toBeDefined();
        const style = styleOf(el);
        expect(style.minHeight ?? style.height).toBeGreaterThanOrEqual(44);
        expect(style.minWidth ?? style.width).toBeGreaterThanOrEqual(44);
      }
      expect(button(tree, 'Gửi tin nhắn cho trợ lý')?.props.accessibilityState.disabled).toBe(true);
      expect(mockAnalyze).not.toHaveBeenCalled();
      expect(mockAsk).not.toHaveBeenCalled();
      expect(mockPick).not.toHaveBeenCalled();
      expect(mockCamera).not.toHaveBeenCalled();
    } finally { act(() => tree.unmount()); }
  });

  it('preserves the photo picker, count and a usable 44pt remove action', async () => {
    mockPick.mockResolvedValueOnce({ images: [{ uri: 'sample.jpg', dataUri: 'data:image/jpeg;base64,AAAA' }] });
    const tree = await mountScreen();
    try {
      await act(async () => { await button(tree, 'Chọn ảnh từ thư viện')?.props.onPress(); });
      expect(mockPick).toHaveBeenCalledWith(0);
      expect(textValues(tree)).toContain('1/3 ảnh');
      const remove = button(tree, 'Bỏ ảnh thứ 1');
      expect(remove).toBeDefined();
      expect(styleOf(remove).width).toBeGreaterThanOrEqual(44);
      expect(styleOf(remove).height).toBeGreaterThanOrEqual(44);
      act(() => remove?.props.onPress());
      expect(textValues(tree)).not.toContain('1/3 ảnh');
      expect(mockAnalyze).not.toHaveBeenCalled();
      expect(mockAsk).not.toHaveBeenCalled();
    } finally { act(() => tree.unmount()); }
  });

  it('still requires text and keeps session-reset disabled before the first AI reply', async () => {
    const tree = await mountScreen();
    try {
      expect(button(tree, 'Bắt đầu phiên chat mới')?.props.accessibilityState.disabled).toBe(true);
      expect(button(tree, 'Gửi tin nhắn cho trợ lý')?.props.accessibilityState.disabled).toBe(true);
      await act(async () => { tree.root.findByType(TextInput).props.onChangeText('  Điều hòa không lạnh  '); });
      expect(button(tree, 'Gửi tin nhắn cho trợ lý')?.props.accessibilityState.disabled).toBe(false);
      const alertSpy = jest.spyOn(Alert, 'alert');
      expect(mockAnalyze).not.toHaveBeenCalled();
      expect(mockNavigate).not.toHaveBeenCalled();
      expect(alertSpy).not.toHaveBeenCalled();
      alertSpy.mockRestore();
    } finally { act(() => tree.unmount()); }
  });
});
