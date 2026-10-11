import { Alert, View, Text, Pressable, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Screen from '../components/Screen';
import Select from '../components/Select';
import { useApp } from '../context/AppContext';
import { useTranslation } from '../i18n/I18nContext';
import { LANGUAGES } from '../i18n/translations';
import { colors, radius, gradient } from '../theme';
import Icon from '../components/Icon';

export default function MoreScreen({ navigation }) {
  const { state, logout, saveBusiness } = useApp();
  const { t } = useTranslation();
  const model = state.business?.businessModel || 'Product-based';
  const plan = state.subscription?.plan || 'Free';
  const businessName = state.business?.name || 'Your Business';
  const initials = businessName
    .split(' ')
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();

  const items = [
    { icon: 'storefront-outline', label: 'Business Information', to: 'BusinessSetup' },
    { icon: 'diamond-outline', label: 'Subscription & Billing', to: 'Subscription', badge: plan },
    { icon: 'person-outline', label: 'Profile', to: 'Profile' },
    { icon: 'mic-outline', labelKey: 'voiceNotes', to: 'VoiceNotes' },
    { icon: 'bar-chart-outline', labelKey: 'businessAnalytics', to: 'BusinessAnalytics' },
    { icon: 'cash-outline', labelKey: 'aiPricingAssistant', to: 'PricingAssistant' },
    { icon: 'people-outline', label: 'Customers & work', to: 'Operations' },
    ...(model !== 'Hybrid' ? [{ icon: 'cube-outline', label: model === 'Service-based' ? 'Services' : t('stockManagement'), to: 'StockTab', isTab: true }] : []),
    { icon: 'people-circle-outline', label: 'Team Members', onPress: () => Alert.alert('Team Members', 'Multi-user team accounts are coming soon.') },
  ];

  return (
    <Screen>
      <View style={{ marginBottom: 16 }}>
        <Text style={styles.title}>Business Profile</Text>
        <Text style={styles.subtitle}>Manage your business information</Text>
      </View>

      <LinearGradient colors={gradient.colors} start={gradient.start} end={gradient.end} style={styles.heroCard}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initials || 'B'}</Text>
        </View>
        <Text style={styles.heroName}>{businessName}</Text>
      </LinearGradient>

      <Select
        icon="globe-outline"
        label={t('preferredLanguage')}
        options={LANGUAGES}
        value={state.business?.language || 'English'}
        onChange={(lang) => saveBusiness({ ...state.business, language: lang })}
      />

      {items.map((item) => (
        <Pressable
          key={item.label || item.labelKey}
          style={styles.row}
          onPress={() => (item.onPress ? item.onPress() : navigation.navigate(item.to))}
        >
          <View style={styles.rowLeft}>
            <Icon name={item.icon} size={19} color={colors.primary} />
            <Text style={styles.rowTitle}>{item.label || t(item.labelKey)}</Text>
          </View>
          <View style={styles.rowRight}>
            {item.badge ? (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{item.badge}</Text>
              </View>
            ) : null}
            <Icon name="chevron-forward-outline" size={16} color={colors.textMuted} />
          </View>
        </Pressable>
      ))}

      <View style={{ height: 20 }} />
      <Pressable style={styles.logoutBtn} onPress={() => logout()}>
        <Text style={styles.logoutText}>{t('logOut')}</Text>
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 22, fontWeight: '800', color: colors.text },
  subtitle: { marginTop: 4, color: colors.textMuted, fontSize: 13.5 },
  heroCard: { borderRadius: radius.lg, paddingVertical: 26, alignItems: 'center', marginBottom: 18 },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  avatarText: { fontSize: 20, fontWeight: '800', color: colors.primary },
  heroName: { color: colors.white, fontSize: 17, fontWeight: '800' },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  rowLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  rowTitle: { fontSize: 14.5, color: colors.text, fontWeight: '600' },
  rowRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  badge: { backgroundColor: colors.primaryLight, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText: { fontSize: 11, fontWeight: '700', color: colors.primaryDark },
  logoutBtn: {
    backgroundColor: colors.inputBg,
    borderRadius: 999,
    paddingVertical: 13,
    alignItems: 'center',
  },
  logoutText: { fontWeight: '700', color: colors.danger },
});
