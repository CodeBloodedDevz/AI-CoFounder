// Native microphone for Live Voice (iOS / Android) using expo-audio.
// Keeps one recording running and reports its loudness (dB) ~12x a second so
// the session can tell speech from silence. cut() ends the current segment
// and immediately starts the next one.

import { Platform } from 'react-native';
import { AudioModule, RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync } from 'expo-audio';
import { File } from 'expo-file-system';
import { tr } from '../../i18n/current';

const PRESET = {
  ...RecordingPresets.HIGH_QUALITY,
  numberOfChannels: 1,
  bitRate: 48000,
  isMeteringEnabled: true,
};

// expo-audio's own useAudioRecorder() flattens a preset ({ ios: {...}, android: {...} }) into the options
// the native recorder understands. Creating the recorder directly (as this file does, to swap recorders
// without React) skipped that step, so the phone got options it ignored: wrong container / encoder, and an
// uploaded "m4a" that the speech recogniser could not read. Same flattening here.
export function nativeRecordingOptions(preset = PRESET, os = Platform.OS) {
  const common = {
    extension: preset.extension,
    sampleRate: preset.sampleRate,
    numberOfChannels: preset.numberOfChannels,
    bitRate: preset.bitRate,
    isMeteringEnabled: preset.isMeteringEnabled ?? false,
  };
  const platform = os === 'ios' ? preset.ios : os === 'android' ? preset.android : preset.web;
  return { ...common, directory: preset.directory, ...(platform || {}) };
}

const OPTIONS = nativeRecordingOptions();
const POLL_MS = 80;

export function createMicListener() {
  let recorder = null;
  let timer = null;
  let onLevel = null;
  let running = false;
  let busy = false; // true while swapping recorders: no level reports
  let startedAt = 0;

  const remove = (uri) => {
    if (!uri) return;
    try {
      const f = new File(uri);
      if (f.exists) f.delete();
    } catch (e) {
      /* already gone */
    }
  };

  async function begin() {
    recorder = new AudioModule.AudioRecorder(OPTIONS);
    await recorder.prepareToRecordAsync();
    recorder.record();
    startedAt = Date.now();
  }

  async function end() {
    const rec = recorder;
    recorder = null;
    if (!rec) return null;
    let uri = null;
    try {
      await rec.stop();
      uri = rec.uri || rec.getStatus?.().url || null;
    } catch (e) {
      uri = null;
    }
    try {
      rec.release?.();
    } catch (e) {
      /* already released */
    }
    return uri;
  }

  async function swap() {
    busy = true;
    const durationMs = Date.now() - startedAt;
    const uri = await end();
    if (running) {
      try {
        await begin();
      } catch (e) {
        running = false;
      }
    }
    busy = false;
    return { uri, durationMs };
  }

  return {
    async start(levelCallback) {
      const permission = await requestRecordingPermissionsAsync();
      if (!permission.granted) {
        const err = new Error(tr('mic.permission'));
        err.code = 'permission';
        err.blocked = permission.canAskAgain === false;
        throw err;
      }
      // Keep replies on the loudspeaker while the microphone stays open for the next turn (Android routes
      // recording sessions to the earpiece otherwise).
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true, shouldRouteThroughEarpiece: false });
      onLevel = levelCallback;
      running = true;
      await begin();
      timer = setInterval(() => {
        if (busy || !recorder) return;
        try {
          const db = recorder.getStatus?.().metering;
          if (typeof db === 'number') onLevel?.(db);
        } catch (e) {
          /* recorder is being replaced */
        }
      }, POLL_MS);
    },

    /** Ends the current segment and starts the next. -> { uri, durationMs } */
    async cut() {
      if (!running) return null;
      const seg = await swap();
      if (!seg.uri) return null;
      return seg;
    },

    /** Throws away what has been recorded so far and starts fresh. */
    async discard() {
      if (!running) return;
      const seg = await swap();
      remove(seg.uri);
    },

    release(segment) {
      remove(segment?.uri);
    },

    async stop() {
      running = false;
      clearInterval(timer);
      timer = null;
      const uri = await end();
      remove(uri);
      try {
        await setAudioModeAsync({ allowsRecording: false });
      } catch (e) {
        /* not important */
      }
    },
  };
}
