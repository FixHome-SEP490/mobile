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

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
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

  it('serializes same-key writes so later saves persist after earlier saves', async () => {
    const firstWrite = deferred<void>();
    const values: string[] = [];
    let stored = '';
    const s: NoteStorage = {
      getItem: async () => stored || null,
      setItem: async (_key, value) => {
        values.push(value);
        if (value === 'first') await firstWrite.promise;
        stored = value;
      },
      removeItem: async () => { stored = ''; },
    };

    const first = saveNote('u1', 'o1', 'first', s);
    await Promise.resolve();
    const second = saveNote('u1', 'o1', 'second', s);
    await Promise.resolve();
    expect(values).toEqual(['first']);
    firstWrite.resolve();
    await expect(Promise.all([first, second])).resolves.toEqual([true, true]);
    expect(values).toEqual(['first', 'second']);
    expect(stored).toBe('second');
  });

  it('waits for a pending same-key write before a remounted screen reads the note', async () => {
    const pendingWrite = deferred<void>();
    let stored = 'old value';
    let reads = 0;
    const s: NoteStorage = {
      getItem: async () => { reads += 1; return stored; },
      setItem: async (_key, value) => { await pendingWrite.promise; stored = value; },
      removeItem: async () => { await pendingWrite.promise; stored = ''; },
    };

    const saving = saveNote('u1', 'o1', 'new value', s);
    await Promise.resolve();
    const loading = loadNote('u1', 'o1', s);
    await Promise.resolve();
    expect(reads).toBe(0);
    pendingWrite.resolve();
    await expect(saving).resolves.toBe(true);
    await expect(loading).resolves.toBe('new value');
    expect(reads).toBe(1);
  });
});
