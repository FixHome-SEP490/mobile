import React from 'react';
import { Alert, KeyboardAvoidingView, Text, TextInput, TouchableOpacity } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

const mockNavigate = jest.fn();
const mockPush = jest.fn();
const mockGoBack = jest.fn();
const mockRoute = jest.fn();
const mockPickImages = jest.fn();
const mockSelection = jest.fn();
const mockImpact = jest.fn();

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate, push: mockPush, goBack: mockGoBack }),
  useRoute: () => mockRoute(),
}));
jest.mock('react-native-safe-area-context', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Native = require('react-native');
  return { SafeAreaView: Native.View };
});
jest.mock('@expo/vector-icons', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const ReactModule = require('react');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Native = require('react-native');
  return {
    Ionicons: ({ name }: { name: string }) => ReactModule.createElement(Native.Text, null, name),
    MaterialCommunityIcons: ({ name }: { name: string }) => ReactModule.createElement(Native.Text, null, name),
  };
});
jest.mock('expo-linear-gradient', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const ReactModule = require('react');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Native = require('react-native');
  return { LinearGradient: ({ children, ...props }: { children: React.ReactNode }) =>
    ReactModule.createElement(Native.View, props, children) };
});
jest.mock('expo-haptics', () => ({
  selectionAsync: (...args: unknown[]) => mockSelection(...args),
  impactAsync: (...args: unknown[]) => mockImpact(...args),
  ImpactFeedbackStyle: { Medium: 'Medium' },
}));
jest.mock('../../api/ai.api', () => ({ AI_MAX_IMAGES: 3 }));
jest.mock('../../services/image-for-ai', () => ({
  pickImagesForAi: (...args: unknown[]) => mockPickImages(...args),
}));

async function mountScreen(): Promise<ReactTestRenderer> {
  const { default: Screen } = jest.requireActual('./CustomerAIDiagnosisScreen') as {
    default: React.ComponentType;
  };
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = create(React.createElement(Screen));
  });
  return tree;
}
function press(tree: ReactTestRenderer, label: string) {
  return tree.root.findAllByType(TouchableOpacity).find((item) => item.props.accessibilityLabel === label);
}
function texts(tree: ReactTestRenderer) {
  return tree.root.findAllByType(Text).map((item) =>
    Array.isArray(item.props.children) ? item.props.children.join('') : String(item.props.children ?? ''),
  );
}
beforeEach(() => {
  jest.clearAllMocks();
  mockRoute.mockReturnValue({ params: undefined });
  mockPickImages.mockResolvedValue({ images: [] });
});

describe('CustomerAIDiagnosisScreen production entry UI', () => {
  it('renders a truthful advisory entry with keyboard-safe layout and no side effects on mount', async () => {
    const tree = await mountScreen();
    try {
      expect(texts(tree)).toContain('Trợ lý FixHome');
      expect(texts(tree)).toContain('Kể FixHome nghe');
      expect(texts(tree)).toContain('Nhà đang gặp chuyện gì?');
      expect(texts(tree)).toContain('AI chỉ đưa ra gợi ý, không tự đặt lịch hoặc xác nhận giá.');
      expect(tree.root.findAllByType(KeyboardAvoidingView)).toHaveLength(1);
      const picker = press(tree, 'Chọn ảnh thiết bị cho trợ lý');
      const booking = press(tree, 'Tiếp tục chọn lịch sửa chữa');
      const chat = press(tree, 'Nhờ trợ lý tư vấn');
      expect(picker).toBeDefined();
      expect(booking).toBeDefined();
      expect(chat).toBeDefined();
      expect(picker?.props.style.minHeight).toBeGreaterThanOrEqual(44);
      expect(booking?.props.style.minHeight).toBeGreaterThanOrEqual(44);
      expect(chat?.props.accessibilityState.disabled).toBe(true);
      expect(mockPickImages).not.toHaveBeenCalled();
      expect(mockNavigate).not.toHaveBeenCalled();
      expect(mockPush).not.toHaveBeenCalled();
    } finally { act(() => tree.unmount()); }
  });

  it('requires written symptoms for Chat and Booking without inventing a diagnosis', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const tree = await mountScreen();
    try {
      act(() => press(tree, 'Tiếp tục chọn lịch sửa chữa')?.props.onPress());
      expect(alert).toHaveBeenCalledWith('Cần mô tả sự cố', expect.any(String));
      expect(mockNavigate).not.toHaveBeenCalled();
      expect(mockPush).not.toHaveBeenCalled();
      await act(async () => {
        tree.root.findByType(TextInput).props.onChangeText('  Điều hòa không lạnh  ');
      });
      const chat = press(tree, 'Nhờ trợ lý tư vấn');
      expect(chat?.props.accessibilityState.disabled).toBe(false);
      act(() => chat?.props.onPress());
      expect(mockNavigate).toHaveBeenCalledWith('CustomerAIChat', {
        initialDescription: 'Điều hòa không lạnh', initialImages: [],
      });
      act(() => press(tree, 'Tiếp tục chọn lịch sửa chữa')?.props.onPress());
      expect(mockPush).toHaveBeenCalledWith('CustomerBookingCreate', {
        prefill: { description: 'Điều hòa không lạnh' },
      });
    } finally {
      alert.mockRestore();
      act(() => tree.unmount());
    }
  });

  it('preserves the original picture-picker route, limit and photos-only-to-AI handoff', async () => {
    mockRoute.mockReturnValue({ params: { prefill: { serviceName: 'Vệ sinh máy lạnh', description: 'Máy lạnh hỏng' } } });
    mockPickImages.mockResolvedValueOnce({ images: [{ dataUri: 'data:image/jpeg;base64,YWJj', uri: 'original.jpg' }] });
    const tree = await mountScreen();
    try {
      expect(texts(tree)).toContain('Vệ sinh máy lạnh');
      await act(async () => press(tree, 'Chọn ảnh thiết bị cho trợ lý')?.props.onPress());
      expect(mockPickImages).toHaveBeenCalledWith(0);
      expect(texts(tree)).toContain('Đã chọn 1/3 ảnh');
      act(() => press(tree, 'Nhờ trợ lý tư vấn')?.props.onPress());
      expect(mockNavigate).toHaveBeenCalledWith('CustomerAIChat', {
        initialDescription: 'Máy lạnh hỏng',
        initialImages: ['data:image/jpeg;base64,YWJj'],
      });
      act(() => press(tree, 'Tiếp tục chọn lịch sửa chữa')?.props.onPress());
      expect(mockPush).toHaveBeenCalledWith('CustomerBookingCreate', {
        prefill: { serviceName: 'Vệ sinh máy lạnh', description: 'Máy lạnh hỏng' },
      });
    } finally { act(() => tree.unmount()); }
  });
});
