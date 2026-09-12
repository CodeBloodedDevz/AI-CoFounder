import { View, Text, Pressable, StyleSheet } from 'react-native';
import Screen from '../components/Screen';
import Select from '../components/Select';
import { useApp } from '../context/AppContext';
import { useTranslation } from '../i18n/I18nContext';
import { LANGUAGES } from '../i18n/translations';
import { colors } from '../theme';

const ITEMS = [
  { icon: '📊', labelKey: 'businessAnalytics', to: 'BusinessAnalytics' },
  { icon: '💰', labelKey: 'aiPricingAssistant', to: 'PricingAssistant' },
  { icon: '📦', labelKey: 'stockManagement', to: 'StockManagement' },
  { icon: '🏪', labelKey: 'businessProfile', to: 'BusinessSetup' },
];

export default function MoreScreen({ navigation }) {
  const { state, logout, saveBusiness } = useApp();
  const { t } = useTranslation();

  return (
    <Screen>
      <View style={{ marginBottom: 16 }}>
        <Text style={styles.title}>{t('navMore')}</Text>
        <Text style={styles.subtitle}>
          {state.user?.name} · {state.business?.name}
        </Text>
      </View>

      <Select
        icon="🌐"
        label={t('preferredLanguage')}
        options={LANGUAGES}
        value={state.business?.language || 'English'}
        onChange={(lang) => saveBusiness({ ...state.business, language: lang })}
      />

      {ITEMS.map((item) => (
        <Pressable key={item.to} style={styles.row} onPress={() => navigation.navigate(item.to)}>
          <View style={styles.rowLeft}>
            <Text style={{ fontSize: 16 }}>{item.icon}</Text>
            <Text style={styles.rowTitle}>{t(item.labelKey)}</Text>
          </View>
          <Text style={styles.chevron}>›</Text>
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
  chevron: { color: colors.textMuted, fontSize: 18 },
  logoutBtn: {
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: 999,
    paddingVertical: 13,
    alignItems: 'center',
  },
  logoutText: { fontWeight: '700', color: colors.text },
});
