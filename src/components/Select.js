import { useState } from 'react';
import { View, Text, Pressable, Modal, FlatList, StyleSheet, SafeAreaView } from 'react-native';
import { colors, radius } from '../theme';


export default function Select({ label, value, onChange, options = [], placeholder = 'Select an option', icon, renderOption }) {
  const [open, setOpen] = useState(false);

  return (
    <View style={styles.field}>
      {label && <Text style={styles.label}>{label}</Text>}
      <Pressable style={styles.control} onPress={() => setOpen(true)}>
        {icon && <Text style={styles.icon}>{icon}</Text>}
        <Text style={[styles.value, !value && styles.placeholder]} numberOfLines={1}>
          {value || placeholder}
        </Text>
        <Text style={styles.chevron}>⌄</Text>
      </Pressable>

      <Modal visible={open} animationType="slide" transparent onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)} />
        <SafeAreaView style={styles.sheet}>
          <Text style={styles.sheetTitle}>{label || placeholder}</Text>
          <FlatList
            data={options}
            keyExtractor={(item) => String(item)}
            renderItem={({ item }) => (
              <Pressable
                style={[styles.option, item === value && styles.optionActive]}
                onPress={() => {
                  onChange(item);
                  setOpen(false);
                }}
              >
                <Text style={[styles.optionText, item === value && styles.optionTextActive]}>
                  {renderOption ? renderOption(item) : item}
                </Text>
                {item === value && <Text style={styles.check}>✓</Text>}
              </Pressable>
            )}
          />
          <Pressable style={styles.closeBtn} onPress={() => setOpen(false)}>
            <Text style={styles.closeBtnText}>Close</Text>
          </Pressable>
        </SafeAreaView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  field: { marginBottom: 16 },
  label: { fontSize: 13, fontWeight: '600', color: colors.text, marginBottom: 6 },
  control: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.inputBg,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  icon: { fontSize: 16, marginRight: 8 },
  value: { flex: 1, fontSize: 14.5, color: colors.text },
  placeholder: { color: colors.textMuted },
  chevron: { fontSize: 16, color: colors.textMuted, marginLeft: 8 },
  backdrop: { flex: 1, backgroundColor: 'rgba(23,19,31,0.4)' },
  sheet: {
    backgroundColor: colors.white,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    maxHeight: '65%',
    paddingBottom: 8,
  },
  sheetTitle: { fontSize: 15, fontWeight: '700', color: colors.text, padding: 18, paddingBottom: 8 },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  optionActive: { backgroundColor: colors.primaryLight },
  optionText: { fontSize: 15, color: colors.text },
  optionTextActive: { color: colors.primaryDark, fontWeight: '700' },
  check: { color: colors.primary, fontWeight: '800' },
  closeBtn: { alignItems: 'center', paddingVertical: 12 },
  closeBtnText: { color: colors.textMuted, fontWeight: '600' },
});
