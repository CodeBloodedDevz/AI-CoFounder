import { Pressable, Text, StyleSheet } from 'react-native';
import Icon from './Icon';
import { dismissKeyboard } from '../hooks/useKeyboard';
import { useTranslation } from '../i18n/I18nContext';
import { colors, radius } from '../theme';

// A small "Hide keyboard" pill. Multi-line text boxes have no key that closes the keyboard (Return adds
// a new line), so screens show this while the keyboard is open.
export default function KeyboardDismissButton({ style, onPress }) {
  const { t } = useTranslation();
  return (
    <Pressable
      onPress={() => {
        dismissKeyboard();
        onPress?.();
      }}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={t('common.hideKeyboard')}
      style={({ pressed }) => [styles.btn, pressed && { opacity: 0.7 }, style]}
    >
      <Icon name="chevron-down" size={15} color={colors.primary} />
      <Text style={styles.text}>{t('common.hideKeyboard')}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-end',
    backgroundColor: colors.primaryLight,
    borderRadius: radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  text: { fontSize: 12.5, fontWeight: '700', color: colors.primaryDark },
});
