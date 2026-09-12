import { View, Text, TextInput, StyleSheet } from 'react-native';
import { colors, radius } from '../theme';

export default function Input({
  label,
  error,
  value,
  onChangeText,
  placeholder,
  secureTextEntry,
  keyboardType,
  autoCapitalize = 'sentences',
  icon,
  ...rest
}) {
  return (
    <View style={styles.field}>
      {label && <Text style={styles.label}>{label}</Text>}
      <View style={styles.wrap}>
        {icon && <Text style={styles.icon}>{icon}</Text>}
        <TextInput
          style={[styles.input, icon && { paddingLeft: 4 }]}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={colors.textMuted}
          secureTextEntry={secureTextEntry}
          keyboardType={keyboardType}
          autoCapitalize={autoCapitalize}
          {...rest}
        />
      </View>
      {error ? <Text style={styles.hint}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  field: { marginBottom: 16 },
  label: { fontSize: 13, fontWeight: '600', color: colors.text, marginBottom: 6 },
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.inputBg,
    borderRadius: radius.md,
    paddingHorizontal: 14,
  },
  icon: { fontSize: 16, marginRight: 6 },
  input: {
    flex: 1,
    paddingVertical: 13,
    fontSize: 14.5,
    color: colors.text,
  },
  hint: { fontSize: 12, color: colors.danger, marginTop: 4 },
});
