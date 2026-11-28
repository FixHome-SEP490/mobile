// Small shared state between the push wiring (push.service.ts) and the screens, kept free of
// navigation and SDK imports so screens can use it anywhere (PO 28/11/2026).
import type { PushNoticeItem } from './push-routing';

let openConversationId: string | null = null;
/** A tapped notice waiting for the role's notification screen to open it. */
let pendingNotice: PushNoticeItem | null = null;
const noticeListeners = new Set<() => void>();

/** The chat thread on screen, so its own messages do not also drop down from the top. */
export function setOpenConversation(conversationId: string | null): void {
  openConversationId = conversationId;
}

export function getOpenConversation(): string | null {
  return openConversationId;
}

export function setPendingNotice(item: PushNoticeItem | null): void {
  pendingNotice = item;
}

/** Tells an already mounted notification screen to take the notice (after navigating to it). */
export function announcePendingNotice(): void {
  if (pendingNotice) noticeListeners.forEach((listener) => listener());
}

/** The role's notification screen takes the tapped notice once, then opens it like a tap in its list. */
export function takePendingNotice(): PushNoticeItem | null {
  const item = pendingNotice;
  pendingNotice = null;
  return item;
}

export function onPendingNotice(listener: () => void): () => void {
  noticeListeners.add(listener);
  return () => {
    noticeListeners.delete(listener);
  };
}
