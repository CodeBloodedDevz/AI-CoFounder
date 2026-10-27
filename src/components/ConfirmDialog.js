import { Modal, View, Text, Pressable, StyleSheet } from 'react-native';
import Button from './Button';
import { colors, radius, shadow } from '../theme';
import { useTranslation } from '../i18n/I18nContext';

// A small confirm / cancel pop-up. Used instead of Alert.alert because
// Alert does nothing in the web version of the app.
//   tone="danger"  (default) red confirm button, for deleting / cancelling
//   tone="primary" brand confirm button, for neutral questions
//   cancelLabel={null} shows a single button (an information message)
export default function ConfirmDialog({
  visible,
  title,
  message,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
  tone = 'danger',
  loading = false,
  children,
}) {
  const { t } = useTranslation();
  const confirmText = confirmLabel ?? t('common.delete');
  const cancelText = cancelLabel === undefined ? t('common.cancel') : cancelLabel;
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <Pressable style={styles.backdrop} onPress={loading ? undefined : onCancel} accessibilityLabel={t('common.close')}>
        {/* The inner Pressable stops taps on the card from closing the dialog. */}
        <Pressable style={styles.card} onPress={() => {}} accessibilityRole="alert">
          {title ? <Text style={styles.title}>{title}</Text> : null}
          {message ? <Text style={styles.message}>{message}</Text> : null}
          {children}
          <View style={styles.actions}>
            {cancelText !== null ? (
              <Button variant="outline" fullWidth={false} size="sm" onPress={onCancel} disabled={loading} style={styles.btn}>
                {cancelText}
              </Button>
            ) : null}
            <Button
              variant={tone === 'danger' ? 'outline-danger' : 'primary'}
              fullWidth={false}
              size="sm"
              onPress={onConfirm}
              loading={loading}
              disabled={loading}
              style={styles.btn}
            >
              {confirmText}
            </Button>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(20, 18, 33, 0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: colors.bg,
    borderRadius: radius.lg,
    padding: 22,
    ...shadow.raised,
  },
  title: { fontSize: 17, fontWeight: '800', color: colors.text, marginBottom: 8 },
  message: { fontSize: 14, lineHeight: 20, color: colors.textSoft },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 20 },
  btn: { minWidth: 96 },
});
