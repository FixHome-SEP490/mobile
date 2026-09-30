// Private technician notes per order. Stored on this device only (AsyncStorage): they never
// reach the Backend or the customer, and are keyed by user so accounts do not see each other's.
import AsyncStorage from '@react-native-async-storage/async-storage';

export const NOTE_MAX_LENGTH = 2000;

export interface NoteStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

export const noteKey = (userId: string, orderId: string) => `tech-note:${userId}:${orderId}`;

export async function loadNote(
  userId: string | null,
  orderId: string,
  storage: NoteStorage = AsyncStorage,
): Promise<string> {
  if (!userId) return '';
  try {
    return (await storage.getItem(noteKey(userId, orderId))) ?? '';
  } catch {
    return '';
  }
}

/** Saves the trimmed note (blank removes it). Returns false when the device storage failed. */
export async function saveNote(
  userId: string | null,
  orderId: string,
  text: string,
  storage: NoteStorage = AsyncStorage,
): Promise<boolean> {
  if (!userId) return false;
  const value = text.trim().slice(0, NOTE_MAX_LENGTH);
  try {
    if (value) await storage.setItem(noteKey(userId, orderId), value);
    else await storage.removeItem(noteKey(userId, orderId));
    return true;
  } catch {
    return false;
  }
}
