import { Alert, Platform } from 'react-native';

/**
 * Ask before an action that cannot be taken back. `Alert.alert` with buttons does nothing on web (the button simply
 * appears dead), so there the browser's own confirm stands in; on a phone it is the usual two-button alert.
 */
export function confirmAction(options: {
  title: string;
  message?: string;
  confirmLabel: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
}): void {
  const { title, message, confirmLabel, cancelLabel = 'Quay lại', destructive = false, onConfirm } = options;
  if (Platform.OS === 'web') {
    const ask = typeof window !== 'undefined' && typeof window.confirm === 'function' ? window.confirm.bind(window) : null;
    // No way to ask means no way to confirm: do nothing rather than act without consent.
    if (ask?.(message ? `${title}\n\n${message}` : title)) onConfirm();
    return;
  }
  Alert.alert(title, message, [
    { text: cancelLabel, style: 'cancel' },
    { text: confirmLabel, style: destructive ? 'destructive' : 'default', onPress: onConfirm },
  ]);
}
