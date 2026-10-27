import { View, Text, StyleSheet } from 'react-native';
import Screen from './Screen';
import Button from './Button';
import BackButton from './BackButton';
import Icon from './Icon';
import { useApp } from '../context/AppContext';
import { colors, radius } from '../theme';
import { useTranslation } from '../i18n/I18nContext';

// Shows `children` only when the person's VERIFIED plan (from the server) includes the feature.
// The server enforces the same limits on its API, so hiding things here is only about a clear message.
export default function PlanGate({ feature, planName = 'Pro', title, navigation, children }) {
  const { t } = useTranslation();
  const { state } = useApp();
  const unlocked = state.subscription?.entitlements?.[feature] || state.payments?.limitsEnforced === false;
  if (unlocked) return children;
  return (
    <Screen>
      <BackButton navigation={navigation} />
      <View style={styles.box}>
        <Icon name="lock-closed-outline" size={34} color={colors.primary} />
        <Text style={styles.title}>{title || t('planGate.paidPlan')}</Text>
        <Text style={styles.text}>{t('planGate.upgradeTo', { plan: t.has(`plans.${planName.toLowerCase()}.name`) ? t(`plans.${planName.toLowerCase()}.name`) : planName })}</Text>
        <Button icon="diamond-outline" onPress={() => navigation.navigate('Subscription')}>{t('planGate.seePlans')}</Button>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  box: { alignItems: 'center', backgroundColor: colors.white, borderRadius: radius.lg, padding: 24, marginTop: 20 },
  title: { fontSize: 18, fontWeight: '800', color: colors.text, marginTop: 12, textAlign: 'center' },
  text: { fontSize: 13.5, color: colors.textSoft, textAlign: 'center', lineHeight: 20, marginTop: 8, marginBottom: 18 },
});
