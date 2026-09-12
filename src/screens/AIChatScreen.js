import { useMemo, useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet } from 'react-native';
import Screen from '../components/Screen';
import ChatBubble from '../components/ChatBubble';
import { useApp } from '../context/AppContext';
import { chatReply, summarise } from '../lib/aiEngine';
import { useTranslation } from '../i18n/I18nContext';
import { colors, radius } from '../theme';

const QUICK_REPLIES = [
  { key: 'analyse', label: 'Analyse my business' },
  { key: 'profit', label: 'Increase my profit?' },
  { key: 'restock', label: 'What should I restock?' },
  { key: 'prices', label: 'Check my prices' },
];

export default function AIChatScreen() {
  const { state } = useApp();
  const { t } = useTranslation();
  const { transactions, products, user } = state;
  const summary = useMemo(() => summarise(transactions), [transactions]);

  const [messages, setMessages] = useState([
    { from: 'ai', text: `👋 Hi ${user?.name || 'there'}! I've analysed your business this week.` },
    {
      from: 'ai',
      text:
        summary.profit >= 0
          ? `Your sales are up, and your profit is looking healthy at R${summary.profit.toFixed(0)}.`
          : `Your expenses currently exceed your sales by R${Math.abs(summary.profit).toFixed(0)}.`,
    },
    { from: 'ai', text: 'I recommend reviewing your stock before purchasing more — some items are moving faster than others.' },
  ]);
  const [draft, setDraft] = useState('');

  const send = (text, intentKey) => {
    if (!text.trim()) return;
    setMessages((m) => [...m, { from: 'user', text }]);
    const reply = intentKey ? chatReply(intentKey, { transactions, products }) : chatReply('default', { transactions, products });
    setTimeout(() => {
      setMessages((m) => [...m, { from: 'ai', text: reply }]);
    }, 350);
  };

  return (
    <Screen>
      <View style={{ marginBottom: 16 }}>
        <Text style={styles.title}>{t('aiCoFounderChatTitle')}</Text>
        <Text style={styles.subtitle}>{t('aiCoFounderChatSubtitle')}</Text>
      </View>

      <View style={{ marginBottom: 16 }}>
        {messages.map((m, i) => (
          <ChatBubble key={i} from={m.from}>
            {m.text}
          </ChatBubble>
        ))}
      </View>

      <View style={styles.quickGrid}>
        {QUICK_REPLIES.map((q) => (
          <Pressable key={q.key} style={styles.quickBtn} onPress={() => send(q.label, q.key)}>
            <Text style={styles.quickBtnText}>{q.label}</Text>
          </Pressable>
        ))}
      </View>

      <Pressable style={styles.voiceBtn} onPress={() => send('🎙️ (voice message)')}>
        <Text style={styles.voiceBtnText}>🎙️ {t('holdToSpeak')}</Text>
      </Pressable>

      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          placeholder={t('askAnything')}
          placeholderTextColor={colors.textMuted}
          value={draft}
          onChangeText={setDraft}
          onSubmitEditing={() => {
            send(draft);
            setDraft('');
          }}
          returnKeyType="send"
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 22, fontWeight: '800', color: colors.primary },
  subtitle: { marginTop: 4, color: colors.textMuted, fontSize: 13.5 },
  quickGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 16 },
  quickBtn: {
    flexBasis: '47%',
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingVertical: 10,
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  quickBtnText: { fontSize: 12.5, fontWeight: '600', color: colors.text, textAlign: 'center' },
  voiceBtn: {
    borderWidth: 1.5,
    borderColor: colors.primary,
    borderRadius: radius.pill,
    paddingVertical: 12,
    alignItems: 'center',
    marginBottom: 12,
  },
  voiceBtnText: { color: colors.primary, fontWeight: '700', fontSize: 14 },
  inputRow: { backgroundColor: colors.inputBg, borderRadius: radius.md, paddingHorizontal: 14 },
  input: { paddingVertical: 13, fontSize: 14.5, color: colors.text },
});
