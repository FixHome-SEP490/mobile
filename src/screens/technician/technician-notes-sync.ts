// TECH 42 (PO 13/11/2026): the private note now lives on the server (GET/PUT
// /service-orders/:id/my-note) so web and mobile show the same text. A note written earlier on
// this device is moved up the first time the server has none, then the device copy is removed.
import apiClient from '../../api/client';
import { NOTE_MAX_LENGTH, loadNote, saveNote, type NoteStorage } from './technician-notes';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface NoteApi {
  get(url: string): Promise<{ data?: { data?: { note?: string } } }>;
  put(url: string, body: unknown): Promise<{ data?: { data?: { note?: string } } }>;
}

const url = (orderId: string) => `/service-orders/${orderId}/my-note`;

export async function loadSyncedNote(
  userId: string | null, orderId: string, api: NoteApi = apiClient as unknown as NoteApi, storage: NoteStorage = AsyncStorage,
): Promise<{ note: string; ok: boolean }> {
  if (!userId) return { note: '', ok: false };
  try {
    const server = (await api.get(url(orderId))).data?.data?.note ?? '';
    if (server) return { note: server, ok: true };
    const local = await loadNote(userId, orderId, storage);
    if (!local) return { note: '', ok: true };
    const moved = (await api.put(url(orderId), { note: local.slice(0, NOTE_MAX_LENGTH) })).data?.data?.note ?? local;
    await saveNote(userId, orderId, '', storage);
    return { note: moved, ok: true };
  } catch {
    return { note: await loadNote(userId, orderId, storage), ok: false };
  }
}

/** Saves the trimmed note on the server (blank clears it). False when the server did not take it. */
export async function saveSyncedNote(
  userId: string | null, orderId: string, text: string, api: NoteApi = apiClient as unknown as NoteApi, storage: NoteStorage = AsyncStorage,
): Promise<{ note: string } | null> {
  if (!userId) return null;
  const value = text.trim().slice(0, NOTE_MAX_LENGTH);
  try {
    const note = (await api.put(url(orderId), { note: value })).data?.data?.note ?? value;
    await saveNote(userId, orderId, '', storage);
    return { note };
  } catch {
    return null;
  }
}
