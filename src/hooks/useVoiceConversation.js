import { useCallback, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useApp } from '../context/AppContext';
import { VoiceSession, STATES } from '../lib/voice/session';
import { DEFAULT_VOICE_SETTINGS, sanitizeSettings, VOICE_SETTINGS_KEY } from '../lib/voice/settings';
import { createMicListener } from '../lib/voice/micListener';
import { createSpeaker } from '../lib/voice/speaker';

const SETTINGS_KEY = VOICE_SETTINGS_KEY;
const MAX_CAPTIONS = 8;

/**
 * Everything the Live Voice screen needs:
 *   const v = useVoiceConversation({ initialHistory, onTurn });
 *   v.state            'idle' | 'listening' | 'hearing' | 'holding' | 'transcribing' | 'thinking' | 'speaking' | 'paused' | 'error'
 *   v.level            0..1 microphone loudness (for the orb)
 *   v.captions         [{ id, role, text, lang, final, interrupted }]
 *   v.settings / v.updateSettings(patch)
 *   v.start() v.stop() v.toggleMute() v.interrupt() v.sendNow()
 */
export function useVoiceConversation({ initialHistory = [], onTurn } = {}) {
  const { transcribeLive, voiceRespond } = useApp();
  const [state, setState] = useState(STATES.IDLE);
  const [level, setLevel] = useState(0);
  const [captions, setCaptions] = useState([]);
  const [notice, setNotice] = useState(null);
  const [error, setError] = useState(null);
  const [muted, setMuted] = useState(false);
  const [detected, setDetected] = useState(null);
  const [settings, setSettings] = useState(DEFAULT_VOICE_SETTINGS);

  const settingsRef = useRef(settings);
  const sessionRef = useRef(null);
  const apiRef = useRef({ transcribeLive, voiceRespond });
  const onTurnRef = useRef(onTurn);
  const historyRef = useRef(initialHistory);
  useEffect(() => {
    apiRef.current = { transcribeLive, voiceRespond };
    onTurnRef.current = onTurn;
    historyRef.current = initialHistory;
  });

  // Saved settings.
  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(SETTINGS_KEY)
      .then((raw) => {
        if (cancelled || !raw) return;
        const next = sanitizeSettings(JSON.parse(raw));
        settingsRef.current = next;
        setSettings(next);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const updateSettings = useCallback((patch) => {
    const next = sanitizeSettings({ ...settingsRef.current, ...patch });
    settingsRef.current = next;
    setSettings(next);
    AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(next)).catch(() => {});
  }, []);

  const upsertCaption = useCallback((c) => {
    setCaptions((list) => {
      const i = list.findIndex((x) => x.id === c.id);
      if (i === -1) return [...list, c].slice(-MAX_CAPTIONS);
      const next = list.slice();
      next[i] = { ...next[i], ...c };
      return next;
    });
  }, []);

  const build = useCallback(() => {
    const session = new VoiceSession({
      listener: createMicListener(),
      speaker: createSpeaker(),
      getSettings: () => settingsRef.current,
      initialHistory: historyRef.current.slice(-8),
      transcribe: (seg, o) => apiRef.current.transcribeLive({ uri: seg.uri, language: o.language, signal: o.signal }),
      respond: ({ text, lang, history, settings: s, signal, turnId, supersedes, sticky }) =>
        apiRef.current.voiceRespond({
          text,
          from: lang,
          mode: s.mode,
          targetLang: s.targetLang,
          homeLang: s.homeLang,
          history,
          signal,
          turnId,
          supersedes,
          sticky,
        }),
      onState: (st) => {
        setState(st);
        if (st !== STATES.ERROR) setError((e) => (e && e.fatal ? e : null));
      },
      onLevel: ({ db, floor }) => setLevel(Math.max(0, Math.min(1, (db - floor) / 30))),
      onCaption: (c) => {
        if (c.role === 'user' && c.lang) setDetected(c.lang);
        upsertCaption(c);
      },
      onTurn: (t) => onTurnRef.current?.(t),
      onNotice: (message) => setNotice(message),
      onError: (message, info) => setError({ message, fatal: !info?.transient, denied: Boolean(info?.denied), blocked: Boolean(info?.blocked) }),
    });
    return session;
  }, [upsertCaption]);

  const start = useCallback(async () => {
    setError(null);
    setNotice(null);
    setCaptions([]);
    setMuted(false);
    if (!sessionRef.current) sessionRef.current = build();
    return sessionRef.current.start();
  }, [build]);

  const stop = useCallback(async () => {
    const s = sessionRef.current;
    sessionRef.current = null;
    setLevel(0);
    if (s) await s.stop();
    setState(STATES.IDLE);
  }, []);

  const toggleMute = useCallback(() => {
    setMuted((m) => {
      sessionRef.current?.setMuted(!m);
      return !m;
    });
  }, []);

  const interrupt = useCallback(() => sessionRef.current?.interrupt(), []);
  const sendNow = useCallback(() => sessionRef.current?.sendNow(), []);

  // Never leave the microphone open when the screen goes away.
  useEffect(
    () => () => {
      sessionRef.current?.stop();
      sessionRef.current = null;
    },
    []
  );

  return {
    state, level, captions, notice, error, muted, detected, settings,
    updateSettings, start, stop, toggleMute, interrupt, sendNow,
    dismissNotice: () => setNotice(null),
  };
}
