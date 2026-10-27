import { useState } from 'react';
import { View, Text, Pressable, Platform, Share, StyleSheet } from 'react-native';
import Icon from './Icon';
import { useTranslation } from '../i18n/I18nContext';
import { colors, radius } from '../theme';

// Shows a recovery key in large, easy-to-copy letters with a Copy (web) / Save or share (phone) button.
// The key is only in memory: it is not stored on the device or shown again after this.
export default function RecoveryKeyCard({ recoveryKey }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState('');

  const save = async () => {
    const message = t('recovery.shareText', { key: recoveryKey });
    try {
      if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(recoveryKey);
        setCopied(t('recovery.copied'));
      } else {
        await Share.share({ message });
        setCopied('');
      }
    } catch (e) {
      setCopied(t('recovery.copyFailed'));
    }
  };

  return (
    <View style={styles.card}>
      <Text style={styles.label}>{t('recovery.yourKey')}</Text>
      <Text style={styles.key} selectable accessibilityLabel={recoveryKey.split('').join(' ')}>
        {recoveryKey}
      </Text>
      <Pressable onPress={save} style={styles.copy} accessibilityRole="button">
        <Icon name={Platform.OS === 'web' ? 'copy-outline' : 'share-outline'} size={16} color={colors.primary} />
        <Text style={styles.copyText}>{Platform.OS === 'web' ? t('recovery.copy') : t('recovery.saveShare')}</Text>
      </Pressable>
      {copied ? <Text style={styles.copied}>{copied}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1.5, borderColor: colors.primary, borderStyle: 'dashed', borderRadius: radius.lg, padding: 16, alignItems: 'center', backgroundColor: colors.primaryLight, marginVertical: 12 },
  label: { fontSize: 12, fontWeight: '700', color: colors.primaryDark, marginBottom: 6 },
  key: { fontSize: 20, fontWeight: '800', letterSpacing: 1.5, color: colors.text, textAlign: 'center', fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }) },
  copy: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10, paddingVertical: 6, paddingHorizontal: 12 },
  copyText: { color: colors.primary, fontWeight: '700', fontSize: 13.5 },
  copied: { fontSize: 12, color: colors.success, marginTop: 2 },
});
