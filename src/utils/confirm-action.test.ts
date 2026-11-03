import { Alert, Platform } from 'react-native';
import { confirmAction } from './confirm-action';

const options = (onConfirm: () => void) => ({ title: 'Hủy cả lượt sửa?', message: 'Tất cả thiết bị sẽ bị hủy.', cancelLabel: 'Giữ lại', confirmLabel: 'Hủy lượt sửa', destructive: true, onConfirm });
const setWindow = (value: unknown) => { (globalThis as { window?: unknown }).window = value; };
afterEach(() => { jest.restoreAllMocks(); setWindow(undefined); });

describe('on a phone', () => {
  it('asks with the two-button alert and acts only when the destructive button is pressed', () => {
    jest.replaceProperty(Platform, 'OS', 'ios');
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const onConfirm = jest.fn();
    confirmAction(options(onConfirm));
    expect(onConfirm).not.toHaveBeenCalled();
    const [title, message, buttons] = alert.mock.calls[0] as [string, string, { text: string; style?: string; onPress?: () => void }[]];
    expect([title, message]).toEqual(['Hủy cả lượt sửa?', 'Tất cả thiết bị sẽ bị hủy.']);
    expect(buttons.map((b) => [b.text, b.style])).toEqual([['Giữ lại', 'cancel'], ['Hủy lượt sửa', 'destructive']]);
    buttons[1].onPress!();
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('uses a plain confirm button for a non-destructive action', () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    confirmAction({ title: 'Gửi?', confirmLabel: 'Gửi', onConfirm: jest.fn() });
    const buttons = alert.mock.calls[0][2] as { text: string; style?: string }[];
    expect(buttons.map((b) => [b.text, b.style])).toEqual([['Quay lại', 'cancel'], ['Gửi', 'default']]);
  });
});

describe('on web, where Alert.alert does nothing', () => {
  beforeEach(() => jest.replaceProperty(Platform, 'OS', 'web'));

  it('asks with the browser confirm and acts when the user agrees, without touching Alert', () => {
    const confirm = jest.fn(() => true);
    setWindow({ confirm });
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const onConfirm = jest.fn();
    confirmAction(options(onConfirm));
    expect(confirm).toHaveBeenCalledWith('Hủy cả lượt sửa?\n\nTất cả thiết bị sẽ bị hủy.');
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(alert).not.toHaveBeenCalled();
  });

  it('does nothing when the user declines', () => {
    setWindow({ confirm: jest.fn(() => false) });
    const onConfirm = jest.fn();
    confirmAction(options(onConfirm));
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('never acts without consent when the browser cannot ask', () => {
    setWindow(undefined);
    const onConfirm = jest.fn();
    confirmAction(options(onConfirm));
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('asks with the title alone when there is no message', () => {
    const confirm = jest.fn(() => false);
    setWindow({ confirm });
    confirmAction({ title: 'Hủy?', confirmLabel: 'Hủy', onConfirm: jest.fn() });
    expect(confirm).toHaveBeenCalledWith('Hủy?');
  });
});
