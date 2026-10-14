// Private technician notes per order. Stored on this device only (AsyncStorage): they never
// reach the Backend or the customer, and are keyed by user so accounts do not see each other's.
import AsyncStorage from '@react-native-async-storage/async-storage';

export const NOTE_MAX_LENGTH = 2000;

const pendingNoteOperations = new WeakMap<NoteStorage, Map<string, Promise<void>>>();

export interface NoteStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

export const noteKey = (userId: string, orderId: string) => `tech-note:${userId}:${orderId}`;

function enqueueNoteOperation<T>(storage: NoteStorage, key: string, operation: () => Promise<T>): Promise<T> {
  let operations = pendingNoteOperations.get(storage);
  if (!operations) {
    operations = new Map();
    pendingNoteOperations.set(storage, operations);
  }

  const previous = operations.get(key) ?? Promise.resolve();
  const current = previous.then(operation);
  const settled = current.then(() => undefined, () => undefined);
  operations.set(key, settled);
  void settled.then(() => {
    if (operations?.get(key) !== settled) return;
    operations.delete(key);
    if (operations.size === 0) pendingNoteOperations.delete(storage);
  });
  return current;
}

export async function loadNote(
  userId: string | null,
  orderId: string,
  storage: NoteStorage = AsyncStorage,
): Promise<string> {
  if (!userId) return '';
  try {
    const key = noteKey(userId, orderId);
    return await enqueueNoteOperation(storage, key, async () => (await storage.getItem(key)) ?? '');
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
  const key = noteKey(userId, orderId);
  try {
    return await enqueueNoteOperation(storage, key, async () => {
      if (value) await storage.setItem(key, value);
      else await storage.removeItem(key);
      return true;
    });
  } catch {
    return false;
  }
}
