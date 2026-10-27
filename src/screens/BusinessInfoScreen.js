import { useEffect, useRef } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import Screen from '../components/Screen';
import BackButton from '../components/BackButton';
import Button from '../components/Button';
import Banner from '../components/Banner';
import Icon from '../components/Icon';
import { useBanner } from '../components/useBanner';
import { useApp } from '../context/AppContext';
import { useTranslation } from '../i18n/I18nContext';
import { languageDisplayName } from '../i18n/languages';
import { getBusinessName } from '../lib/businessName';
import { colors, radius, type } from '../theme';

// Business Information: shows the saved business profile (read-only) with an "Edit Business Information" button.
// The data is the signed-in owner's business as loaded from the server (GET /business only ever returns the
// caller's own business). With no business yet, or one without a name (the one required field), there is
// nothing to show, so the page hands over to the edit page instead of showing an empty profile.
export default function BusinessInfoScreen({ navigation, route }) {
  const { state, reloadData } = useApp();
  const { t, tv } = useTranslation();
  const { banner, show, clear } = useBanner(4000);
  const business = state.business;
  const name = getBusinessName(business);
  const complete = Boolean(business && name);

  // Nothing saved yet: go straight to the edit page. `replace` keeps this page out of the history, so going
  // back from the edit page returns to where the person came from (no loop between the two pages).
  const redirected = useRef(false);
  useEffect(() => {
    if (!complete && !redirected.current) {
      redirected.current = true;
      navigation.replace('BusinessSetup', { from: 'info' });
    }
  }, [complete, navigation]);

  // Back from a successful save on the edit page.
  const savedAt = route?.params?.savedAt;
  useEffect(() => {
    if (savedAt) show('success', t('businessInfo.saved'));
  }, [savedAt]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!complete) return <Screen />;

  const rows = (list) => list.filter(([, value]) => value !== null && value !== undefined && String(value).trim() !== '');
  const sections = [
    {
      title: t('businessInfo.about'),
      icon: 'storefront-outline',
      rows: rows([
        [t('businessName'), name],
        [t('common.category'), business.type ? tv('businessType', business.type) : null],
        [t('businessSetup.businessMode'), business.businessModel ? tv('businessModel', business.businessModel) : null],
        [t('productsServices'), business.products],
        [t('businessSetup.businessGoals'), business.goals],
      ]),
    },
    {
      title: t('businessInfo.whereWhen'),
      icon: 'location-outline',
      rows: rows([
        [t('businessLocation'), business.location],
        [t('operatingHours'), business.hours],
      ]),
    },
    {
      title: t('businessInfo.settings'),
      icon: 'settings-outline',
      rows: rows([
        [t('businessSetup.currency'), business.currency],
        [t('preferredLanguage'), business.language ? languageDisplayName(business.language) : null],
      ]),
    },
    {
      title: t('businessInfo.contact'),
      icon: 'call-outline',
      note: t('businessInfo.contactNote'),
      rows: rows([
        [t('email'), state.user?.identifier],
        [t('phoneNumber'), state.user?.phone],
      ]),
    },
  ];
  // Optional details that are still empty, so the owner knows what could be added.
  const missing = [
    [!business.type, t('common.category')],
    [!business.location, t('businessLocation')],
    [!business.hours, t('operatingHours')],
    [!business.products, t('productsServices')],
  ]
    .filter(([m]) => m)
    .map(([, label]) => label);

  return (
    <Screen onRefresh={reloadData}>
      <BackButton navigation={navigation} />
      <View style={styles.header}>
        <Text style={styles.title}>{t('more.businessInformation')}</Text>
        <Text style={styles.subtitle}>{t('businessInfo.subtitle')}</Text>
      </View>

      <Banner type={banner?.type} text={banner?.text} onClose={clear} />

      {sections.map((s) =>
        s.rows.length ? (
          <View key={s.title} style={styles.card}>
            <View style={styles.cardHead}>
              <Icon name={s.icon} size={16} color={colors.primary} />
              <Text style={styles.cardTitle}>{s.title}</Text>
            </View>
            {s.rows.map(([label, value], i) => (
              <View key={label} style={[styles.row, i === s.rows.length - 1 && styles.rowLast]}>
                <Text style={styles.rowLabel}>{label}</Text>
                <Text style={styles.rowValue} selectable>
                  {value}
                </Text>
              </View>
            ))}
            {s.note ? (
              <Pressable onPress={() => navigation.navigate('Profile')} accessibilityRole="button" style={styles.noteRow}>
                <Text style={styles.note}>{s.note}</Text>
                <Icon name="chevron-forward-outline" size={14} color={colors.primary} />
              </Pressable>
            ) : null}
          </View>
        ) : null
      )}

      {missing.length ? <Text style={styles.missing}>{t('businessInfo.canAdd', { fields: missing.join(', ') })}</Text> : null}

      <Button icon="create-outline" onPress={() => navigation.navigate('BusinessSetup')} style={{ marginTop: 8 }}>
        {t('businessInfo.edit')}
      </Button>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { marginBottom: 16 },
  title: type.pageTitle,
  subtitle: type.pageSubtitle,
  card: { borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.lg, paddingHorizontal: 14, paddingTop: 12, paddingBottom: 4, marginBottom: 14, backgroundColor: colors.white },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  cardTitle: { fontSize: 14.5, fontWeight: '800', color: colors.text },
  row: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
  rowLast: { borderBottomWidth: 0 },
  rowLabel: { fontSize: 12, color: colors.textMuted, fontWeight: '600', marginBottom: 3 },
  rowValue: { fontSize: 14.5, color: colors.text, lineHeight: 20 },
  noteRow: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 8 },
  note: { fontSize: 12, color: colors.primary, fontWeight: '700', flexShrink: 1 },
  missing: { fontSize: 12.5, color: colors.textMuted, lineHeight: 18, marginBottom: 10 },
});
