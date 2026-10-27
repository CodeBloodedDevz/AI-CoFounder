import { Pressable, StyleSheet } from 'react-native';
import { colors } from '../theme';
import Icon from './Icon';
import { useTranslation } from '../i18n/I18nContext';

// The designer's round back button (arrow only).
export default function BackButton({ navigation }) {
  const { t } = useTranslation();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('common.goBack')}
      style={({ pressed }) => [styles.button, pressed && { opacity: 0.6 }]}
      onPress={() => navigation.canGoBack() && navigation.goBack()}
    >
      <Icon name="arrow-back" size={22} color={colors.text} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { width: 40, height: 40, borderRadius: 20, marginLeft: -8, marginBottom: 6, alignItems: 'center', justifyContent: 'center', alignSelf: 'flex-start' },
});
