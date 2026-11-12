import React, { useCallback, useEffect, useRef, useState, type Ref } from 'react';
import { BackHandler } from 'react-native';
import { BottomSheetModal, type BottomSheetModalProps } from '@gorhom/bottom-sheet';

type Props = BottomSheetModalProps & { ref?: Ref<BottomSheetModal | null> };

/**
 * The app's bottom sheet. `@gorhom/bottom-sheet` does not listen to the Android Back button, so a
 * sheet stayed open on Back, and a second Back left the whole screen (or the app) behind the sheet.
 * While this sheet is open, Back closes the sheet and nothing else.
 */
export default function BackClosableBottomSheetModal({ ref, onChange, onDismiss, ...props }: Props) {
  const inner = useRef<BottomSheetModal | null>(null);
  const [open, setOpen] = useState(false);
  const attach = useCallback((node: BottomSheetModal | null) => {
    inner.current = node;
    if (typeof ref === 'function') ref(node);
    else if (ref) (ref as { current: BottomSheetModal | null }).current = node;
  }, [ref]);

  useEffect(() => {
    if (!open) return undefined;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      inner.current?.dismiss();
      return true;
    });
    return () => subscription.remove();
  }, [open]);

  return (
    <BottomSheetModal
      {...props}
      ref={attach}
      onChange={(index, position, type) => {
        setOpen(index >= 0);
        onChange?.(index, position, type);
      }}
      onDismiss={() => {
        setOpen(false);
        onDismiss?.();
      }}
    />
  );
}
