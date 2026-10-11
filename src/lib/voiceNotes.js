// On-device storage for voice notes.
//
// - The audio files live in the app's private document folder
//   (Paths.document/voice-notes/<id>.m4a), so they survive app restarts and
//   are not wiped like the cache folder can be.
// - A small JSON index in AsyncStorage keeps each note's date, length,
//   transcript and status.
// - Nothing here talks to the network; transcription is passed in as a
//   function (see saveAndTranscribe), so this file is easy to test.
//
// In the browser (Expo web) there is no real file system, so notes are kept
// in memory for the session only.

import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Directory, File, Paths } from 'expo-file-system';

const INDEX_KEY = 'ai-cofounder-voice-notes-v1';
const IS_WEB = Platform.OS === 'web';

export const VOICE_NOTES_PERSIST = !IS_WEB;
export const AUDIO_EXT = IS_WEB ? 'webm' : 'm4a';
export const AUDIO_MIME = IS_WEB ? 'audio/webm' : 'audio/m4a';

const STALE_TRANSCRIPTION_MS = 3 * 60 * 1000;

let webNotes = [];

// AsyncStorage is read-modify-write, so run every change one at a time —
// otherwise a transcript arriving while another note is being saved could
// overwrite it.
let queue = Promise.resolve();
function serial(task) {
  const run = queue.then(task);
  queue = run.catch(() => {});
  return run;
}

async function readIndex() {
  if (IS_WEB) return webNotes;
  try {
    const raw = await AsyncStorage.getItem(INDEX_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

async function writeIndex(list) {
  if (IS_WEB) {
    webNotes = list;
    return;
  }
  await AsyncStorage.setItem(INDEX_KEY, JSON.stringify(list));
}

function notesDirectory() {
  const dir = new Directory(Paths.document, 'voice-notes');
  dir.create({ intermediates: true, idempotent: true });
  return dir;
}

// Moves the fresh recording out of the cache folder into permanent storage.
async function persistAudio(tempUri, id) {
  if (IS_WEB) return tempUri;
  const target = new File(notesDirectory(), `${id}.${AUDIO_EXT}`);
  const source = new File(tempUri);
  try {
    await source.move(target);
  } catch {
    await source.copy(target); // keep the cache copy if a move isn't possible
  }
  return target.uri;
}

function fileExists(uri) {
  if (IS_WEB) return true;
  try {
    return new File(uri).exists;
  } catch {
    return false;
  }
}

/** All notes, newest first. Drops entries whose audio file has gone missing. */
export function listNotes() {
  return serial(async () => {
    const list = await readIndex();
    const now = Date.now();
    let changed = false;

    const cleaned = list
      .filter((n) => {
        const keep = fileExists(n.uri);
        if (!keep) changed = true;
        return keep;
      })
      .map((n) => {
        // The app was closed mid-transcription: let the user retry.
        if (n.status === 'transcribing' && now - new Date(n.createdAt).getTime() > STALE_TRANSCRIPTION_MS) {
          changed = true;
          return { ...n, status: 'failed', error: 'Transcription was interrupted. Tap Retry.' };
        }
        return n;
      });

    if (changed) await writeIndex(cleaned);
    return cleaned;
  });
}

/** Saves a finished recording and returns the new note (status: 'transcribing'). */
export function addNote({ uri, durationMs, language }) {
  return serial(async () => {
    const id = `vn_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    const savedUri = await persistAudio(uri, id);
    const note = {
      id,
      uri: savedUri,
      createdAt: new Date().toISOString(),
      durationMs: Math.round(durationMs || 0),
      transcript: '',
      status: 'transcribing', // transcribing | done | failed
      language: language || 'en',
      error: null,
    };
    await writeIndex([note, ...(await readIndex())]);
    return note;
  });
}

export function updateNote(id, patch) {
  return serial(async () => {
    const list = await readIndex();
    let updated = null;
    const next = list.map((n) => {
      if (n.id !== id) return n;
      updated = { ...n, ...patch };
      return updated;
    });
    if (updated) await writeIndex(next);
    return updated;
  });
}

/** Removes the audio file and the index entry. */
export function deleteNote(id) {
  return serial(async () => {
    const list = await readIndex();
    const note = list.find((n) => n.id === id);
    if (note && !IS_WEB) {
      try {
        const file = new File(note.uri);
        if (file.exists) file.delete();
      } catch {
        /* file already gone */
      }
    }
    await writeIndex(list.filter((n) => n.id !== id));
  });
}

/**
 * Runs speech-to-text on an already-saved note and records the outcome.
 * `transcribe` is AppContext's transcribeAudio: ({ uri, language }) => { ok, text?, error? }.
 */
export async function transcribeNote(note, { language, transcribe }) {
  await updateNote(note.id, { status: 'transcribing', error: null, language });
  const res = await transcribe({ uri: note.uri, language });

  if (res.ok && res.text) {
    const updated = await updateNote(note.id, { transcript: res.text, status: 'done', error: null });
    return { ok: true, note: updated, text: res.text };
  }
  if (res.ok) {
    const error = 'No speech was detected in this recording.';
    const updated = await updateNote(note.id, { transcript: '', status: 'done', error });
    return { ok: false, empty: true, note: updated, error };
  }
  const updated = await updateNote(note.id, { status: 'failed', error: res.error });
  return { ok: false, note: updated, error: res.error };
}

/** Save a new recording on the device, then transcribe it. The audio is kept even if transcription fails. */
export async function saveAndTranscribe({ uri, durationMs, language, transcribe, onSaved }) {
  const note = await addNote({ uri, durationMs, language });
  onSaved?.(note);
  return transcribeNote(note, { language, transcribe });
}

export function formatDuration(ms) {
  const total = Math.max(0, Math.round((ms || 0) / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}
