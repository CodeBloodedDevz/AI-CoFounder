import { Modal, View, Text, Pressable, StyleSheet } from 'react-native';
import Button from './Button';
import { colors, radius, shadow } from '../theme';

// A small confirm / cancel pop-up. Used instead of Alert.alert because
// Alert does nothing in the web version of the app.
export default function ConfirmDialog({
  visible,
  title,
  message,
  confirmLabel = 'Delete',
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <Pressable style={styles.backdrop} onPress={onCancel} accessibilityLabel="Close">
        {/* The inner Pressable stops taps on the card from closing the dialog. */}
        <Pressable style={styles.card} onPress={() => {}} accessibilityRole="alert">
          {title ? <Text style={styles.title}>{title}</Text> : null}
          <Text style={styles.message}>{message}</Text>
          <View style={styles.actions}>
            <Button variant="outline" fullWidth={false} size="sm" onPress={onCancel} style={styles.btn}>
              {cancelLabel}
            </Button>
            <Button variant="outline-danger" fullWidth={false} size="sm" onPress={onConfirm} style={styles.btn}>
              {confirmLabel}
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
