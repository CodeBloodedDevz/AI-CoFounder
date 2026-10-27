import { View, Text, Pressable, StyleSheet } from 'react-native';
import { colors, radius } from '../theme';
import Icon from './Icon';

// The closed "box" of a picker: identical to Select's control so forms look uniform.
export default function PickerField({ label, value, placeholder, icon, onPress, error }) {
  return (
    <View style={styles.field}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <Pressable style={styles.control} onPress={onPress} accessibilityRole="button" accessibilityLabel={label}>
        {icon ? <Icon name={icon} size={17} color={colors.textMuted} style={styles.icon} /> : null}
        <Text style={[styles.value, !value && styles.placeholder]} numberOfLines={1}>
          {value || placeholder}
        </Text>
        <Icon name="chevron-down-outline" size={16} color={colors.textMuted} style={styles.chevron} />
      </Pressable>
      {error ? <Text style={styles.error}>{error}</Text> : null}
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
  error: { fontSize: 12, color: colors.danger, marginTop: 4 },
});
