import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, ActivityIndicator, Alert, StyleSheet } from 'react-native';
import Screen from '../components/Screen';
import ChatBubble from '../components/ChatBubble';
import Icon from '../components/Icon';
import ConfirmDialog from '../components/ConfirmDialog';
import { useApp } from '../context/AppContext';
import { summarise } from '../lib/aiEngine';
import { useTranslation } from '../i18n/I18nContext';
import { useVoiceRecorder } from '../hooks/useVoiceRecorder';
import { saveAndTranscribe, formatDuration } from '../lib/voiceNotes';
import { exchangeKey, loadChat, newMessageId, removeExchanges, saveChat, storageKeyFor } from '../lib/chatHistory';
import { colors, radius } from '../theme';

const PRODUCT_QUICK_REPLIES = [
  { key: 'analyse', label: 'Analyse my business' },
  { key: 'profit', label: 'Increase my profit?' },
  { key: 'restock', label: 'What should I restock?' },
  { key: 'prices', label: 'Check my prices' },
];

const SERVICE_QUICK_REPLIES = [
  { key: 'analyse', label: 'Analyse my business' },
  { key: 'popularService', label: 'My most popular service?' },
  { key: 'busyHours', label: 'When am I busiest?' },
  { key: 'retention', label: 'Any customers to follow up with?' },
  { key: 'growth', label: 'How is my growth trending?' },
  { key: 'prices', label: 'Check my prices' },
];

export default function AIChatScreen({ route, navigation }) {
  const { state, chatWithAI, transcribeAudio } = useApp();
  const { t } = useTranslation();
  const { transactions, business, user } = state;

  // The opening greeting is computed locally — it just formats numbers we
  // already have, so there's no need to wait on a network round-trip.
  const summary = useMemo(() => summarise(transactions), [transactions]);
  const isServiceLed = (business?.businessModel || 'Product-based') !== 'Product-based';
  const quickReplies = isServiceLed ? SERVICE_QUICK_REPLIES : PRODUCT_QUICK_REPLIES;
  // Whisper supports English and Afrikaans; everything else is transcribed as English.
  const speechLanguage = business?.language === 'Afrikaans' ? 'af' : 'en';

  const [messages, setMessages] = useState([
    { from: 'ai', local: true, text: `Hi ${user?.name || 'there'}! I've analysed your business this week.` },
    {
      from: 'ai',
      local: true,
      text:
        summary.profit >= 0
          ? `Your sales are up, and your profit is looking healthy at R${summary.profit.toFixed(0)}.`
          : `Your expenses currently exceed your sales by R${Math.abs(summary.profit).toFixed(0)}.`,
    },
    {
      from: 'ai',
      local: true,
      text: isServiceLed
        ? 'Ask me about your busiest times, your most popular service, or customers who might need a follow-up. You can also tap the mic and just speak.'
        : 'Ask me anything about your sales, stock or prices — type it, or tap the mic and just speak.',
    },
  ]);
  const messagesRef = useRef(messages);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const sendingRef = useRef(false);
  const [transcribing, setTranscribing] = useState(false);
  const scrollRef = useRef(null);

  const updateMessages = useCallback((updater) => {
    setMessages((m) => {
      const next = updater(m);
      messagesRef.current = next;
      return next;
    });
  }, []);

  const push = useCallback(
    (message) => {
      const withId = { id: newMessageId(), ...message };
      updateMessages((m) => [...m, withId]);
      return withId.id;
    },
    [updateMessages]
  );

  /* ---------- saved chat: remember it, select and delete ---------- */

  const storageKey = storageKeyFor(user?.identifier);
  const [loadedKey, setLoadedKey] = useState(null);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState(() => new Set());
  const [confirm, setConfirm] = useState(null); // null | 'all' | 'selected'

  // Bring back what was saved last time (and again if a different person logs in).
  useEffect(() => {
    let cancelled = false;
    setLoadedKey(null);
    (async () => {
      const saved = await loadChat(storageKey);
      if (cancelled) return;
      updateMessages((m) => {
        const local = m.filter((x) => x.local);
        const addedMeanwhile = m.filter((x) => !x.local && !saved.some((y) => y.id === x.id));
        return [...local, ...saved, ...addedMeanwhile];
      });
      setLoadedKey(storageKey);
    })();
    return () => {
      cancelled = true;
    };
  }, [storageKey, updateMessages]);

  // Save after every change, but only once the old chat has been loaded
  // (otherwise an empty chat could overwrite it).
  useEffect(() => {
    if (storageKey && loadedKey === storageKey) saveChat(storageKey, messages);
  }, [messages, storageKey, loadedKey]);

  const hasSaved = messages.some((m) => !m.local);

  // Leave selection mode when there is nothing left to select.
  useEffect(() => {
    if (!hasSaved) {
      setSelecting(false);
      setSelected(new Set());
    }
  }, [hasSaved]);

  const toggleSelected = (m) => {
    const key = exchangeKey(m);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const startSelecting = (m) => {
    setSelecting(true);
    setSelected(m ? new Set([exchangeKey(m)]) : new Set());
  };

  const stopSelecting = () => {
    setSelecting(false);
    setSelected(new Set());
  };

  const confirmDelete = () => {
    if (confirm === 'all') {
      updateMessages((m) => m.filter((x) => x.local));
    } else if (confirm === 'selected') {
      const keys = selected;
      updateMessages((m) => removeExchanges(m, keys));
    }
    setConfirm(null);
    stopSelecting();
  };

  const send = useCallback(
    async (text, intentKey) => {
      const clean = (text || '').trim();
      if (!clean || sendingRef.current) return;
      sendingRef.current = true;
      setSending(true);

      // Recent conversation (minus the local greeting) so follow-up questions make sense.
      const history = messagesRef.current
        .filter((m) => !m.local)
        .slice(-8)
        .map((m) => ({ role: m.from === 'user' ? 'user' : 'assistant', content: m.text }));

      const questionId = push({ from: 'user', text: clean });
      const reply = await chatWithAI({ message: clean, intentKey, history });
      push({ from: 'ai', text: reply, replyTo: questionId });

      sendingRef.current = false;
      setSending(false);
    },
    [chatWithAI, push]
  );

  // A recording just finished: keep the audio on the phone, turn it into
  // text, then ask the AI exactly what the person said.
  const handleRecorded = useCallback(
    async (result) => {
      if (result.tooShort) {
        push({ from: 'ai', text: 'That was very short. Tap the mic, say what you need, then tap again to stop.' });
        return;
      }
      setTranscribing(true);
      const out = await saveAndTranscribe({
        uri: result.uri,
        durationMs: result.durationMs,
        language: speechLanguage,
        transcribe: transcribeAudio,
      });
      setTranscribing(false);

      if (out.ok) {
        send(out.text);
      } else if (out.empty) {
        push({ from: 'ai', text: "I couldn't hear anything in that recording. Try again a little closer to the phone." });
      } else {
        push({
          from: 'ai',
          text: `I saved your voice note but couldn't turn it into text: ${out.error} You can retry from More > Voice Notes.`,
        });
      }
    },
    [push, send, speechLanguage, transcribeAudio]
  );

  const recorder = useVoiceRecorder({ maxMs: 90000, onFinish: handleRecorded });

  const onMicPress = async () => {
    if (recorder.isRecording) {
      await recorder.stop();
      return;
    }
    if (recorder.busy || transcribing || sending) return;
    const started = await recorder.start();
    if (!started.ok) Alert.alert('Microphone', started.error);
  };

  // Voice Notes screen can hand us a transcript to ask about ("Ask AI").
  const askId = route?.params?.askId;
  useEffect(() => {
    const ask = route?.params?.ask;
    if (askId && ask) {
      send(ask);
      navigation.setParams({ ask: undefined, askId: undefined });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [askId]);

  const submitDraft = () => {
    const text = draft;
    setDraft('');
    send(text);
  };

  const micBusy = transcribing || recorder.phase === 'starting' || recorder.phase === 'stopping';

  return (
    <Screen scroll={false} contentStyle={styles.screenContent}>
      <View style={styles.header}>
        <View style={{ flexShrink: 1 }}>
          <Text style={styles.title}>{t('aiCoFounderChatTitle')}</Text>
          <Text style={styles.subtitle}>{t('aiCoFounderChatSubtitle')}</Text>
        </View>

        {hasSaved ? (
          <View style={styles.headerActions}>
            {selecting ? (
              <>
                <Pressable accessibilityRole="button" onPress={stopSelecting} hitSlop={6}>
                  <Text style={styles.actionText}>Cancel</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setConfirm('selected')}
                  disabled={!selected.size}
                  hitSlop={6}
                  style={!selected.size && { opacity: 0.4 }}
                >
                  <Text style={[styles.actionText, styles.actionDanger]}>Delete selected ({selected.size})</Text>
                </Pressable>
              </>
            ) : (
              <>
                <Pressable accessibilityRole="button" onPress={() => startSelecting(null)} hitSlop={6}>
                  <Text style={styles.actionText}>Select</Text>
                </Pressable>
                <Pressable accessibilityRole="button" onPress={() => setConfirm('all')} hitSlop={6}>
                  <Text style={[styles.actionText, styles.actionDanger]}>Clear All Prompts</Text>
                </Pressable>
              </>
            )}
          </View>
        ) : null}
      </View>

      <ScrollView
        ref={scrollRef}
        style={styles.thread}
        contentContainerStyle={{ paddingBottom: 8 }}
        keyboardShouldPersistTaps="handled"
        onContentSizeChange={() => {
          if (!selecting) scrollRef.current?.scrollToEnd({ animated: true });
        }}
      >
        {messages.map((m, i) => {
          if (m.local) {
            return (
              <ChatBubble key={m.id || `local-${i}`} from={m.from}>
                {m.text}
              </ChatBubble>
            );
          }
          const checked = selecting && selected.has(exchangeKey(m));
          return (
            <Pressable
              key={m.id}
              style={selecting ? styles.selectRow : undefined}
              onPress={selecting ? () => toggleSelected(m) : undefined}
              onLongPress={selecting ? undefined : () => startSelecting(m)}
              delayLongPress={450}
              accessibilityRole={selecting ? 'checkbox' : undefined}
              accessibilityState={selecting ? { checked } : undefined}
            >
              {selecting ? (
                <Icon
                  name={checked ? 'checkmark-circle' : 'ellipse-outline'}
                  size={22}
                  color={checked ? colors.primary : colors.border}
                  style={styles.checkbox}
                />
              ) : null}
              <View style={selecting ? { flex: 1, pointerEvents: 'none' } : undefined}>
                <ChatBubble from={m.from}>{m.text}</ChatBubble>
              </View>
            </Pressable>
          );
        })}
        {transcribing && <ChatBubble from="user">Turning your voice note into text…</ChatBubble>}
        {sending && <ChatBubble from="ai">…</ChatBubble>}
      </ScrollView>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.quickRow}
        contentContainerStyle={styles.quickRowContent}
        keyboardShouldPersistTaps="handled"
      >
        {quickReplies.map((q) => (
          <Pressable key={q.key} style={styles.quickBtn} onPress={() => send(q.label, q.key)} disabled={sending}>
            <Text style={styles.quickBtnText}>{q.label}</Text>
          </Pressable>
        ))}
      </ScrollView>

      {recorder.isRecording ? (
        <Text style={styles.recordingHint}>
          ● Recording {formatDuration(recorder.elapsedMs)} — tap the red button to send
        </Text>
      ) : null}

      <View style={styles.inputRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={recorder.isRecording ? t('tapToStop') : t('tapToSpeak')}
          onPress={onMicPress}
          disabled={micBusy}
          style={[styles.micBtn, recorder.isRecording && styles.micBtnRecording]}
        >
          {micBusy ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <Icon
              name={recorder.isRecording ? 'stop' : 'mic-outline'}
              size={20}
              color={recorder.isRecording ? colors.white : colors.primary}
            />
          )}
        </Pressable>

        <TextInput
          style={styles.input}
          placeholder={recorder.isRecording ? t('tapToStop') : t('askAnything')}
          placeholderTextColor={colors.textMuted}
          value={draft}
          onChangeText={setDraft}
          onSubmitEditing={submitDraft}
          returnKeyType="send"
          editable={!recorder.isRecording}
        />

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Send"
          onPress={submitDraft}
          disabled={!draft.trim() || sending}
          style={[styles.sendBtn, (!draft.trim() || sending) && { opacity: 0.4 }]}
        >
          <Icon name="send" size={17} color={colors.white} />
        </Pressable>
      </View>

      <ConfirmDialog
        visible={confirm !== null}
        title={confirm === 'all' ? 'Clear All Prompts' : 'Delete selected'}
        message={
          confirm === 'all'
            ? 'Are you sure you want to delete all the prompts and questions you have previously entered? This action cannot be undone.'
            : `Are you sure you want to delete the ${selected.size} selected prompt${selected.size === 1 ? '' : 's'} and ${
                selected.size === 1 ? 'its' : 'their'
              } answer${selected.size === 1 ? '' : 's'}? This action cannot be undone.`
        }
        confirmLabel={confirm === 'all' ? 'Delete All' : 'Delete'}
        onConfirm={confirmDelete}
        onCancel={() => setConfirm(null)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  // flex:1 + minHeight:0 makes the screen exactly as tall as the window, so
  // only the message list scrolls and the input row always stays on screen.
  screenContent: { paddingBottom: 12, flex: 1, minHeight: 0 },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingTop: 4 },
  actionText: { fontSize: 12.5, fontWeight: '700', color: colors.primary },
  actionDanger: { color: colors.danger },
  selectRow: { flexDirection: 'row', alignItems: 'center' },
  checkbox: { marginRight: 10, marginBottom: 10 },
  title: { fontSize: 22, fontWeight: '800', color: colors.primary },
  subtitle: { marginTop: 4, color: colors.textMuted, fontSize: 13.5 },
  thread: { flex: 1, minHeight: 0 },
  quickRow: { flexGrow: 0, marginTop: 6, marginBottom: 10 },
  quickRowContent: { gap: 8, paddingRight: 8 },
  quickBtn: {
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  quickBtnText: { fontSize: 12.5, fontWeight: '600', color: colors.text },
  recordingHint: { color: colors.danger, fontSize: 12.5, fontWeight: '700', marginBottom: 8 },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  micBtn: {
    width: 46,
    height: 46,
    borderRadius: 23,
    borderWidth: 1.5,
    borderColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  micBtnRecording: { backgroundColor: colors.danger, borderColor: colors.danger },
  input: {
    flex: 1,
    backgroundColor: colors.inputBg,
    borderRadius: radius.pill,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 14.5,
    color: colors.text,
  },
  sendBtn: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
