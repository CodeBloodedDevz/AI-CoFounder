import AsyncStorage from '@react-native-async-storage/async-storage';
import * as fsMock from 'expo-file-system';
import {
  addNote,
  deleteNote,
  formatDuration,
  listNotes,
  saveAndTranscribe,
  transcribeNote,
  updateNote,
} from './voiceNotes';

// In-memory stand-in for the phone's file system.
jest.mock('expo-file-system', () => {
  const files = new Set();
  const join = (parts) => parts.map((p) => (typeof p === 'string' ? p : p.uri)).join('/');
  class Directory {
    constructor(...parts) {
      this.uri = join(parts);
    }
    create() {}
  }
  class File {
    constructor(...parts) {
      this.uri = join(parts);
    }
    get exists() {
      return files.has(this.uri);
    }
    async move(dest) {
      files.delete(this.uri);
      files.add(dest.uri);
    }
    async copy(dest) {
      files.add(dest.uri);
    }
    delete() {
      files.delete(this.uri);
    }
  }
  return { Directory, File, Paths: { document: { uri: 'file:///docs' } }, __files: files };
});

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

const cacheRecording = (name = 'rec.m4a') => {
  const uri = `file:///cache/${name}`;
  fsMock.__files.add(uri);
  return uri;
};

beforeEach(async () => {
  await AsyncStorage.clear();
  fsMock.__files.clear();
});

describe('addNote', () => {
  it('moves the recording into permanent storage and indexes it', async () => {
    const temp = cacheRecording();
    const note = await addNote({ uri: temp, durationMs: 4200, language: 'en' });

    expect(note.uri).toMatch(/^file:\/\/\/docs\/voice-notes\/vn_.*\.m4a$/);
    expect(fsMock.__files.has(note.uri)).toBe(true);
    expect(fsMock.__files.has(temp)).toBe(false); // moved, not copied
    expect(note.status).toBe('transcribing');
    expect(await listNotes()).toHaveLength(1);
  });

  it('keeps every note when several are saved at once', async () => {
    await Promise.all([1, 2, 3, 4].map((i) => addNote({ uri: cacheRecording(`r${i}.m4a`), durationMs: 1000 })));
    expect(await listNotes()).toHaveLength(4);
  });
});

describe('listNotes', () => {
  it('drops notes whose audio file has disappeared', async () => {
    const a = await addNote({ uri: cacheRecording('a.m4a'), durationMs: 1000 });
    const b = await addNote({ uri: cacheRecording('b.m4a'), durationMs: 1000 });
    fsMock.__files.delete(a.uri);

    const notes = await listNotes();
    expect(notes.map((n) => n.id)).toEqual([b.id]);
  });

  it('marks a transcription that never finished as failed so it can be retried', async () => {
    const note = await addNote({ uri: cacheRecording(), durationMs: 1000 });
    const raw = JSON.parse(await AsyncStorage.getItem('ai-cofounder-voice-notes-v1'));
    raw[0].createdAt = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    await AsyncStorage.setItem('ai-cofounder-voice-notes-v1', JSON.stringify(raw));

    const [stale] = await listNotes();
    expect(stale.id).toBe(note.id);
    expect(stale.status).toBe('failed');
  });
});

describe('transcription', () => {
  it('stores the transcript and keeps the audio when it works', async () => {
    const transcribe = jest.fn().mockResolvedValue({ ok: true, text: 'Sold five Coke for R75' });
    const out = await saveAndTranscribe({ uri: cacheRecording(), durationMs: 3000, language: 'en', transcribe });

    expect(out.ok).toBe(true);
    expect(out.note.transcript).toBe('Sold five Coke for R75');
    expect(out.note.status).toBe('done');
    expect(transcribe).toHaveBeenCalledWith({ uri: out.note.uri, language: 'en' });
  });

  it('still keeps the recording when transcription fails, and a retry can succeed', async () => {
    const failing = jest.fn().mockResolvedValue({ ok: false, error: 'offline' });
    const first = await saveAndTranscribe({ uri: cacheRecording(), durationMs: 3000, language: 'en', transcribe: failing });
    expect(first.ok).toBe(false);
    expect(first.note.status).toBe('failed');
    expect(fsMock.__files.has(first.note.uri)).toBe(true);

    const working = jest.fn().mockResolvedValue({ ok: true, text: 'hello' });
    const retry = await transcribeNote(first.note, { language: 'af', transcribe: working });
    expect(retry.ok).toBe(true);
    expect(retry.note.transcript).toBe('hello');
    expect(retry.note.language).toBe('af');
  });

  it('reports silence as empty, not as an error', async () => {
    const transcribe = jest.fn().mockResolvedValue({ ok: true, text: '' });
    const out = await saveAndTranscribe({ uri: cacheRecording(), durationMs: 3000, language: 'en', transcribe });
    expect(out.ok).toBe(false);
    expect(out.empty).toBe(true);
  });
});

describe('deleteNote / updateNote', () => {
  it('removes the file and the index entry', async () => {
    const note = await addNote({ uri: cacheRecording(), durationMs: 1000 });
    await deleteNote(note.id);
    expect(fsMock.__files.has(note.uri)).toBe(false);
    expect(await listNotes()).toHaveLength(0);
  });

  it('updating an unknown id is a no-op', async () => {
    expect(await updateNote('nope', { transcript: 'x' })).toBeNull();
  });
});

describe('formatDuration', () => {
  it('formats as m:ss', () => {
    expect(formatDuration(0)).toBe('0:00');
    expect(formatDuration(7400)).toBe('0:07');
    expect(formatDuration(83000)).toBe('1:23');
    expect(formatDuration(undefined)).toBe('0:00');
  });
});
