import { NOTE_MAX_LENGTH, loadNote, noteKey, saveNote, type NoteStorage } from './technician-notes';

jest.mock('@react-native-async-storage/async-storage', () => ({ __esModule: true, default: {} }));

function memory(): NoteStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: async (k) => data.get(k) ?? null,
    setItem: async (k, v) => { data.set(k, v); },
    removeItem: async (k) => { data.delete(k); },
  };
}

describe('technician notes', () => {
  it('round-trips a trimmed note under a per-user, per-order key', async () => {
    const s = memory();
    expect(await saveNote('u1', 'o1', '  khách có chó  ', s)).toBe(true);
    expect(s.data.get(noteKey('u1', 'o1'))).toBe('khách có chó');
    expect(await loadNote('u1', 'o1', s)).toBe('khách có chó');
    expect(await loadNote('u2', 'o1', s)).toBe('');
    expect(await loadNote('u1', 'o2', s)).toBe('');
  });

  it('removes the note when saved blank and caps the length', async () => {
    const s = memory();
    await saveNote('u1', 'o1', 'abc', s);
    await saveNote('u1', 'o1', '   ', s);
    expect(s.data.size).toBe(0);
    await saveNote('u1', 'o1', 'x'.repeat(NOTE_MAX_LENGTH + 50), s);
    expect((await loadNote('u1', 'o1', s)).length).toBe(NOTE_MAX_LENGTH);
  });

  it('refuses without a user and survives storage failures', async () => {
    const s = memory();
    expect(await saveNote(null, 'o1', 'a', s)).toBe(false);
    expect(await loadNote(null, 'o1', s)).toBe('');
    const broken: NoteStorage = {
      getItem: async () => { throw new Error('x'); },
      setItem: async () => { throw new Error('x'); },
      removeItem: async () => { throw new Error('x'); },
    };
    expect(await saveNote('u1', 'o1', 'a', broken)).toBe(false);
    expect(await loadNote('u1', 'o1', broken)).toBe('');
  });
});
