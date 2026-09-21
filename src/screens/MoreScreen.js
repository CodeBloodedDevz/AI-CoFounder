import { View, Text, Pressable, StyleSheet } from 'react-native';
import Screen from '../components/Screen';
import Select from '../components/Select';
import { useApp } from '../context/AppContext';
import { useTranslation } from '../i18n/I18nContext';
import { LANGUAGES } from '../i18n/translations';
import { colors, radius } from '../theme';
import Icon from '../components/Icon';

const BASE_ITEMS = [
  { icon: 'person-outline', label: 'Profile', to: 'Profile' },
  { icon: 'bar-chart-outline', labelKey: 'businessAnalytics', to: 'BusinessAnalytics' },
  { icon: 'cash-outline', labelKey: 'aiPricingAssistant', to: 'PricingAssistant' },
  { icon: 'people-outline', label: 'Customers & work', to: 'Operations' },
  { icon: 'storefront-outline', labelKey: 'businessProfile', to: 'BusinessSetup' },
];

export default function MoreScreen({ navigation }) {
  const { state, logout, saveBusiness } = useApp();
  const { t } = useTranslation();
  const model = state.business?.businessModel || 'Product-based';
  const plan = state.subscription?.plan || 'Free';
  const items = [
    ...BASE_ITEMS.slice(0, 2),
    ...(model !== 'Service-based' ? [{ icon: 'cube-outline', labelKey: 'stockManagement', to: 'StockManagement' }] : []),
    ...(model !== 'Product-based' ? [{ icon: 'construct-outline', label: 'Services', to: 'ServiceManagement' }] : []),
    BASE_ITEMS[2],
    { icon: 'diamond-outline', label: 'Subscription', to: 'Subscription', badge: plan },
  ];

  return (
    <Screen>
      <View style={{ marginBottom: 16 }}>
        <Text style={styles.title}>{t('navMore')}</Text>
        <Text style={styles.subtitle}>
          {state.user?.name} · {state.business?.name}
        </Text>
      </View>

      <Select
        icon="globe-outline"
        label={t('preferredLanguage')}
        options={LANGUAGES}
        value={state.business?.language || 'English'}
        onChange={(lang) => saveBusiness({ ...state.business, language: lang })}
      />

      {items.map((item) => (
        <Pressable key={item.to} style={styles.row} onPress={() => navigation.navigate(item.to)}>
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
      <Pressable
        style={styles.logoutBtn}
        onPress={() => {
          logout();
        }}
      >
        <Text style={styles.logoutText}>{t('logOut')}</Text>
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 22, fontWeight: '800', color: colors.text },
  subtitle: { marginTop: 4, color: colors.textMuted, fontSize: 13.5 },
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
    backgroundColor: colors.primary,
    borderWidth: 1.5,
    borderColor: colors.primary,
    borderRadius: 999,
    paddingVertical: 13,
    alignItems: 'center',
  },
  logoutText: { fontWeight: '700', color: colors.white },
});
