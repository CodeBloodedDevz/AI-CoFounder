import { useCallback, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { tr } from '../i18n/current';
import { createMicListener } from '../lib/voice/micListener';
import { createVad } from '../lib/voice/vad';
import { createUtteranceCapture } from '../lib/voice/utterance';
import { DEFAULT_VOICE_SETTINGS, SENSITIVITY_MARGIN_DB, VOICE_SETTINGS_KEY, sanitizeSettings } from '../lib/voice/settings';

/**
 * Voice input that sends by itself when you stop talking (the chat microphone and Voice Notes).
 * Same shape as the old tap-to-record hook, so screens barely change:
 *
 *   const mic = useAutoVoiceInput({ purpose: 'chat' | 'note', onFinish });
 *   await mic.start();   // { ok: true } once the microphone is open, or { ok: false, error, denied, blocked }
 *   mic.stop();          // send now (what was said so far)        mic.cancel();  // throw it away
 *   mic.phase            // 'idle' | 'starting' | 'recording' | 'stopping';  mic.hearing: speech right now
 *   onFinish({ uri, durationMs }) | onFinish({ empty: true }) | onFinish({ tooShort: true }) | onFinish({ error })
 *
 * The pause that ends a message and the microphone sensitivity are the Live Voice settings (one place to
 * adjust them). Voice notes allow longer thinking pauses than chat questions.
 */
export function useAutoVoiceInput({ purpose = 'chat', onFinish } = {}) {
  const [phase, setPhase] = useState('idle');
  const [hearing, setHearing] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const capRef = useRef(null);
  const onFinishRef = useRef(onFinish);
  const settingsRef = useRef(DEFAULT_VOICE_SETTINGS);
  const timerRef = useRef(null);
  useEffect(() => {
    onFinishRef.current = onFinish;
  }, [onFinish]);

  // The user's voice settings (pause before sending, sensitivity), shared with Live Voice.
  const loadSettings = useCallback(async () => {
    try {
      const raw = await AsyncStorage.getItem(VOICE_SETTINGS_KEY);
      settingsRef.current = sanitizeSettings(raw ? JSON.parse(raw) : null);
    } catch (e) {
      settingsRef.current = DEFAULT_VOICE_SETTINGS;
    }
  }, []);

  const stopTimer = () => {
    clearInterval(timerRef.current);
    timerRef.current = null;
  };

  useEffect(
    () => () => {
      stopTimer();
      capRef.current?.cancel(); // leaving the screen never sends a half-finished recording
    },
    []
  );

  const start = useCallback(async () => {
    if (capRef.current && capRef.current.state !== 'done') return { ok: false, error: tr('rec.already') };
    await loadSettings();
    const s = settingsRef.current;
    const note = purpose === 'note';
    const vadOptions = {
      silenceMs: note ? Math.max(1800, Math.round(s.pauseMs * 1.6)) : s.pauseMs,
      marginDb: SENSITIVITY_MARGIN_DB[s.sensitivity] ?? SENSITIVITY_MARGIN_DB.normal,
      maxUtteranceMs: note ? 120000 : 60000,
    };
    setElapsedMs(0);
    setHearing(false);
    let openResolve;
    const opened = new Promise((r) => (openResolve = r));
    const cap = createUtteranceCapture({
      listener: createMicListener(),
      makeVad: createVad,
      vadOptions,
      noSpeechMs: note ? 10000 : 8000,
      onState: (st) => {
        if (st === 'starting') setPhase('starting');
        else if (st === 'listening' || st === 'hearing') {
          setPhase('recording');
          setHearing(st === 'hearing');
          if (!timerRef.current) {
            const began = Date.now();
            timerRef.current = setInterval(() => setElapsedMs(Date.now() - began), 250);
          }
          openResolve({ ok: true });
        } else if (st === 'finishing') {
          setPhase('stopping');
          setHearing(false);
          stopTimer();
        } else if (st === 'done') {
          setPhase('idle');
          setHearing(false);
          stopTimer();
        }
      },
    });
    capRef.current = cap;
    cap.start().then((res) => {
      if (res.ok === false && res.error !== 'recording_failed') {
        // The microphone didn't open (permission, busy, not available).
        openResolve({
          ok: false,
          denied: res.denied,
          blocked: res.blocked,
          error: res.denied ? tr('rec.permission') : tr('rec.couldntStartWith', { reason: res.error }),
        });
        return;
      }
      if (res.cancelled) return;
      if (res.ok) onFinishRef.current?.({ uri: res.uri, durationMs: res.durationMs });
      else if (res.tooShort) onFinishRef.current?.({ tooShort: true });
      else if (res.empty) onFinishRef.current?.({ empty: true });
      else onFinishRef.current?.({ error: tr('chat.recordingWentWrong') });
    });
    return opened;
  }, [loadSettings, purpose]);

  const stop = useCallback(() => capRef.current?.finish(), []);
  const cancel = useCallback(() => capRef.current?.cancel(), []);

  return {
    start,
    stop,
    cancel,
    phase,
    hearing,
    elapsedMs,
    isRecording: phase === 'recording',
    busy: phase === 'starting' || phase === 'stopping',
  };
}
