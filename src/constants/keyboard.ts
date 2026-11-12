import { Platform } from 'react-native';

/**
 * Behaviour for every `KeyboardAvoidingView` in the app.
 *
 * Android draws this app edge to edge (`edgeToEdgeEnabled`), and an edge-to-edge
 * window is not resized when the keyboard opens, so `adjustResize` does nothing
 * and a view left without a behaviour stays under the keyboard. Padding by the
 * keyboard's overlap works on both platforms; web has no on-screen keyboard.
 */
export const KEYBOARD_AVOIDING_BEHAVIOR: 'padding' | undefined = Platform.OS === 'web' ? undefined : 'padding';
