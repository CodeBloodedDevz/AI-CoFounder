import { useCallback, useEffect, useState } from 'react';
import { View, Text, Pressable, ActivityIndicator, Alert, StyleSheet } from 'react-native';
import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import Screen from '../components/Screen';
import BackButton from '../components/BackButton';
import Button from '../components/Button';
import Icon from '../components/Icon';
import SegmentedControl from '../components/SegmentedControl';
import { useApp } from '../context/AppContext';
import { useTranslation } from '../i18n/I18nContext';
import { useVoiceRecorder } from '../hooks/useVoiceRecorder';
import {
  VOICE_NOTES_PERSIST,
  deleteNote,
  formatDuration,
  listNotes,
  saveAndTranscribe,
  transcribeNote,
} from '../lib/voiceNotes';
import { colors, radius } from '../theme';

// Whisper (the speech-to-text model) supports English and Afrikaans, not isiZulu, isiXhosa, Sesotho or Setswana.
const LANGUAGE_OPTIONS = [
  { value: 'en', label: 'English' },
  { value: 'af', label: 'Afrikaans' },
  { value: 'auto', label: 'Auto-detect' },
];

function whenLabel(iso) {
  return new Date(iso).toLocaleString('en-ZA', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export default function VoiceNotesScreen({ navigation }) {
  const { state, transcribeAudio } = useApp();
  const { t } = useTranslation();

  const [language, setLanguage] = useState(state.business?.language === 'Afrikaans' ? 'af' : 'en');
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tooShort, setTooShort] = useState(false);

  const refresh = useCallback(async () => {
    setNotes(await listNotes());
  }, []);

  useEffect(() => {
    refresh().finally(() => setLoading(false));
  }, [refresh]);

  /* ---------- recording ---------- */

  const handleRecorded = useCallback(
    async (result) => {
      if (result.tooShort) {
        setTooShort(true);
        setTimeout(() => setTooShort(false), 3000);
        return;
      }
      await saveAndTranscribe({
        uri: result.uri,
        durationMs: result.durationMs,
        language,
        transcribe: transcribeAudio,
        onSaved: refresh, // show the new note straight away as "Transcribing…"
      });
      refresh();
    },
    [language, refresh, transcribeAudio]
  );

  const recorder = useVoiceRecorder({ maxMs: 120000, onFinish: handleRecorded });

  const onRecordPress = async () => {
    if (recorder.isRecording) {
      await recorder.stop();
      return;
    }
    const started = await recorder.start();
    if (!started.ok) Alert.alert('Microphone', started.error);
  };

  /* ---------- playback ---------- */

  const player = useAudioPlayer(null);
  const playerStatus = useAudioPlayerStatus(player);
  const [playingId, setPlayingId] = useState(null);

  useEffect(() => {
    if (playerStatus.didJustFinish) setPlayingId(null);
  }, [playerStatus.didJustFinish]);

  const togglePlay = async (note) => {
    if (playingId === note.id && playerStatus.playing) {
      player.pause();
      setPlayingId(null);
      return;
    }
    try {
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
      player.replace({ uri: note.uri });
      player.play();
      setPlayingId(note.id);
    } catch (e) {
      Alert.alert('Playback', "Couldn't play this voice note.");
    }
  };

  /* ---------- per-note actions ---------- */

  const retry = async (note) => {
    setNotes((list) => list.map((n) => (n.id === note.id ? { ...n, status: 'transcribing', error: null } : n)));
    await transcribeNote(note, { language, transcribe: transcribeAudio });
    refresh();
  };

  const askAI = (note) => {
    navigation.navigate('Main', { screen: 'AIChat', params: { ask: note.transcript, askId: Date.now() } });
  };

  const remove = (note) => {
    Alert.alert('Delete voice note?', 'The recording and its text will be removed from this phone.', [
      { text: 'Keep', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          if (playingId === note.id) {
            player.pause();
            setPlayingId(null);
          }
          await deleteNote(note.id);
          refresh();
        },
      },
    ]);
  };

  /* ---------- UI ---------- */

  return (
    <Screen>
      <BackButton navigation={navigation} />
      <View style={{ marginBottom: 16 }}>
        <Text style={styles.title}>{t('voiceNotes')}</Text>
        <Text style={styles.subtitle}>Record a note, keep it on your phone, and get the text.</Text>
      </View>

      {!VOICE_NOTES_PERSIST ? (
        <Text style={styles.webNote}>
          In the browser, voice notes are only kept until you refresh. Use the phone app to save them on the device.
        </Text>
      ) : null}

      <Text style={styles.label}>Language you speak</Text>
      <SegmentedControl options={LANGUAGE_OPTIONS} value={language} onChange={setLanguage} />
      <Text style={styles.hint}>
        Voice-to-text works best in English or Afrikaans. isiZulu, isiXhosa, Sesotho and Setswana aren't supported yet,
        but your recording is always saved.
      </Text>

      <Button
        icon={recorder.isRecording ? 'stop-circle-outline' : 'mic-outline'}
        variant={recorder.isRecording ? 'outline-danger' : 'primary'}
        loading={recorder.phase === 'starting' || recorder.phase === 'stopping'}
        onPress={onRecordPress}
      >
        {recorder.isRecording ? `${t('tapToStop')} · ${formatDuration(recorder.elapsedMs)}` : t('tapToSpeak')}
      </Button>
      {tooShort ? <Text style={styles.warn}>That was very short — hold on a little longer.</Text> : null}

      <Text style={styles.sectionTitle}>Your voice notes</Text>
      {loading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 16 }} />
      ) : notes.length ? (
        notes.map((note) => (
          <NoteCard
            key={note.id}
            note={note}
            playing={playingId === note.id && playerStatus.playing}
            onPlay={() => togglePlay(note)}
            onRetry={() => retry(note)}
            onAsk={() => askAI(note)}
            onDelete={() => remove(note)}
          />
        ))
      ) : (
        <Text style={styles.empty}>No voice notes yet. Tap the button above and start talking.</Text>
      )}
    </Screen>
  );
}

function NoteCard({ note, playing, onPlay, onRetry, onAsk, onDelete }) {
  const transcribing = note.status === 'transcribing';
  return (
    <View style={styles.card}>
      <View style={styles.cardTop}>
        <Pressable onPress={onPlay} style={styles.playBtn} accessibilityRole="button" accessibilityLabel={playing ? 'Pause' : 'Play'}>
          <Icon name={playing ? 'pause' : 'play'} size={18} color={colors.white} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.cardTitle}>{whenLabel(note.createdAt)}</Text>
          <Text style={styles.cardMeta}>{formatDuration(note.durationMs)}</Text>
        </View>
        <Pressable onPress={onDelete} accessibilityRole="button" accessibilityLabel="Delete voice note" hitSlop={8}>
          <Icon name="trash-outline" size={18} color={colors.danger} />
        </Pressable>
      </View>

      {transcribing ? (
        <View style={styles.statusRow}>
          <ActivityIndicator size="small" color={colors.primary} />
          <Text style={styles.statusText}>Turning your voice into text…</Text>
        </View>
      ) : note.transcript ? (
        <Text style={styles.transcript} selectable>
          {note.transcript}
        </Text>
      ) : (
        <Text style={[styles.statusText, styles.statusBelow]}>{note.error || 'No text yet.'}</Text>
      )}

      {!transcribing ? (
        <View style={styles.actions}>
          {note.transcript ? (
            <Pressable onPress={onAsk} style={styles.actionBtn}>
              <Icon name="sparkles-outline" size={14} color={colors.primary} />
              <Text style={styles.actionText}>Ask AI about this</Text>
            </Pressable>
          ) : null}
          {note.status === 'failed' || (!note.transcript && note.status === 'done') ? (
            <Pressable onPress={onRetry} style={styles.actionBtn}>
              <Icon name="refresh-outline" size={14} color={colors.primary} />
              <Text style={styles.actionText}>Retry</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 22, fontWeight: '800', color: colors.text },
  subtitle: { marginTop: 4, color: colors.textMuted, fontSize: 13.5 },
  label: { fontSize: 13, fontWeight: '600', color: colors.text, marginBottom: 8 },
  hint: { fontSize: 12, color: colors.textMuted, lineHeight: 17, marginTop: -8, marginBottom: 16 },
  webNote: {
    backgroundColor: colors.warningBg,
    color: colors.warning,
    borderRadius: radius.md,
    padding: 12,
    fontSize: 12.5,
    fontWeight: '600',
    marginBottom: 16,
  },
  warn: { color: colors.warning, fontSize: 12.5, fontWeight: '600', marginTop: 8 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: colors.text, marginTop: 22, marginBottom: 10 },
  empty: { color: colors.textMuted, fontSize: 13, fontStyle: 'italic', paddingVertical: 8 },
  card: {
    backgroundColor: colors.inputBg,
    borderRadius: radius.md,
    padding: 14,
    marginBottom: 12,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  playBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: { fontSize: 14, fontWeight: '700', color: colors.text },
  cardMeta: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  transcript: { marginTop: 12, fontSize: 14, lineHeight: 20, color: colors.text },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 },
  statusText: { fontSize: 13, color: colors.textMuted },
  statusBelow: { marginTop: 12 },
  actions: { flexDirection: 'row', gap: 16, marginTop: 12 },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  actionText: { fontSize: 12.5, fontWeight: '700', color: colors.primary },
});
