import { Modal, View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { colors, radius } from '../theme';

// Same look as the Select pop-up (dimmed background, white sheet sliding up),
// shared by the date picker, time picker and follow-up message sheet.
export default function BottomSheet({ visible, title, onClose, children, closeLabel = 'Close' }) {
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close" />
      <View style={styles.wrap} pointerEvents="box-none">
        <View style={styles.sheet}>
          {title ? <Text style={styles.title}>{title}</Text> : null}
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.body}>
            {children}
          </ScrollView>
          <Pressable style={styles.closeBtn} onPress={onClose} accessibilityRole="button">
            <Text style={styles.closeText}>{closeLabel}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(23,19,31,0.4)' },
  wrap: { flex: 1, justifyContent: 'flex-end', alignItems: 'center' },
  sheet: {
    width: '100%',
    maxWidth: 460,
    maxHeight: '85%',
    backgroundColor: colors.white,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingBottom: 8,
  },
  title: { fontSize: 15, fontWeight: '700', color: colors.text, padding: 18, paddingBottom: 6 },
  body: { paddingHorizontal: 18, paddingBottom: 8 },
  closeBtn: { alignItems: 'center', paddingVertical: 12 },
  closeText: { color: colors.textMuted, fontWeight: '600' },
});
