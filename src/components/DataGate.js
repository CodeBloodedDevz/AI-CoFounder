import { useEffect } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import Button from './Button';
import Icon from './Icon';
import { useApp } from '../context/AppContext';
import { API_URL } from '../supabaseClient';
import { colors, radius, shadow } from '../theme';
import { useTranslation } from '../i18n/I18nContext';

// Shown while a logged-in person's data is first loaded from the backend.
export function DataLoading() {
  const { t } = useTranslation();
  return (
    <View style={styles.center}>
      <ActivityIndicator size="large" color={colors.primary} />
      <Text style={styles.note}>{t('dataGate.loadingYourBusiness')}</Text>
    </View>
  );
}

// Shown if that first load fails, instead of dropping people into an empty app
// (or the Business Setup screen) as if they had no data.
export function DataError({ message, onRetry, onLogout }) {
  const { t } = useTranslation();
  return (
    <View style={styles.center}>
      <Icon name="cloud-offline-outline" size={44} color={colors.textMuted} />
      <Text style={styles.title}>{t('dataGate.couldnTLoadYourData')}</Text>
      <Text style={styles.message}>{message}</Text>
      <Text style={styles.small}>{t('dataGate.server', { url: API_URL })}</Text>
      <View style={{ width: '100%', maxWidth: 320, gap: 10, marginTop: 18 }}>
        <Button onPress={onRetry} icon="refresh">{t('common.tryAgain')}</Button>
        <Button onPress={onLogout} variant="outline">{t('dataGate.logOut')}</Button>
      </View>
    </View>
  );
}

// A small banner when a save or delete fails, so it never fails silently.
export function SyncToast() {
  const { syncError, clearSyncError } = useApp();
  useEffect(() => {
    if (!syncError) return undefined;
    const timer = setTimeout(clearSyncError, 7000);
    return () => clearTimeout(timer);
  }, [syncError, clearSyncError]);
  if (!syncError) return null;
  return (
    <View style={styles.toastWrap} pointerEvents="box-none">
      <Pressable style={styles.toast} onPress={clearSyncError} accessibilityRole="alert" accessibilityLabel={syncError.message}>
        <Icon name="alert-circle" size={18} color={colors.danger} />
        <Text style={styles.toastText}>{syncError.message}</Text>
        <Icon name="close" size={16} color={colors.textMuted} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg, padding: 24, gap: 8 },
  note: { marginTop: 10, color: colors.textMuted, fontSize: 14 },
  title: { fontSize: 18, fontWeight: '800', color: colors.text, marginTop: 8 },
  message: { textAlign: 'center', color: colors.textSoft, fontSize: 14, lineHeight: 20, maxWidth: 340 },
  small: { color: colors.textMuted, fontSize: 12, marginTop: 4 },
  toastWrap: { position: 'absolute', top: 12, left: 12, right: 12, alignItems: 'center', zIndex: 2000, elevation: 2000 },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    maxWidth: 520,
    width: '100%',
    padding: 12,
    borderRadius: radius.md,
    backgroundColor: colors.dangerBg,
    borderWidth: 1,
    borderColor: colors.danger,
    ...shadow.raised,
  },
  toastText: { flex: 1, color: colors.text, fontSize: 13.5, lineHeight: 18 },
});
