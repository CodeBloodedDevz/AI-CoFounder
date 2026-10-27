import { useState } from 'react';
import { View, Text, Pressable, Modal, ScrollView, StyleSheet, SafeAreaView } from 'react-native';
import { colors, radius } from '../theme';
import Icon from './Icon';
import { useTranslation } from '../i18n/I18nContext';


export default function Select({ label, value, onChange, options = [], placeholder, icon, renderOption }) {
  const { t } = useTranslation();
  const hint = placeholder ?? t('common.selectOption');
  const [open, setOpen] = useState(false);

  return (
    <View style={styles.field}>
      {label && <Text style={styles.label}>{label}</Text>}
      <Pressable style={styles.control} onPress={() => setOpen(true)} accessibilityRole="button" accessibilityLabel={label || hint}>
        {icon && <Icon name={icon} size={17} color={colors.textMuted} style={styles.icon} />}
        <Text style={[styles.value, !value && styles.placeholder]} numberOfLines={1}>
          {value ? (renderOption ? renderOption(value) : value) : hint}
        </Text>
        <Icon name="chevron-down-outline" size={16} color={colors.textMuted} style={styles.chevron} />
      </Pressable>

      <Modal visible={open} animationType="slide" transparent onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)} />
        <SafeAreaView style={styles.sheet} accessibilityViewIsModal>
          <Text style={styles.sheetTitle}>{label || hint}</Text>
          {/* Scrolls when there are many options (a long customer or product list). */}
          <ScrollView style={styles.list} keyboardShouldPersistTaps="handled">
            {options.length === 0 ? <Text style={styles.noOptions}>{t('common.noOptions')}</Text> : null}
            {options.map((item) => (
              <Pressable
                key={String(item)}
                accessibilityRole="button"
                accessibilityState={{ selected: item === value }}
                style={[styles.option, item === value && styles.optionActive]}
                onPress={() => {
                  onChange(item);
                  setOpen(false);
                }}
              >
                <Text style={[styles.optionText, item === value && styles.optionTextActive]}>
                  {renderOption ? renderOption(item) : item}
                </Text>
                {item === value && <Icon name="checkmark" size={17} color={colors.primary} />}
              </Pressable>
            ))}
          </ScrollView>
          <Pressable style={styles.closeBtn} onPress={() => setOpen(false)}>
            <Text style={styles.closeBtnText}>{t('common.close')}</Text>
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
  icon: { marginRight: 8 },
  value: { flex: 1, fontSize: 14.5, color: colors.text },
  placeholder: { color: colors.textMuted },
  chevron: { marginLeft: 8 },
  backdrop: { flex: 1, backgroundColor: 'rgba(23,19,31,0.4)' },
  sheet: {
    width: '100%',
    maxWidth: 460,
    alignSelf: 'center',
    backgroundColor: colors.white,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    maxHeight: '65%',
    paddingBottom: 8,
  },
  list: { flexGrow: 0 },
  noOptions: { paddingHorizontal: 18, paddingVertical: 14, color: colors.textMuted, fontSize: 14 },
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
  closeBtn: { alignItems: 'center', paddingVertical: 12 },
  closeBtnText: { color: colors.textMuted, fontWeight: '600' },
});
