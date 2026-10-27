import { useCallback, useEffect, useState } from 'react';
import { View, Text, Pressable, ActivityIndicator, StyleSheet } from 'react-native';
import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import Screen from '../components/Screen';
import BackButton from '../components/BackButton';
import Button from '../components/Button';
import Icon from '../components/Icon';
import Banner from '../components/Banner';
import ConfirmDialog from '../components/ConfirmDialog';
import { useApp } from '../context/AppContext';
import { useTranslation } from '../i18n/I18nContext';
import { useAssistant } from '../context/AssistantContext';
import { useAutoVoiceInput } from '../hooks/useAutoVoiceInput';
import {
  VOICE_NOTES_PERSIST,
  deleteNote,
  formatDuration,
  listNotes,
  saveAndTranscribe,
  transcribeNote,
  speechLanguageFor,
} from '../lib/voiceNotes';
import { colors, radius, type } from '../theme';
import EmptyState from '../components/EmptyState';
import { openAppSettings, canOpenSettings } from '../lib/permissions';

export default function VoiceNotesScreen({ navigation }) {
  const { state, transcribeAudio } = useApp();
  const { t } = useTranslation();
  const assistant = useAssistant();

  // Spoken language comes from the business's preferred language (Business Profile); there is no separate picker here.
  const language = speechLanguageFor(state.business?.language);
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tooShort, setTooShort] = useState(false);
  // Problems are shown on the screen (Alert pop-ups do nothing in the web version).
  const [problem, setProblem] = useState('');
  const [confirmNote, setConfirmNote] = useState(null);
  const [micDenied, setMicDenied] = useState(false);

  const refresh = useCallback(async () => {
    setNotes(await listNotes());
  }, []);

  useEffect(() => {
    refresh().finally(() => setLoading(false));
  }, [refresh]);

  /* ---------- recording ---------- */

  const handleRecorded = useCallback(
    async (result) => {
      if (result.tooShort || result.empty) {
        setTooShort(true);
        setTimeout(() => setTooShort(false), 3500);
        return;
      }
      if (result.error) {
        setProblem(result.error);
        return;
      }
      try {
        const out = await saveAndTranscribe({
          uri: result.uri,
          durationMs: result.durationMs,
          language,
          transcribe: transcribeAudio,
          onSaved: refresh, // show the new note straight away as "Transcribing…"
        });
        // The note keeps its own error and a Retry button; also say it at the top so it isn't missed.
        if (out && !out.ok && !out.empty && out.error) setProblem(out.error);
      } catch (e) {
        setProblem(t('chat.recordingWentWrong'));
      }
      refresh();
    },
    [language, refresh, transcribeAudio, t]
  );

  // Stops by itself after a longer pause than chat (room to think while dictating); a tap stops it at once.
  const recorder = useAutoVoiceInput({ purpose: 'note', onFinish: handleRecorded });

  const onRecordPress = async () => {
    if (recorder.isRecording) {
      recorder.stop();
      return;
    }
    if (recorder.busy) return; // starting / stopping: ignore extra taps
    setProblem('');
    const started = await recorder.start();
    setMicDenied(Boolean(!started.ok && started.denied));
    if (!started.ok) setProblem(`${t('voiceNotes.microphone')}: ${started.error}`);
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
      setProblem('');
    } catch (e) {
      setProblem(`${t('voiceNotes.playback')}: ${t('voiceNotes.couldntPlay')}`);
    }
  };

  /* ---------- per-note actions ---------- */

  const retry = async (note) => {
    setNotes((list) => list.map((n) => (n.id === note.id ? { ...n, status: 'transcribing', error: null } : n)));
    await transcribeNote(note, { language, transcribe: transcribeAudio });
    refresh();
  };

  const askAI = (note) => {
    assistant.ask(note.transcript); // opens the floating AI chat with this question
  };

  const remove = (note) => setConfirmNote(note);
  const confirmRemove = async () => {
    const note = confirmNote;
    setConfirmNote(null);
    if (!note) return;
    if (playingId === note.id) {
      player.pause();
      setPlayingId(null);
    }
    await deleteNote(note.id);
    refresh();
  };

  /* ---------- UI ---------- */

  return (
    <Screen>
      <BackButton navigation={navigation} />
      <View style={styles.header}>
        <Text style={styles.title}>{t('voiceNotes')}</Text>
        <Text style={styles.subtitle}>{t('voiceNotes.recordANoteKeepIt')}</Text>
      </View>

      {!VOICE_NOTES_PERSIST ? (
        <Text style={styles.webNote}>{t('voiceNotes.inTheBrowserVoiceNotes')}</Text>
      ) : null}


      <Button
        icon={recorder.isRecording ? 'stop-circle-outline' : 'mic-outline'}
        variant={recorder.isRecording ? 'outline-danger' : 'primary'}
        loading={recorder.phase === 'starting' || recorder.phase === 'stopping'}
        onPress={onRecordPress}
      >
        {recorder.isRecording ? `${t('tapToStop')} · ${formatDuration(recorder.elapsedMs)}` : t('tapToSpeak')}
      </Button>
      {recorder.isRecording ? (
        <Text style={styles.listenHint} accessibilityLiveRegion="polite">
          {recorder.hearing ? t('voiceNotes.hearing') : t('voiceNotes.listening')}
        </Text>
      ) : null}
      {tooShort ? <Text style={styles.warn}>{t('voiceNotes.nothingHeard')}</Text> : null}
      {problem ? <Banner type="error" text={problem} onClose={() => setProblem('')} style={{ marginTop: 12, marginBottom: 0 }} /> : null}
      {micDenied && canOpenSettings ? (
        <Button variant="outline-accent" size="sm" icon="settings-outline" onPress={openAppSettings} style={{ marginTop: 10 }}>
          {t('voiceErr.openSettings')}
        </Button>
      ) : null}

      <Text style={styles.sectionTitle}>{t('voiceNotes.yourVoiceNotes')}</Text>
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
        <EmptyState compact title={t('voiceNotes.noVoiceNotesYetTap')} />
      )}

      <ConfirmDialog
        visible={Boolean(confirmNote)}
        title={t('voiceNotes.deleteQuestion')}
        message={t('voiceNotes.deleteBody')}
        cancelLabel={t('voiceNotes.keep')}
        onConfirm={confirmRemove}
        onCancel={() => setConfirmNote(null)}
      />
    </Screen>
  );
}

function NoteCard({ note, playing, onPlay, onRetry, onAsk, onDelete }) {
  const { t, formatDateTime } = useTranslation();
  const transcribing = note.status === 'transcribing';
  return (
    <View style={styles.card}>
      <View style={styles.cardTop}>
        <Pressable onPress={onPlay} style={styles.playBtn} accessibilityRole="button" accessibilityLabel={playing ? t('voiceNotes.pause') : t('voiceNotes.play')}>
          <Icon name={playing ? 'pause' : 'play'} size={18} color={colors.white} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.cardTitle}>{formatDateTime(note.createdAt)}</Text>
          <Text style={styles.cardMeta}>{formatDuration(note.durationMs)}</Text>
        </View>
        <Pressable onPress={onDelete} accessibilityRole="button" accessibilityLabel={t('voiceNotes.deleteVoiceNote')} hitSlop={8}>
          <Icon name="trash-outline" size={18} color={colors.danger} />
        </Pressable>
      </View>

      {transcribing ? (
        <View style={styles.statusRow}>
          <ActivityIndicator size="small" color={colors.primary} />
          <Text style={styles.statusText}>{t('voiceNotes.turningYourVoiceIntoText')}</Text>
        </View>
      ) : note.transcript ? (
        <Text style={styles.transcript} selectable>
          {note.transcript}
        </Text>
      ) : (
        <Text style={[styles.statusText, styles.statusBelow]}>{note.error || t('voiceNotes.noTextYet')}</Text>
      )}

      {!transcribing ? (
        <View style={styles.actions}>
          {note.transcript ? (
            <Pressable onPress={onAsk} style={styles.actionBtn}>
              <Icon name="sparkles-outline" size={14} color={colors.primary} />
              <Text style={styles.actionText}>{t('voiceNotes.askAiAboutThis')}</Text>
            </Pressable>
          ) : null}
          {note.status === 'failed' || (!note.transcript && note.status === 'done') ? (
            <Pressable onPress={onRetry} style={styles.actionBtn}>
              <Icon name="refresh-outline" size={14} color={colors.primary} />
              <Text style={styles.actionText}>{t('common.retry')}</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { marginBottom: 16 },
  title: type.pageTitle,
  subtitle: type.pageSubtitle,
  listenHint: { fontSize: 12.5, color: colors.textMuted, textAlign: 'center', marginTop: 8 },
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
  sectionTitle: { ...type.sectionTitle, marginTop: 22, marginBottom: 10 },
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
