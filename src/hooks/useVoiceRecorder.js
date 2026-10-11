import { useCallback, useEffect, useRef, useState } from 'react';
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';

// Speech doesn't need stereo or high bitrates: mono AAC at 48 kbps is about
// 360 KB per minute and transcribes just as well.
const SPEECH_RECORDING = {
  ...RecordingPresets.HIGH_QUALITY,
  numberOfChannels: 1,
  bitRate: 48000,
};

/**
 * Tap-to-record / tap-to-stop voice recorder.
 *
 *   const rec = useVoiceRecorder({ onFinish: ({ uri, durationMs, tooShort }) => ... });
 *   const r = await rec.start();   // { ok: true } or { ok: false, error, denied? }
 *   await rec.stop();              // also fires onFinish
 *
 * Recording stops by itself at `maxMs` (also fires onFinish).
 */
export function useVoiceRecorder({ maxMs = 120000, minMs = 800, onFinish } = {}) {
  const recorder = useAudioRecorder(SPEECH_RECORDING);
  const state = useAudioRecorderState(recorder, 200);

  const [phase, setPhaseState] = useState('idle'); // idle | starting | recording | stopping
  const phaseRef = useRef('idle');
  const lastDurationRef = useRef(0);
  const onFinishRef = useRef(onFinish);

  useEffect(() => {
    onFinishRef.current = onFinish;
  }, [onFinish]);

  const setPhase = (next) => {
    phaseRef.current = next;
    setPhaseState(next);
  };

  useEffect(() => {
    if (phaseRef.current === 'recording') lastDurationRef.current = state.durationMillis || 0;
  }, [state.durationMillis]);

  const start = useCallback(async () => {
    if (phaseRef.current !== 'idle') return { ok: false, error: 'Already recording.' };
    setPhase('starting');
    try {
      const permission = await requestRecordingPermissionsAsync();
      if (!permission.granted) {
        setPhase('idle');
        return {
          ok: false,
          denied: true,
          error: 'Microphone permission is needed to record voice notes. You can turn it on in your phone settings.',
        };
      }
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      lastDurationRef.current = 0;
      recorder.record();
      setPhase('recording');
      return { ok: true };
    } catch (e) {
      setPhase('idle');
      return { ok: false, error: `Couldn't start recording${e?.message ? `: ${e.message}` : '.'}` };
    }
  }, [recorder]);

  const finish = useCallback(
    async (discard) => {
      if (phaseRef.current !== 'recording') return null;
      setPhase('stopping');

      let durationMs = lastDurationRef.current;
      try {
        durationMs = Math.max(durationMs, recorder.getStatus().durationMillis || 0);
      } catch {
        /* keep the polled value */
      }

      let uri = null;
      try {
        await recorder.stop();
        uri = recorder.uri;
      } catch {
        /* handled below: no uri => nothing to return */
      }
      // Leave "recording" audio mode so playback uses the loudspeaker again (iOS).
      try {
        await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
      } catch {
        /* non-fatal */
      }
      setPhase('idle');

      if (discard || !uri) return null;
      if (durationMs < minMs) return { tooShort: true, durationMs };
      return { uri, durationMs };
    },
    [recorder, minMs]
  );

  const stop = useCallback(async () => {
    const result = await finish(false);
    if (result) onFinishRef.current?.(result);
    return result;
  }, [finish]);

  const cancel = useCallback(() => finish(true), [finish]);

  // Auto-stop at the maximum length.
  useEffect(() => {
    if (phase === 'recording' && (state.durationMillis || 0) >= maxMs) stop();
  }, [phase, state.durationMillis, maxMs, stop]);

  // Don't leave the microphone open if the screen goes away mid-recording.
  useEffect(
    () => () => {
      if (phaseRef.current === 'recording') recorder.stop().catch(() => {});
    },
    [recorder]
  );

  return {
    phase,
    isRecording: phase === 'recording',
    busy: phase !== 'idle',
    elapsedMs: phase === 'recording' ? state.durationMillis || 0 : 0,
    maxMs,
    start,
    stop,
    cancel,
  };
}
