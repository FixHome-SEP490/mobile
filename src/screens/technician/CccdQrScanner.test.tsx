import React from 'react';
import { act, create } from 'react-test-renderer';
import { CccdQrScanner } from './CccdQrScanner';

jest.mock('expo-camera', () => ({
  CameraView: jest.requireActual('react-native').View,
  useCameraPermissions: () => [{ granted: true, canAskAgain: true }, jest.fn()],
}));

const text = (tree: ReturnType<typeof create>) => JSON.stringify(tree.toJSON());

describe('CccdQrScanner', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('reports an error and accepts another scan after a QR that is not a CCCD', () => {
    const onScan = jest.fn().mockReturnValueOnce(false).mockReturnValueOnce(true);
    let tree!: ReturnType<typeof create>;
    act(() => { tree = create(<CccdQrScanner onScan={onScan} onCancel={jest.fn()} />); });
    const scan = (data: string) => act(() => { tree.root.findByProps({ testID: 'cccd-camera-view' }).props.onBarcodeScanned({ data }); });

    scan('https://example.com');
    expect(onScan).toHaveBeenCalledTimes(1);
    expect(text(tree)).toContain('không phải mã QR trên thẻ căn cước');

    scan('ignored while the camera still sees the old code');
    expect(onScan).toHaveBeenCalledTimes(1);

    act(() => { jest.advanceTimersByTime(1500); });
    scan('079203001234||A|15052003|Nam|x|01012022');
    expect(onScan).toHaveBeenCalledTimes(2);
  });

  it('lets the technician fall back to typing', () => {
    const onCancel = jest.fn();
    let tree!: ReturnType<typeof create>;
    act(() => { tree = create(<CccdQrScanner onScan={jest.fn()} onCancel={onCancel} />); });
    act(() => { tree.root.findByProps({ testID: 'cccd-camera-cancel' }).props.onPress(); });
    expect(onCancel).toHaveBeenCalled();
  });

  it('tells the technician when nothing is read for a while, e.g. an old CCCD without a QR', () => {
    let tree!: ReturnType<typeof create>;
    act(() => { tree = create(<CccdQrScanner onScan={jest.fn()} onCancel={jest.fn()} />); });
    expect(text(tree)).not.toContain('Chưa thấy mã QR');
    act(() => { jest.advanceTimersByTime(8000); });
    expect(text(tree)).toContain('Chưa thấy mã QR');
    expect(text(tree)).toContain('mẫu cũ');
  });
});
