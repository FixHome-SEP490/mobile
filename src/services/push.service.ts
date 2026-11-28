// Phone push through OneSignal (PO 28/11/2026): every notice, chat message and incoming call
// reaches the phone while the app is open, in the background or closed.
//
// The device is tied to the account by OneSignal's external_id = user id (login after sign-in,
// logout on sign-out), so the backend needs no token table. Without EXPO_PUBLIC_ONESIGNAL_APP_ID,
// on web and in Expo Go (no native module) everything here does nothing and the app works as before.
import { Platform } from 'react-native';
import { useAuthStore } from '../store/auth.store';
import { rootNavigationRef } from '../navigation/root-navigation';
import { parsePushData, pushOpenTarget, showWhileOpen, type PushOpenTarget } from './push-routing';
import { announcePendingNotice, getOpenConversation, setPendingNotice } from './push-state';

import type { NotificationClickEvent, NotificationWillDisplayEvent } from 'react-native-onesignal';

export { onPendingNotice, setOpenConversation, takePendingNotice } from './push-state';

type OneSignalModule = typeof import('react-native-onesignal');

let sdk: OneSignalModule['OneSignal'] | null = null;
let started = false;
/** undefined until the session is known, so a stale OneSignal login from an expired session is cleared too. */
let signedInAs: string | null | undefined;
let permissionAsked = false;
/** A tap that came before the app could open the screen (cold start, still signing in). */
let pendingOpen: PushOpenTarget | null = null;

function appId(): string {
  return (process.env.EXPO_PUBLIC_ONESIGNAL_APP_ID ?? '').trim();
}

function loadSdk(): OneSignalModule['OneSignal'] | null {
  if (Platform.OS !== 'android' && Platform.OS !== 'ios') return null;
  try {
    // Required lazily: Expo Go and the web build have no native OneSignal module.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return (require('react-native-onesignal') as OneSignalModule).OneSignal ?? null;
  } catch {
    return null;
  }
}

/** Opens what a tap asked for once navigation is up and someone is signed in; otherwise keeps it for later. */
export function flushPendingOpen(): void {
  const target = pendingOpen;
  if (!target) return;
  const { isAuthenticated, user } = useAuthStore.getState();
  if (!isAuthenticated || !user || !rootNavigationRef.isReady()) return;
  const routes = rootNavigationRef.getRootState()?.routeNames ?? [];
  pendingOpen = null;
  if (target.screen === 'ChatThread') {
    if (routes.includes('ChatThread')) rootNavigationRef.navigate('ChatThread', target.params);
    return;
  }
  setPendingNotice(target.item);
  if (user.role === 'technician' && routes.includes('TechnicianMain')) {
    rootNavigationRef.navigate('TechnicianMain', { screen: 'Notifications' });
  } else if (user.role === 'customer' && routes.includes('CustomerMain')) {
    // CustomerMain's tabs are not typed on the root list; Notifications is one of them.
    (rootNavigationRef.navigate as (name: string, params: object) => void)('CustomerMain', { screen: 'Notifications' });
  } else {
    setPendingNotice(null);
    return;
  }
  announcePendingNotice();
}

/** Signs this phone in or out of OneSignal so pushes follow the account, not the device. */
function syncAccount(): void {
  if (!sdk) return;
  const { isAuthenticated, user, isLoading } = useAuthStore.getState();
  // While the stored session is being checked, nobody is known yet: do nothing.
  if (isLoading) return;
  const userId = isAuthenticated && user?.id ? user.id : null;
  if (userId === signedInAs) return;
  try {
    if (userId) {
      sdk.login(userId);
      if (!permissionAsked) {
        permissionAsked = true;
        // Android 13+ shows the system question once; a refusal is respected, the app works without push.
        void sdk.Notifications.requestPermission(false).catch(() => undefined);
      }
    } else {
      // Signed out or another account: this phone stops getting the previous person's pushes.
      sdk.logout();
    }
    signedInAs = userId;
  } catch {
    // Push is a courtesy: a failing SDK call never stops the app.
  }
}

/** Called once at start-up, before the first screen, so a tap that launched the app is not lost. */
export function startPush(): void {
  if (started) return;
  started = true;
  const id = appId();
  if (!id) return;
  sdk = loadSdk();
  if (!sdk) return;
  try {
    sdk.initialize(id);
    sdk.Notifications.addEventListener('click', (event: NotificationClickEvent) => {
      const data = parsePushData(event.notification.additionalData);
      if (!data) return;
      pendingOpen = pushOpenTarget(data, { title: event.notification.title, body: event.notification.body });
      flushPendingOpen();
    });
    sdk.Notifications.addEventListener('foregroundWillDisplay', (event: NotificationWillDisplayEvent) => {
      const notification = event.getNotification();
      if (!showWhileOpen(parsePushData(notification.additionalData), { openConversationId: getOpenConversation() })) event.preventDefault();
    });
  } catch {
    sdk = null;
    return;
  }
  syncAccount();
  useAuthStore.subscribe(() => {
    syncAccount();
    flushPendingOpen();
  });
}
