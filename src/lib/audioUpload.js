// Reading a recording so it can be sent to the server for speech-to-text.
//
// Why this exists: voice used to be uploaded as multipart form data that pointed the phone's networking
// layer at the recording's file path ({ uri, name, type }). That is the one kind of request nothing else in
// the app makes, and when the phone can't open that file for the upload (a moved / cached recording, an
// Expo Go storage path) React Native reports it as a *network* failure, which the app showed as
// "Couldn't connect to server" even though the server was fine. Now the app reads the recording itself and
// sends it as ordinary JSON through the same client every other request uses (same server address, login
// token refresh, timeouts and error messages). A file problem is reported as a file problem.

import { Platform } from 'react-native';
import { File } from 'expo-file-system';
import { audioFileInfo } from './voiceNotes';

export const MAX_UPLOAD_BYTES = 12 * 1024 * 1024; // matches the server (about 20 minutes of speech)

export class RecordingError extends Error {
  constructor(code, message) {
    super(message || code);
    this.name = 'RecordingError';
    this.code = code; // 'missing' | 'empty' | 'too_large' | 'unreadable'
  }
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** Uint8Array -> base64 (no dependency on btoa, which not every JavaScript engine has). */
export function bytesToBase64(bytes) {
  let out = '';
  const n = bytes.length;
  for (let i = 0; i < n; i += 3) {
    const a = bytes[i];
    const b = i + 1 < n ? bytes[i + 1] : 0;
    const c = i + 2 < n ? bytes[i + 2] : 0;
    const triple = (a << 16) | (b << 8) | c;
    out += B64[(triple >> 18) & 63] + B64[(triple >> 12) & 63];
    out += i + 1 < n ? B64[(triple >> 6) & 63] : '=';
    out += i + 2 < n ? B64[triple & 63] : '=';
  }
  return out;
}

const extFromMime = (mime) => {
  const t = String(mime || '').toLowerCase();
  if (t.includes('ogg')) return 'ogg';
  if (t.includes('mp4') || t.includes('m4a') || t.includes('aac')) return 'm4a';
  if (t.includes('wav')) return 'wav';
  if (t.includes('mpeg') || t.includes('mp3')) return 'mp3';
  return 'webm';
};

/**
 * Reads a recording for upload.  -> { audio (base64), filename, mimeType, bytes }
 * Throws RecordingError when the file is missing, empty or too large.
 */
export async function readRecording(uri, { os = Platform.OS, name = 'voice' } = {}) {
  if (!uri) throw new RecordingError('missing');

  if (os === 'web') {
    let blob;
    try {
      blob = await (await fetch(uri)).blob();
    } catch (e) {
      throw new RecordingError('unreadable', e?.message);
    }
    if (!blob.size) throw new RecordingError('empty');
    if (blob.size > MAX_UPLOAD_BYTES) throw new RecordingError('too_large');
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const ext = extFromMime(blob.type);
    return { audio: bytesToBase64(bytes), filename: `${name}.${ext}`, mimeType: blob.type || `audio/${ext}`, bytes: bytes.length };
  }

  let file;
  try {
    file = new File(uri);
  } catch (e) {
    throw new RecordingError('unreadable', e?.message);
  }
  if (!file.exists) throw new RecordingError('missing');
  const size = Number(file.size || 0);
  if (size > MAX_UPLOAD_BYTES) throw new RecordingError('too_large');

  let audio;
  try {
    if (typeof file.base64 === 'function') audio = await file.base64();
    else if (typeof file.bytes === 'function') audio = bytesToBase64(await file.bytes());
    else audio = bytesToBase64(new Uint8Array(await file.arrayBuffer()));
  } catch (e) {
    throw new RecordingError('unreadable', e?.message);
  }
  if (!audio) throw new RecordingError('empty');
  const { ext, mime } = audioFileInfo(uri);
  return { audio, filename: `${name}.${ext}`, mimeType: mime, bytes: size || Math.floor((audio.length * 3) / 4) };
}
