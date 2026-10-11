import { useEffect, useState } from 'react';
import { View, Text, TextInput, Linking, Platform, StyleSheet } from 'react-native';
import BottomSheet from './BottomSheet';
import Button from './Button';
import { colors, radius } from '../theme';
import { normalizePhone, smsUrl, whatsappUrl } from '../lib/schedule';

// "Send a message" sheet: pre-written text you can edit, then open WhatsApp
// or the SMS app with it already filled in. We never send anything ourselves,
// the person taps send in their own app.
export default function FollowUpSheet({ visible, onClose, customer, message, title = 'Send a follow-up', onSent }) {
  const [text, setText] = useState(message || '');
  const [problem, setProblem] = useState('');

  useEffect(() => {
    if (visible) {
      setText(message || '');
      setProblem('');
    }
  }, [visible, message]);

  const valid = Boolean(normalizePhone(customer?.phone));

  const open = async (kind) => {
    const url = kind === 'whatsapp' ? whatsappUrl(customer.phone, text) : smsUrl(customer.phone, text, Platform.OS);
    if (!url) return setProblem("That phone number doesn't look right. Edit the customer and check it.");
    try {
      await Linking.openURL(url);
      setProblem('');
      onSent?.(customer, kind);
      onClose();
    } catch (e) {
      setProblem(kind === 'whatsapp' ? "Couldn't open WhatsApp. Is it installed on this device?" : "Couldn't open the messages app on this device.");
    }
  };

  return (
    <BottomSheet visible={visible} title={title} onClose={onClose} closeLabel="Cancel">
      {customer ? (
        <>
          <Text style={styles.to}>
            To <Text style={styles.toName}>{customer.name}</Text>
            {customer.phone ? ` · ${customer.phone}` : ''}
          </Text>
          <TextInput
            style={styles.input}
            value={text}
            onChangeText={setText}
            multiline
            textAlignVertical="top"
            placeholder="Write your message"
            placeholderTextColor={colors.textMuted}
          />
          {!customer.phone ? (
            <Text style={styles.warn}>This customer has no phone number yet. Add one under Customers to message them.</Text>
          ) : !valid ? (
            <Text style={styles.warn}>That phone number doesn't look right. Edit the customer and check it.</Text>
          ) : null}
          {problem ? <Text style={styles.warn}>{problem}</Text> : null}

          <Button icon="logo-whatsapp" disabled={!valid || !text.trim()} onPress={() => open('whatsapp')}>
            Open in WhatsApp
          </Button>
          <View style={{ height: 10 }} />
          <Button variant="outline-accent" icon="chatbubble-ellipses-outline" disabled={!valid || !text.trim()} onPress={() => open('sms')}>
            Open in SMS
          </Button>
          <Text style={styles.note}>The message is filled in for you. You tap send in the app.</Text>
        </>
      ) : null}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  to: { fontSize: 13, color: colors.textMuted, marginBottom: 10 },
  toName: { color: colors.text, fontWeight: '700' },
  input: {
    minHeight: 110,
    backgroundColor: colors.inputBg,
    borderRadius: radius.md,
    padding: 14,
    fontSize: 14.5,
    lineHeight: 20,
    color: colors.text,
    marginBottom: 12,
  },
  warn: { fontSize: 12.5, color: colors.danger, marginBottom: 12 },
  note: { fontSize: 11.5, color: colors.textMuted, textAlign: 'center', marginTop: 10, marginBottom: 6 },
});
