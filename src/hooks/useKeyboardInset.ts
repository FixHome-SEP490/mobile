// src/hooks/useKeyboardInset.ts
import { useEffect, useState } from 'react';
import { Keyboard, Platform, type KeyboardEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/**
 * How much bottom padding a full-height screen needs to clear the keyboard.
 *
 * `KeyboardAvoidingView` is the usual answer and it does not work here. On
 * Android it relies on the window being resized when the keyboard opens, and
 * this app draws edge to edge, where the window is not resized - so the
 * composer stayed where it was and the keyboard covered it. The customer could
 * type and could not see what they were typing.
 *
 * Measured rather than guessed, on the emulator this app is developed against:
 * the screen is 891dp tall, and the keyboard reports height 312dp with its top
 * edge at 555dp. 891 - 555 = 336, which is 24dp more than the height it
 * reports - exactly the navigation bar. The reported height stops at the
 * navigation bar; the content does not, because edge to edge draws behind it.
 * Padding by the reported height alone left the composer's bottom edge tucked
 * under the keyboard's toolbar row, which is what the first attempt did.
 *
 * So the answer is the keyboard plus the bottom inset, and zero when the
 * keyboard is down - at which point the screen keeps whatever spacing it had.
 *
 * iOS reports the keyboard before it finishes animating (`WillShow`), Android
 * only once it is up (`DidShow`), so each platform subscribes to the pair that
 * fires soonest for it; getting that wrong leaves a gap for the length of the
 * animation.
 */
export function useKeyboardInset(): number {
  const [height, setHeight] = useState(0);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const onShow = Keyboard.addListener(showEvent, (event: KeyboardEvent) => {
      setHeight(event.endCoordinates?.height ?? 0);
    });
    const onHide = Keyboard.addListener(hideEvent, () => setHeight(0));

    return () => {
      onShow.remove();
      onHide.remove();
    };
  }, []);

  return height > 0 ? height + insets.bottom : 0;
}
