import { Text, Pressable, StyleSheet } from 'react-native';
import { useApp } from '../context/AppContext';
import { getBusinessName, BUSINESS_NAME_FALLBACK } from '../lib/businessName';
import { colors } from '../theme';
import { useTranslation } from '../i18n/I18nContext';

// Heading at the top of every Home screen: the signed-in user's own business name,
// or (if none has been saved yet) a friendly prompt that opens Business Information.
export default function BusinessTitle({ navigation }) {
  const { t } = useTranslation();
  const { state } = useApp();
  const name = getBusinessName(state.business);

  if (name) return <Text style={styles.title} numberOfLines={2}>{name}</Text>;

  return (
    <>
      <Text style={styles.title}>{BUSINESS_NAME_FALLBACK}</Text>
      <Pressable onPress={() => navigation.navigate('BusinessSetup')} accessibilityRole="button" hitSlop={8}>
        <Text style={styles.prompt}>{t('businessTitle.addYourBusinessNameTo')}</Text>
      </Pressable>
    </>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 22, fontWeight: '800', color: colors.text },
  prompt: { marginTop: 4, color: colors.primary, fontSize: 13.5, fontWeight: '700' },
});
