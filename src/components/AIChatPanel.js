import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, ActivityIndicator, Platform, StyleSheet } from 'react-native';
import ChatBubble from './ChatBubble';
import Icon from './Icon';
import ConfirmDialog from './ConfirmDialog';
import KeyboardDismissButton from './KeyboardDismissButton';
import { useKeyboardVisible } from '../hooks/useKeyboard';
import VoiceConversation from './VoiceConversation';
import { useApp } from '../context/AppContext';
import { summarise } from '../lib/aiEngine';
import { useTranslation } from '../i18n/I18nContext';
import { useAutoVoiceInput } from '../hooks/useAutoVoiceInput';
import { saveAndTranscribe, transcribeNote, formatDuration } from '../lib/voiceNotes';
import { exchangeKey, loadChat, newMessageId, removeExchanges, saveChat, storageKeyFor } from '../lib/chatHistory';
import { colors, radius, type } from '../theme';
import { openAppSettings, canOpenSettings } from '../lib/permissions';

const PRODUCT_QUICK_REPLIES = [
  { key: 'analyse', labelKey: 'chat.q.analyse' },
  { key: 'profit', labelKey: 'chat.q.profit' },
  { key: 'restock', labelKey: 'chat.q.restock' },
  { key: 'prices', labelKey: 'chat.q.prices' },
];

// The message box grows with the question (up to about five lines) and then scrolls inside itself.
const INPUT_MIN_HEIGHT = 46;
const INPUT_MAX_HEIGHT = 124;
const WEB = Platform.OS === 'web';

const SERVICE_QUICK_REPLIES = [
  { key: 'analyse', labelKey: 'chat.q.analyse' },
  { key: 'popularService', labelKey: 'chat.q.popularService' },
  { key: 'busyHours', labelKey: 'chat.q.busyHours' },
  { key: 'retention', labelKey: 'chat.q.retention' },
  { key: 'growth', labelKey: 'chat.q.growth' },
  { key: 'prices', labelKey: 'chat.q.prices' },
];

// The AI Co-Founder chat. It lives inside the floating AI panel (see
// FloatingAI.js) instead of being a tab, but works exactly as before:
// typed questions, voice, saved history, select / delete, Clear All.
//
//   active        - the panel is open (used to scroll down / stop recording when closed)
//   onClose       - shows the close button in the header
//   ask           - { id, text } a question to send as soon as the panel is open
//   onAskHandled  - called with ask.id once it has been sent
export default function AIChatPanel({ active = true, onClose, ask, onAskHandled }) {
  const { state, chatWithAI, transcribeAudio } = useApp();
  const { t, formatMoney } = useTranslation();
  const { transactions, business, user } = state;

  // The opening greeting is computed locally — it just formats numbers we
  // already have, so there's no need to wait on a network round-trip. The profit line is worked out
  // each time it is shown, so it stays right after new sales instead of showing the figure from when
  // the chat was first opened.
  const summary = useMemo(() => summarise(transactions), [transactions]);
  const profitLine = () =>
    summary.totalSales === 0 && summary.totalExpenses === 0
      ? t('chat.noNumbersYet')
      : summary.profit >= 0
      ? t('chat.profitHealthy', { amount: formatMoney(summary.profit, { decimals: 0 }) })
      : t('chat.expensesExceed', { amount: formatMoney(Math.abs(summary.profit), { decimals: 0 }) });
  const localText = (m) =>
    m.live === 'profit'
      ? profitLine()
      : m.i18n
      ? t(m.i18n.key, { ...m.i18n.params, ...(m.i18n.money !== undefined ? { amount: formatMoney(m.i18n.money, { decimals: 0 }) } : {}) })
      : m.text;
  const isServiceLed = (business?.businessModel || 'Product-based') !== 'Product-based';
  const quickReplies = isServiceLed ? SERVICE_QUICK_REPLIES : PRODUCT_QUICK_REPLIES;
  // Let the speech recogniser work out which language was spoken instead of forcing English / Afrikaans:
  // a voice note in French, Swahili or Portuguese used to be "read" as English and came out as nonsense.
  // (The server falls back to the business's preferred language when the detection looks wrong.)
  const speechLanguage = 'auto';

  const [messages, setMessages] = useState([
    // The opening messages are stored as translation keys, not text, so they change language with the app.
    { from: 'ai', local: true, i18n: user?.name ? { key: 'chat.greeting', params: { name: user.name } } : { key: 'chat.greetingNoName' } },
    { from: 'ai', local: true, live: 'profit' },
    {
      from: 'ai',
      local: true,
      i18n: { key: isServiceLed ? 'chat.askServiceLed' : 'chat.askProductLed' },
    },
  ]);
  const messagesRef = useRef(messages);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const sendingRef = useRef(false);
  const queueRef = useRef([]); // messages (typed or spoken) that arrived while a reply was still being written
  const [transcribing, setTranscribing] = useState(false);
  const [micDenied, setMicDenied] = useState(false); // microphone permission refused: offer the Settings shortcut
  const [failedNote, setFailedNote] = useState(null); // a recording whose transcription failed: can be retried
  const [voiceOpen, setVoiceOpen] = useState(false); // hands-free Live Voice view (the chat below stays mounted)
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
      if (!clean) return;
      // A spoken message used to be thrown away silently when the AI was still busy with the
      // previous one. Keep it and send it as soon as the AI is free.
      if (sendingRef.current) {
        queueRef.current.push({ text: clean, intentKey });
        return;
      }
      sendingRef.current = true;
      setSending(true);

      // Recent conversation (minus the local greeting) so follow-up questions make sense.
      const history = messagesRef.current
        .filter((m) => !m.local)
        .slice(-8)
        .map((m) => ({ role: m.from === 'user' ? 'user' : 'assistant', content: m.text }));

      const questionId = push({ from: 'user', text: clean });
      let reply;
      try {
        reply = await chatWithAI({ message: clean, intentKey, history });
      } catch (e) {
        reply = t('chat.wentWrong');
      }
      push({ from: 'ai', text: reply, replyTo: questionId });

      sendingRef.current = false;
      setSending(false);
      const next = queueRef.current.shift();
      if (next) setTimeout(() => sendRef.current?.(next.text, next.intentKey), 0);
    },
    [chatWithAI, push, t]
  );
  const sendRef = useRef(null);
  sendRef.current = send;

  // A recording just finished: keep the audio on the phone, turn it into
  // text, then ask the AI exactly what the person said.
  const handleRecorded = useCallback(
    async (result) => {
      if (result.tooShort || result.empty) {
        push({ from: 'ai', text: result.tooShort ? t('chat.tooShort') : t('chat.heardNothing') });
        return;
      }
      if (result.error) {
        push({ from: 'ai', text: result.error });
        return;
      }
      setTranscribing(true);
      setFailedNote(null);
      let out;
      try {
        // Saved on the device first (Voice Notes), so a dropped connection never loses what was said.
        out = await saveAndTranscribe({
          uri: result.uri,
          durationMs: result.durationMs,
          language: speechLanguage,
          transcribe: transcribeAudio,
        });
      } catch (e) {
        out = { ok: false, error: t('chat.recordingWentWrong') };
      } finally {
        setTranscribing(false);
      }

      if (out.ok) {
        send(out.text);
      } else if (out.empty) {
        push({ from: 'ai', text: t('chat.heardNothing') });
      } else {
        push({
          from: 'ai',
          text: t('chat.transcribeFailed', { error: out.error || t('chat.unknownProblem') }),
        });
        if (out.note) setFailedNote(out.note);
      }
    },
    [push, send, speechLanguage, transcribeAudio, t]
  );

  // Try the same recording again (e.g. after the connection came back). Sent once: the button goes away.
  const retryFailed = useCallback(async () => {
    const note = failedNote;
    if (!note || transcribing) return;
    setFailedNote(null);
    setTranscribing(true);
    let out;
    try {
      out = await transcribeNote(note, { language: speechLanguage, transcribe: transcribeAudio });
    } catch (e) {
      out = { ok: false, error: t('chat.recordingWentWrong') };
    } finally {
      setTranscribing(false);
    }
    if (out.ok) send(out.text);
    else if (out.empty) push({ from: 'ai', text: t('chat.heardNothing') });
    else {
      push({ from: 'ai', text: t('chat.transcribeFailed', { error: out.error || t('chat.unknownProblem') }) });
      setFailedNote(out.note || note);
    }
  }, [failedNote, transcribing, speechLanguage, transcribeAudio, send, push, t]);

  // Sends by itself when you stop talking; a tap on the red button sends straight away.
  const recorder = useAutoVoiceInput({ purpose: 'chat', onFinish: handleRecorded });

  const onMicPress = async () => {
    if (recorder.isRecording) {
      recorder.stop();
      return;
    }
    if (recorder.busy || transcribing || sending) return;
    const started = await recorder.start();
    // Shown in the chat itself (a pop-up alert does nothing in the web version).
    if (!started.ok) {
      push({ from: 'ai', text: `${t('voiceNotes.microphone')}: ${started.error}` });
      setMicDenied(Boolean(started.denied));
    } else setMicDenied(false);
  };

  // A question handed over from elsewhere (e.g. "Ask AI about this" on a voice note).
  const askId = ask?.id;
  useEffect(() => {
    if (active && askId) {
      send(ask.text);
      onAskHandled?.(askId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, askId]);

  // Don't keep recording behind a closed panel, and show the latest message when it reopens.
  const { isRecording, cancel: cancelRecording } = recorder;
  useEffect(() => {
    if (active) {
      const timer = setTimeout(() => scrollRef.current?.scrollToEnd({ animated: false }), 60);
      return () => clearTimeout(timer);
    }
    if (isRecording) cancelRecording();
    return undefined;
  }, [active, isRecording, cancelRecording]);

  // Live Voice: leave it when the panel closes (this also switches the microphone off).
  useEffect(() => {
    if (!active) setVoiceOpen(false);
  }, [active]);

  // A finished spoken exchange is kept in the chat like a typed one. Interpreter
  // translations are not chat, so they are not saved.
  const handleVoiceTurn = useCallback(
    (turn) => {
      if (turn.mode !== 'conversation') return;
      const questionId = push({ from: 'user', text: turn.user.text });
      push({ from: 'ai', text: turn.assistant.text, replyTo: questionId });
    },
    [push]
  );

  const voiceHistory = messages
    .filter((m) => !m.local && m.text)
    .slice(-8)
    .map((m) => ({ role: m.from === 'user' ? 'user' : 'assistant', content: m.text }));

  const openVoice = () => {
    if (recorder.isRecording) recorder.cancel();
    setVoiceOpen(true);
  };

  const submitDraft = () => {
    const text = draft;
    if (!text.trim()) return; // an empty Return keeps the box as it is (a message sent mid-reply is queued by send)
    setDraft('');
    send(text);
  };

  // While the keyboard is open the quick-reply chips make way for a "Hide keyboard" button, so the
  // conversation keeps as much room as possible and there is always a way to close the keyboard.
  const keyboardOpen = useKeyboardVisible();
  // Browsers don't grow a text area by themselves: follow its content height there (phones grow natively).
  const [webInputHeight, setWebInputHeight] = useState(INPUT_MIN_HEIGHT);
  useEffect(() => {
    if (WEB && !draft) setWebInputHeight(INPUT_MIN_HEIGHT);
  }, [draft]);
  const keepLatestInView = () => {
    if (!selecting) scrollRef.current?.scrollToEnd({ animated: false });
  };

  // Measure the panel and give the Live Voice layer those exact pixel sizes. Relying only on
  // "absolute fill + flex" left the layer collapsed at the top on some phones (Expo Go).
  const [box, setBox] = useState(null);
  const onRootLayout = useCallback((e) => {
    const { width, height } = e.nativeEvent.layout;
    setBox((b) => (b && Math.abs(b.width - width) < 1 && Math.abs(b.height - height) < 1 ? b : { width, height }));
  }, []);

  const micBusy = transcribing || recorder.phase === 'starting' || recorder.phase === 'stopping';

  return (
    <View style={styles.root} onLayout={onRootLayout}>
    {voiceOpen ? (
      <View style={[styles.voiceLayer, box ? { width: box.width, height: box.height } : null]}>
        <VoiceConversation onBack={() => setVoiceOpen(false)} history={voiceHistory} onTurn={handleVoiceTurn} />
      </View>
    ) : null}
    {/* The floating panel (FloatingAI) already sits on top of the keyboard, so this is a plain view. */}
    <View style={styles.panel}>
      <View style={styles.header}>
        <View style={{ flexShrink: 1 }}>
          <Text style={styles.title}>{t('aiCoFounderChatTitle')}</Text>
          <Text style={styles.subtitle}>{t('aiCoFounderChatSubtitle')}</Text>
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
        <Pressable
          onPress={openVoice}
          hitSlop={8}
          style={styles.closeBtn}
          accessibilityRole="button"
          accessibilityLabel={t('aiChatPanel.startLiveVoiceConversation')}
        >
          <Icon name="radio-outline" size={18} color={colors.primary} />
        </Pressable>
        {onClose ? (
          <Pressable
            onPress={onClose}
            hitSlop={8}
            style={styles.closeBtn}
            accessibilityRole="button"
            accessibilityLabel={t('common.closeAiChat')}
          >
            <Icon name="close" size={18} color={colors.text} />
          </Pressable>
        ) : null}
        </View>
      </View>

      {hasSaved ? (
        <View style={styles.actionsRow}>
          <View style={styles.headerActions}>
            {selecting ? (
              <>
                <Pressable accessibilityRole="button" onPress={stopSelecting} hitSlop={6}>
                  <Text style={styles.actionText}>{t('aiChatPanel.cancel')}</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setConfirm('selected')}
                  disabled={!selected.size}
                  hitSlop={6}
                  style={!selected.size && { opacity: 0.4 }}
                >
                  <Text style={[styles.actionText, styles.actionDanger]}>{t('aiChatPanel.deleteSelected', { count: selected.size })}</Text>
                </Pressable>
              </>
            ) : (
              <>
                <Pressable accessibilityRole="button" onPress={() => startSelecting(null)} hitSlop={6}>
                  <Text style={styles.actionText}>{t('aiChatPanel.select')}</Text>
                </Pressable>
                <Pressable accessibilityRole="button" onPress={() => setConfirm('all')} hitSlop={6}>
                  <Text style={[styles.actionText, styles.actionDanger]}>{t('aiChatPanel.clearAllPrompts')}</Text>
                </Pressable>
              </>
            )}
          </View>
        </View>
      ) : null}

      <ScrollView
        ref={scrollRef}
        style={styles.thread}
        contentContainerStyle={{ paddingBottom: 8 }}
        keyboardShouldPersistTaps="handled"
        // Dragging the conversation closes the keyboard; a tap on an empty part of it does too.
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
        onContentSizeChange={() => {
          if (!selecting) scrollRef.current?.scrollToEnd({ animated: true });
        }}
        // The list gets shorter when the keyboard opens or the message box grows: keep the newest message visible.
        onLayout={keepLatestInView}
      >
        {messages.map((m, i) => {
          if (m.local) {
            return (
              <ChatBubble key={m.id || `local-${i}`} from={m.from}>
                {localText(m)}
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
                <ChatBubble from={m.from}>{localText(m)}</ChatBubble>
              </View>
            </Pressable>
          );
        })}
        {transcribing && <ChatBubble from="user">{t('aiChatPanel.turningYourVoiceNoteInto')}</ChatBubble>}
        {failedNote && !transcribing ? (
          <Pressable onPress={retryFailed} accessibilityRole="button" style={{ alignSelf: 'flex-end', paddingVertical: 6 }}>
            <Text style={{ color: colors.primary, fontWeight: '700', fontSize: 13 }}>{t('aiChatPanel.retryRecording')}</Text>
          </Pressable>
        ) : null}
        {micDenied && canOpenSettings ? (
          <Pressable
            onPress={() => {
              setMicDenied(false);
              openAppSettings();
            }}
            accessibilityRole="button"
            style={{ alignSelf: 'flex-start', paddingVertical: 6 }}
          >
            <Text style={{ color: colors.primary, fontWeight: '700', fontSize: 13 }}>{t('voiceErr.openSettings')}</Text>
          </Pressable>
        ) : null}
        {sending && <ChatBubble from="ai">…</ChatBubble>}
      </ScrollView>

      {keyboardOpen ? (
        <View style={styles.keyboardBar}>
          <KeyboardDismissButton />
        </View>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.quickRow}
          contentContainerStyle={styles.quickRowContent}
          keyboardShouldPersistTaps="handled"
        >
          {quickReplies.map((q) => (
            <Pressable key={q.key} style={styles.quickBtn} onPress={() => send(t(q.labelKey), q.key)} disabled={sending}>
              <Text style={styles.quickBtnText}>{t(q.labelKey)}</Text>
            </Pressable>
          ))}
        </ScrollView>
      )}

      {recorder.isRecording ? (
        <Text style={styles.recordingHint}>
          ● {recorder.hearing ? t('aiChatPanel.hearing', { time: formatDuration(recorder.elapsedMs) }) : t('aiChatPanel.listening')}
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

        {/* Several lines, so a long question can be read and corrected before it is sent. Return sends
            (Shift+Enter adds a line on a computer); the keyboard stays open for the next question. */}
        <TextInput
          style={[styles.input, WEB && { height: webInputHeight }]}
          placeholder={recorder.isRecording ? t('tapToStop') : t('askAnything')}
          placeholderTextColor={colors.textMuted}
          value={draft}
          onChangeText={setDraft}
          multiline
          scrollEnabled
          textAlignVertical="top"
          accessibilityLabel={t('askAnything')}
          returnKeyType="send"
          enablesReturnKeyAutomatically
          {...(WEB
            ? {
                onKeyPress: (e) => {
                  const key = e?.nativeEvent?.key;
                  if (key === 'Enter' && !e.nativeEvent.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault?.();
                    submitDraft();
                  }
                },
                onContentSizeChange: (e) => {
                  const h = Math.ceil(e?.nativeEvent?.contentSize?.height || 0);
                  if (h) setWebInputHeight(Math.max(INPUT_MIN_HEIGHT, Math.min(INPUT_MAX_HEIGHT, h)));
                },
              }
            : { submitBehavior: 'submit', onSubmitEditing: submitDraft })}
          editable={!recorder.isRecording}
        />

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('aiChatPanel.send')}
          onPress={submitDraft}
          disabled={!draft.trim() || sending}
          style={[styles.sendBtn, (!draft.trim() || sending) && { opacity: 0.4 }]}
        >
          <Icon name="send" size={17} color={colors.white} />
        </Pressable>
      </View>

      <ConfirmDialog
        visible={confirm !== null}
        title={confirm === 'all' ? t('chat.clearAllTitle') : t('chat.deleteSelected')}
        message={
          confirm === 'all'
            ? t('chat.clearAllBody')
            : t('chat.deleteSelectedBody', { count: selected.size })
        }
        confirmLabel={confirm === 'all' ? t('chat.deleteAll') : t('common.delete')}
        onConfirm={confirmDelete}
        onCancel={() => setConfirm(null)}
      />
    </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, minHeight: 0 },
  voiceLayer: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 20, elevation: 20, backgroundColor: colors.bg },
  // flex:1 + minHeight:0 makes the screen exactly as tall as the window, so
  // only the message list scrolls and the input row always stays on screen.
  panel: { flex: 1, minHeight: 0, padding: 20, paddingBottom: 14 },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 12,
  },
  closeBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.inputBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionsRow: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: -4, marginBottom: 8 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  actionText: { fontSize: 12.5, fontWeight: '700', color: colors.primary },
  actionDanger: { color: colors.danger },
  selectRow: { flexDirection: 'row', alignItems: 'center' },
  checkbox: { marginRight: 10, marginBottom: 10 },
  title: { fontSize: 22, fontWeight: '800', color: colors.primary },
  subtitle: type.pageSubtitle,
  thread: { flex: 1, minHeight: 0 },
  quickRow: { flexGrow: 0, marginTop: 6, marginBottom: 10 },
  keyboardBar: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 6, marginBottom: 8 },
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
  // Buttons stay next to the last line as the message box grows.
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
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
    minHeight: INPUT_MIN_HEIGHT,
    maxHeight: INPUT_MAX_HEIGHT,
    backgroundColor: colors.inputBg,
    // Half the one-line height: a pill for a short question, a rounded box once it wraps.
    borderRadius: INPUT_MIN_HEIGHT / 2,
    paddingHorizontal: 16,
    paddingTop: 13,
    paddingBottom: 13,
    fontSize: 14.5,
    lineHeight: 20,
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
