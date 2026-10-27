import { useEffect, useState } from 'react';
import { View, Text, TextInput, Linking, Platform, StyleSheet } from 'react-native';
import BottomSheet from './BottomSheet';
import Button from './Button';
import { colors, radius } from '../theme';
import { normalizePhone, smsUrl, whatsappUrl } from '../lib/schedule';
import { useTranslation } from '../i18n/I18nContext';

// "Send a message" sheet: pre-written text you can edit, then open WhatsApp
// or the SMS app with it already filled in. We never send anything ourselves,
// the person taps send in their own app.
export default function FollowUpSheet({ visible, onClose, customer, message, title, onSent }) {
  const { t } = useTranslation();
  title = title ?? t('operations.sendFollowUp');
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
    if (!url) return setProblem(t('followUpSheet.thatPhoneNumberDoesnT'));
    try {
      await Linking.openURL(url);
      setProblem('');
      onSent?.(customer, kind);
      onClose();
    } catch (e) {
      setProblem(kind === 'whatsapp' ? t('followUpSheet.noWhatsapp') : t('followUpSheet.noMessages'));
    }
  };

  return (
    <BottomSheet visible={visible} title={title} onClose={onClose} closeLabel={t('common.cancel')}>
      {customer ? (
        <>
          <Text style={styles.to}>
            {t('followUpSheet.to')} <Text style={styles.toName}>{customer.name}</Text>
            {customer.phone ? ` · ${customer.phone}` : ''}
          </Text>
          {/* Grows with the message up to a fixed height, then scrolls inside itself so the line with the
              cursor stays in view (the sheet keeps the box above the keyboard). */}
          <TextInput
            style={styles.input}
            value={text}
            onChangeText={setText}
            multiline
            scrollEnabled
            textAlignVertical="top"
            placeholder={t('followUpSheet.writeYourMessage')}
            placeholderTextColor={colors.textMuted}
            accessibilityLabel={t('followUpSheet.writeYourMessage')}
          />
          {!customer.phone ? (
            <Text style={styles.warn}>{t('followUpSheet.thisCustomerHasNoPhone')}</Text>
          ) : !valid ? (
            <Text style={styles.warn}>{t('followUpSheet.thatPhoneNumberDoesnT')}</Text>
          ) : null}
          {problem ? <Text style={styles.warn}>{problem}</Text> : null}

          <Button icon="logo-whatsapp" disabled={!valid || !text.trim()} onPress={() => open('whatsapp')}>{t('followUpSheet.openInWhatsapp')}</Button>
          <View style={{ height: 10 }} />
          <Button variant="outline-accent" icon="chatbubble-ellipses-outline" disabled={!valid || !text.trim()} onPress={() => open('sms')}>{t('followUpSheet.openInSms')}</Button>
          <Text style={styles.note}>{t('followUpSheet.theMessageIsFilledIn')}</Text>
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
    maxHeight: 180,
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
