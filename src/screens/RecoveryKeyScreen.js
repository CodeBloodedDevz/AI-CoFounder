import { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import Screen from '../components/Screen';
import Button from '../components/Button';
import Icon from '../components/Icon';
import RecoveryKeyCard from '../components/RecoveryKeyCard';
import { useApp } from '../context/AppContext';
import { useTranslation } from '../i18n/I18nContext';
import { colors, radius, type } from '../theme';

// Shown once after signing up, after resetting a password, or after activating an older account: the account's
// recovery key, which is what "Forgot password?" asks for. Continue only after confirming it was saved.
export default function RecoveryKeyScreen() {
  const { recoveryNotice, dismissRecoveryNotice } = useApp();
  const { t } = useTranslation();
  const [saved, setSaved] = useState(false);
  if (!recoveryNotice) return null;
  const reason = recoveryNotice.reason;

  return (
    <Screen>
      <View style={{ marginTop: 24, marginBottom: 8 }}>
        <View style={styles.badge}>
          <Icon name="key-outline" size={26} color={colors.primary} />
        </View>
        <Text style={styles.title}>{reason === 'reset' ? t('recovery.titleReset') : t('recovery.titleNew')}</Text>
        <Text style={styles.subtitle}>
          {reason === 'reset' ? t('recovery.subtitleReset') : reason === 'activated' ? t('recovery.subtitleActivated') : t('recovery.subtitleRegistered')}
        </Text>
      </View>

      <RecoveryKeyCard recoveryKey={recoveryNotice.key} />

      <View style={styles.tips}>
        <Text style={styles.tip}>• {t('recovery.tipWhat')}</Text>
        <Text style={styles.tip}>• {t('recovery.tipWhere')}</Text>
        <Text style={styles.tip}>• {t('recovery.tipOnce')}</Text>
      </View>

      <Pressable
        onPress={() => setSaved((v) => !v)}
        style={styles.check}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: saved }}
      >
        <View style={[styles.box, saved && styles.boxOn]}>{saved ? <Icon name="checkmark" size={15} color={colors.white} /> : null}</View>
        <Text style={styles.checkText}>{t('recovery.iSavedIt')}</Text>
      </Pressable>

      <Button onPress={dismissRecoveryNotice} disabled={!saved}>{t('recovery.continue')}</Button>
    </Screen>
  );
}

const styles = StyleSheet.create({
  badge: { width: 52, height: 52, borderRadius: radius.md, backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  title: { ...type.pageTitle, fontSize: 24 },
  subtitle: { ...type.pageSubtitle },
  tips: { gap: 6, marginBottom: 18 },
  tip: { fontSize: 13, color: colors.textSoft, lineHeight: 19 },
  check: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, marginBottom: 14 },
  box: { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  boxOn: { backgroundColor: colors.primary },
  checkText: { flex: 1, fontSize: 14, color: colors.text, fontWeight: '600' },
});
