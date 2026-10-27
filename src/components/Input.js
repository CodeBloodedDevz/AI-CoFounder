import { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet } from 'react-native';
import { colors, radius } from '../theme';
import Icon from './Icon';
import { useTranslation } from '../i18n/I18nContext';

// A labelled text box.
//   error  - red message under the box (the box gets a red edge too)
//   hint   - grey help text under the box (when there is no error)
//   secureTextEntry - a password box, with a show / hide eye button
export default function Input({
  label,
  error,
  hint,
  value,
  onChangeText,
  placeholder,
  secureTextEntry,
  keyboardType,
  autoCapitalize = 'sentences',
  icon,
  style,
  ...rest
}) {
  const { t } = useTranslation();
  const [revealed, setRevealed] = useState(false);
  const hidden = Boolean(secureTextEntry) && !revealed;
  return (
    <View style={[styles.field, style]}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <View style={[styles.wrap, error ? styles.wrapError : null]}>
        {icon ? <Icon name={icon} size={16} color={colors.textMuted} style={styles.icon} /> : null}
        <TextInput
          style={[styles.input, icon && { paddingLeft: 4 }]}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={colors.textMuted}
          secureTextEntry={hidden}
          keyboardType={keyboardType}
          autoCapitalize={secureTextEntry ? 'none' : autoCapitalize}
          accessibilityLabel={rest.accessibilityLabel || label || placeholder}
          {...rest}
        />
        {secureTextEntry ? (
          <Pressable
            onPress={() => setRevealed((v) => !v)}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={revealed ? t('input.hidePassword') : t('input.showPassword')}
          >
            <Icon name={revealed ? 'eye-off-outline' : 'eye-outline'} size={18} color={colors.textMuted} />
          </Pressable>
        ) : null}
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : hint ? <Text style={styles.hint}>{hint}</Text> : null}
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
    borderWidth: 1,
    borderColor: colors.border,
  },
  wrapError: { borderColor: colors.danger },
  icon: { marginRight: 6 },
  input: {
    flex: 1,
    paddingVertical: 12,
    fontSize: 14.5,
    color: colors.text,
  },
  error: { fontSize: 12, color: colors.danger, marginTop: 4 },
  hint: { fontSize: 12, color: colors.textMuted, marginTop: 4 },
});
