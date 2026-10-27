import { View, Text, Pressable, StyleSheet } from 'react-native';
import Icon from './Icon';
import { colors, radius } from '../theme';
import { useTranslation } from '../i18n/I18nContext';

// An inline message at the top of a form: green for "saved", red for "that didn't work".
//   <Banner type="success" text="Customer added." onClose={...} />
export default function Banner({ type = 'success', text, onClose, style }) {
  const { t } = useTranslation();
  if (!text) return null;
  const error = type === 'error';
  return (
    <View
      style={[styles.banner, error ? styles.error : styles.success, style]}
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
    >
      <Icon name={error ? 'alert-circle-outline' : 'checkmark-circle-outline'} size={17} color={error ? colors.danger : colors.success} />
      <Text style={[styles.text, { color: error ? colors.danger : colors.success }]}>{text}</Text>
      {onClose ? (
        <Pressable onPress={onClose} hitSlop={8} accessibilityRole="button" accessibilityLabel={t('common.close')}>
          <Icon name="close" size={15} color={colors.textMuted} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  banner: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: radius.md, paddingVertical: 11, paddingHorizontal: 14, marginBottom: 14 },
  success: { backgroundColor: colors.successBg },
  error: { backgroundColor: colors.dangerBg },
  text: { flex: 1, fontSize: 13, fontWeight: '600', lineHeight: 18 },
});
