import { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Screen from '../components/Screen';
import ConfirmDialog from '../components/ConfirmDialog';
import { useApp } from '../context/AppContext';
import { useTranslation } from '../i18n/I18nContext';
import { colors, radius, gradient, shadow, type } from '../theme';
import { SettingsGroup, SettingsRow, SectionLabel, Pill } from '../components/ui';
import { languageInfo } from '../i18n/languages';
import Constants from 'expo-constants';
import Icon from '../components/Icon';
import { getBusinessName } from '../lib/businessName';

export default function MoreScreen({ navigation }) {
  const { state, logout , reloadData } = useApp();
  const { t, tv, language } = useTranslation();
  const [dialog, setDialog] = useState(null); // 'team' | 'logout'
  const model = state.business?.businessModel || 'Product-based';
  const sub = state.subscription || {};
  const planLabel = t.has(`plans.${sub.planId}.name`) ? t(`plans.${sub.planId}.name`) : sub.plan || 'Free';
  const savedName = getBusinessName(state.business);
  const businessName = savedName || t('more.addBusinessName');
  const initials = (savedName || '')
    .split(' ')
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
  const details = [state.business?.type ? tv('businessType', state.business.type) : null, tv('businessModel', model)].filter(Boolean).join(' · ');

  const upgradeable = !sub.planId || sub.planId === 'free';
  const proBadge = sub.entitlements?.pricingAssistant || state.payments?.limitsEnforced === false ? null : t('more.proBadge');
  // Same destinations as before, grouped the way the designer's More page groups them.
  const setupItems = [
    { icon: 'storefront-outline', title: t('more.businessInformation'), to: 'BusinessInfo' },
    { icon: 'person-outline', title: t('more.profile'), to: 'Profile', iconColor: colors.crimson },
    ...(model !== 'Hybrid' ? [{ icon: 'cube-outline', title: model === 'Service-based' ? t('navServices') : t('stockManagement'), to: 'StockTab' }] : []),
    { icon: 'people-circle-outline', title: t('more.teamMembers'), badge: t('more.comingSoon'), muted: true, onPress: () => setDialog('team') },
  ];
  const insightItems = [
    { icon: 'mic-outline', title: t('voiceNotes'), to: 'VoiceNotes' },
    { icon: 'bar-chart-outline', title: t('businessAnalytics'), to: 'BusinessAnalytics', iconColor: colors.crimson },
    { icon: 'cash-outline', title: t('aiPricingAssistant'), to: 'PricingAssistant', badge: proBadge, badgeTone: 'accent' },
  ];

  const go = (item) => (item.onPress ? item.onPress : () => navigation.navigate(item.to));
  const renderRow = (item) => (
    <SettingsRow
      key={item.title}
      icon={item.icon}
      iconColor={item.iconColor}
      title={item.title}
      badge={item.badge}
      badgeTone={item.badgeTone}
      muted={item.muted}
      onPress={go(item)}
    />
  );

  return (
    <Screen onRefresh={reloadData}>
      <View style={styles.header}>
        <Text style={styles.title}>{t('businessProfile')}</Text>
        <Text style={styles.subtitle}>{t('more.manageYourBusinessInformation')}</Text>
      </View>

      <View style={styles.profileCard}>
        <View style={styles.profileGlow} pointerEvents="none" />
        <View style={styles.profileTop}>
          <LinearGradient colors={gradient.colors} start={gradient.start} end={gradient.end} style={styles.avatarRing}>
            <View style={styles.avatarInner}>
              <Text style={styles.avatarText}>{initials || 'B'}</Text>
            </View>
          </LinearGradient>
          <View style={{ flex: 1, minWidth: 0 }}>
            <View style={styles.nameRow}>
              {savedName ? (
                <Text style={styles.heroName} numberOfLines={2}>{businessName}</Text>
              ) : (
                <Pressable onPress={() => navigation.navigate('BusinessSetup')} accessibilityRole="button" hitSlop={8} style={{ flex: 1 }}>
                  <Text style={styles.heroName}>{businessName} →</Text>
                </Pressable>
              )}
              <Pill label={planLabel} />
            </View>
            {state.user?.identifier ? <Text style={styles.heroMeta} numberOfLines={1}>{state.user.identifier}</Text> : null}
            <View style={styles.tagRow}>
              {details ? (
                <View style={styles.detailsTag}>
                  <Text style={styles.detailsTagText} numberOfLines={1}>{details}</Text>
                </View>
              ) : <View />}
              {upgradeable ? (
                <Pressable onPress={() => navigation.navigate('Subscription')} accessibilityRole="button" hitSlop={8} style={styles.upgradeLink}>
                  <Text style={styles.upgradeText}>{t('more.upgrade')}</Text>
                  <Icon name="arrow-forward" size={13} color={colors.crimson} />
                </Pressable>
              ) : null}
            </View>
          </View>
        </View>
      </View>

      <SectionLabel>{t('more.groupBusiness')}</SectionLabel>
      <SettingsGroup style={styles.group}>{setupItems.map(renderRow)}</SettingsGroup>

      <SectionLabel>{t('more.groupInsights')}</SectionLabel>
      <SettingsGroup style={styles.group}>{insightItems.map(renderRow)}</SettingsGroup>

      {/* Language lives only on the Voice & Language page (one place to change it); this row shows the
          current choice and opens that page. */}
      <SectionLabel>{t('more.groupPreferences')}</SectionLabel>
      <SettingsGroup style={styles.group}>
        <SettingsRow
          icon="mic-circle-outline"
          iconBg={colors.primaryLight}
          title={t('more.voiceLanguage')}
          description={t('more.voiceLanguageHint')}
          trailing={<Text style={styles.langCode}>{languageInfo(language).code.toUpperCase()}</Text>}
          onPress={() => navigation.navigate('VoiceLanguage')}
        />
      </SettingsGroup>

      <SectionLabel>{t('more.groupAdvertising')}</SectionLabel>
      <SettingsGroup style={styles.group}>
        <SettingsRow
          icon="megaphone-outline"
          iconBg={colors.primaryLight}
          title={t('more.myAdverts')}
          description={t('more.myAdvertsHint')}
          badge={sub.entitlements?.adsIncludedPerMonth ? t('more.adIncluded') : null}
          badgeTone="accent"
          onPress={() => navigation.navigate('MyAds')}
        />
        <SettingsRow
          icon="storefront-outline"
          title={t('more.businessPage')}
          description={t('more.businessPageHint')}
          onPress={() => navigation.navigate('BusinessPageEditor')}
        />
      </SettingsGroup>

      <SectionLabel>{t('more.groupBilling')}</SectionLabel>
      <SettingsGroup style={styles.group}>
        <SettingsRow
          icon="card-outline"
          iconBg={colors.crimsonLight}
          iconColor={colors.crimson}
          title={t('more.subscriptionBilling')}
          badge="Paystack"
          description={planLabel}
          onPress={() => navigation.navigate('Subscription')}
        />
      </SettingsGroup>

      <Pressable style={({ pressed }) => [styles.logoutBtn, pressed && { opacity: 0.7 }]} onPress={() => setDialog('logout')} accessibilityRole="button">
        <Icon name="log-out-outline" size={20} color={colors.danger} />
        <Text style={styles.logoutText}>{t('logOut')}</Text>
      </Pressable>
      <Text style={styles.version}>{t('more.version', { version: Constants.expoConfig?.version || '' })}</Text>

      <ConfirmDialog
        visible={dialog === 'team'}
        title={t('more.teamMembers')}
        message={t('more.teamComingSoon')}
        tone="primary"
        confirmLabel={t('common.ok')}
        cancelLabel={null}
        onConfirm={() => setDialog(null)}
        onCancel={() => setDialog(null)}
      />
      <ConfirmDialog
        visible={dialog === 'logout'}
        title={t('more.logOutQuestion')}
        message={t('more.logOutBody')}
        confirmLabel={t('logOut')}
        onConfirm={() => {
          setDialog(null);
          logout();
        }}
        onCancel={() => setDialog(null)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { marginBottom: 16 },
  title: type.pageTitle,
  subtitle: type.pageSubtitle,
  profileCard: { backgroundColor: colors.surface, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.border, padding: 18, marginBottom: 22, overflow: 'hidden', ...shadow.card },
  profileGlow: { position: 'absolute', right: -40, top: -40, width: 130, height: 130, borderRadius: 65, backgroundColor: 'rgba(241,219,255,0.55)' },
  profileTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 14 },
  avatarRing: { width: 56, height: 56, borderRadius: 18, padding: 2, alignItems: 'center', justifyContent: 'center' },
  avatarInner: { width: '100%', height: '100%', borderRadius: 16, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 18, fontWeight: '800', color: colors.primary },
  nameRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  heroName: { flexShrink: 1, color: colors.text, fontSize: 17, fontWeight: '700', letterSpacing: -0.2 },
  heroMeta: { color: colors.textSoft, fontSize: 13, marginTop: 2 },
  tagRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 10 },
  detailsTag: { flexShrink: 1, backgroundColor: 'rgba(241,219,255,0.6)', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  detailsTagText: { fontSize: 11, fontWeight: '700', color: colors.primary },
  upgradeLink: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  upgradeText: { fontSize: 12, fontWeight: '800', color: colors.crimson },
  group: { marginBottom: 20 },
  langCode: { fontSize: 11, fontWeight: '700', color: colors.primary },
  logoutBtn: { flexDirection: 'row', gap: 8, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg + 4, paddingVertical: 14, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  logoutText: { fontWeight: '700', fontSize: 15, color: colors.danger },
  version: { textAlign: 'center', fontSize: 11, fontWeight: '600', color: colors.textMuted, marginTop: 12 },
});
