import { View, Text, TextInput, StyleSheet } from 'react-native';
import { colors, radius } from '../theme';

// A labelled multi-line text box in the same style as Input, with an optional "120 / 280" counter.
export default function TextArea({ label, value, onChangeText, placeholder, maxLength, error, hint, minHeight = 96, style, ...rest }) {
  const length = String(value || '').length;
  return (
    <View style={[styles.field, style]}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <TextInput
        style={[styles.input, { minHeight }, error ? styles.inputError : null]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        maxLength={maxLength}
        multiline
        textAlignVertical="top"
        accessibilityLabel={rest.accessibilityLabel || label || placeholder}
        {...rest}
      />
      <View style={styles.under}>
        {error ? <Text style={styles.error}>{error}</Text> : hint ? <Text style={styles.hint}>{hint}</Text> : <View />}
        {maxLength ? <Text style={[styles.count, length >= maxLength && { color: colors.danger }]}>{length} / {maxLength}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  field: { marginBottom: 16 },
  label: { fontSize: 13, fontWeight: '600', color: colors.text, marginBottom: 6 },
  input: { backgroundColor: colors.inputBg, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14.5, lineHeight: 21, color: colors.text },
  inputError: { borderColor: colors.danger },
  under: { flexDirection: 'row', justifyContent: 'space-between', gap: 10, marginTop: 4 },
  hint: { flex: 1, fontSize: 12, color: colors.textMuted },
  error: { flex: 1, fontSize: 12, color: colors.danger },
  count: { fontSize: 11.5, color: colors.textMuted },
});
