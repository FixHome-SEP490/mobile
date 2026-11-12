import { loadSyncedNote, saveSyncedNote, type NoteApi } from './technician-notes-sync';
import { noteKey, type NoteStorage } from './technician-notes';

function memory(initial: Record<string, string> = {}): NoteStorage & { data: Record<string, string> } {
  const data = { ...initial };
  return { data, getItem: async (k) => data[k] ?? null, setItem: async (k, v) => { data[k] = v; }, removeItem: async (k) => { delete data[k]; } };
}
const api = (server: string, fail = false): NoteApi & { put: jest.Mock } => ({
  get: jest.fn(async () => { if (fail) throw new Error('offline'); return { data: { data: { note: server } } }; }),
  put: jest.fn(async (_u: string, body: any) => ({ data: { data: { note: body.note } } })),
}) as any;

describe('TECH 42 synced private note', () => {
  it('reads the server note first', async () => {
    const a = api('Gọi trước khi tới');
    expect(await loadSyncedNote('t1', 'o1', a, memory())).toEqual({ note: 'Gọi trước khi tới', ok: true });
    expect(a.put).not.toHaveBeenCalled();
  });
  it('moves an earlier device note up once and removes the device copy', async () => {
    const store = memory({ [noteKey('t1', 'o1')]: 'Nhà có chó' });
    const a = api('');
    expect(await loadSyncedNote('t1', 'o1', a, store)).toEqual({ note: 'Nhà có chó', ok: true });
    expect(a.put).toHaveBeenCalledWith('/service-orders/o1/my-note', { note: 'Nhà có chó' });
    expect(store.data[noteKey('t1', 'o1')]).toBeUndefined();
  });
  it('falls back to the device note when offline, and saves trimmed text to the server', async () => {
    const store = memory({ [noteKey('t1', 'o1')]: 'cũ' });
    expect(await loadSyncedNote('t1', 'o1', api('', true), store)).toEqual({ note: 'cũ', ok: false });
    const a = api('');
    expect(await saveSyncedNote('t1', 'o1', '  mới  ', a, store)).toEqual({ note: 'mới' });
    expect(a.put).toHaveBeenCalledWith('/service-orders/o1/my-note', { note: 'mới' });
  });
});
