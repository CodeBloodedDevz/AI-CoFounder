import { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, Image, Pressable, ActivityIndicator, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Screen from '../components/Screen';
import ScreenHeader from '../components/ScreenHeader';
import Icon from '../components/Icon';
import Banner from '../components/Banner';
import Input from '../components/Input';
import ConfirmDialog from '../components/ConfirmDialog';
import SponsoredAdCard from '../components/SponsoredAdCard';
import { Card, Pill, SectionLabel } from '../components/ui';
import { useTranslation } from '../i18n/I18nContext';
import { colors, radius, gradient, shadow } from '../theme';
import { useSponsoredApi, createEventQueue, openExternal, displayPhone, initialsOf } from '../lib/sponsored';

const REPORT_REASONS = ['misleading', 'inappropriate', 'spam', 'impersonation', 'other'];

// "Learn More": the advertised business's page. Everything comes from the server's APPROVED version of the
// page (an owner previewing their own advert sees their latest edits, with a note saying so).
//   route params: { adId }                       - open from an advert
//                 { preview: { ad, business } }  - the owner's preview from the editors (nothing is loaded or counted)
export default function SponsoredBusinessScreen({ navigation, route }) {
  const { t, formatMoney } = useTranslation();
  const api = useSponsoredApi();
  const adId = route.params?.adId;
  const localPreview = route.params?.preview || null;

  const [data, setData] = useState(localPreview ? { ad: localPreview.ad, business: localPreview.business, moreFromBusiness: [], preview: { status: 'draft' } } : null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(!localPreview);
  const [reporting, setReporting] = useState(false);
  const [reason, setReason] = useState(null);
  const [details, setDetails] = useState('');
  const [reportBusy, setReportBusy] = useState(false);
  const [notice, setNotice] = useState(null); // { type, text }

  const queue = useMemo(() => createEventQueue({ send: (events) => api.events(events), delayMs: 800 }), [api]);
  useEffect(() => () => queue.flush(), [queue]);

  const load = useCallback(async () => {
    if (localPreview || !adId) return;
    setLoading(true);
    const r = await api.ad(adId);
    setLoading(false);
    if (!r.ok) return setError(r.error);
    setError('');
    setData(r.data);
    if (!r.data.preview) queue.add(adId, 'detail_view');
  }, [api, adId, localPreview, queue]);
  useEffect(() => { load(); }, [load]);

  const isPreview = Boolean(data?.preview);
  const contact = async (type, url) => {
    if (!isPreview && adId) {
      queue.add(adId, type);
      queue.flush();
    }
    const opened = await openExternal(url);
    if (!opened) setNotice({ type: 'error', text: t('sponsored.business.couldntOpen') });
  };

  const sendReport = async () => {
    if (!reason) return;
    setReportBusy(true);
    const r = await api.report(adId, reason, details.trim());
    setReportBusy(false);
    setReporting(false);
    setReason(null);
    setDetails('');
    setNotice(r.ok ? { type: 'success', text: t('sponsored.report.thanks') } : { type: 'error', text: r.error });
  };

  if (loading || (!data && !error)) {
    return (
      <Screen>
        <ScreenHeader navigation={navigation} title={t('sponsored.business.title')} />
        <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
      </Screen>
    );
  }
  if (!data) {
    return (
      <Screen>
        <ScreenHeader navigation={navigation} title={t('sponsored.business.title')} />
        <Banner type="error" text={error} />
      </Screen>
    );
  }

  const { ad, business: b } = data;
  const contacts = [
    b.whatsappUrl && { key: 'whatsapp_click', icon: 'logo-whatsapp', label: t('sponsored.business.whatsapp'), url: b.whatsappUrl, primary: true },
    b.phone && { key: 'call_click', icon: 'call-outline', label: t('sponsored.business.call'), url: `tel:${b.phone}` },
    b.email && { key: 'email_click', icon: 'mail-outline', label: t('sponsored.business.email'), url: `mailto:${b.email}` },
    b.website && { key: 'website_click', icon: 'globe-outline', label: t('sponsored.business.website'), url: b.website },
  ].filter(Boolean);
  const primary = contacts.find((c) => c.primary) || contacts[0];
  const secondary = contacts.filter((c) => c !== primary);
  const products = (b.offerings || []).filter((o) => o.kind !== 'service');
  const services = (b.offerings || []).filter((o) => o.kind === 'service');
  const rand = (n) => formatMoney(n, { symbol: 'R', decimals: Number.isInteger(Number(n)) ? 0 : 2 });

  return (
    <Screen onRefresh={localPreview ? undefined : load}>
      <ScreenHeader navigation={navigation} title={b.name} subtitle={b.category ? t(`sponsored.category.${b.category}`) : undefined} />

      {isPreview ? (
        <View style={styles.preview}>
          <Icon name="eye-outline" size={16} color={colors.primaryDark} />
          <Text style={styles.previewText}>{t('sponsored.business.previewNote')}</Text>
        </View>
      ) : null}
      {notice ? <Banner type={notice.type} text={notice.text} onClose={() => setNotice(null)} /> : null}

      {/* Identity: the advert picture as a cover, the logo overlapping it */}
      <View style={styles.hero}>
        {ad.imageUrl ? (
          <Image source={{ uri: ad.imageUrl }} style={styles.cover} resizeMode="cover" />
        ) : (
          <LinearGradient colors={gradient.colors} start={gradient.start} end={gradient.end} style={styles.cover} />
        )}
        <View style={styles.logoWrap}>
          {b.logoUrl ? <Image source={{ uri: b.logoUrl }} style={styles.logo} /> : (
            <View style={[styles.logo, styles.logoInitials]}><Text style={styles.logoInitialsText}>{initialsOf(b.name)}</Text></View>
          )}
        </View>
      </View>
      <View style={styles.identity}>
        <Text style={styles.name} accessibilityRole="header">{b.name}</Text>
        {b.location ? (
          <View style={styles.metaRow}>
            <Icon name="location-outline" size={14} color={colors.textSoft} />
            <Text style={styles.meta}>{b.location}</Text>
          </View>
        ) : null}
      </View>

      {/* Contact: the most direct way first, as the page's main button */}
      {primary ? (
        <Pressable onPress={() => contact(primary.key, primary.url)} accessibilityRole="button" accessibilityLabel={primary.label} style={({ pressed }) => [pressed && { opacity: 0.85 }]}>
          <LinearGradient colors={gradient.colors} start={gradient.start} end={gradient.end} style={styles.primaryBtn}>
            <Icon name={primary.icon} size={20} color={colors.white} />
            <Text style={styles.primaryText}>{primary.label}</Text>
          </LinearGradient>
        </Pressable>
      ) : null}
      {secondary.length ? (
        <View style={styles.contactRow}>
          {secondary.map((c) => (
            <Pressable key={c.key} onPress={() => contact(c.key, c.url)} accessibilityRole="button" accessibilityLabel={c.label} style={({ pressed }) => [styles.contactTile, pressed && { backgroundColor: colors.surfaceLow }]}>
              <Icon name={c.icon} size={20} color={colors.primary} />
              <Text style={styles.contactLabel}>{c.label}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      <Card style={styles.offer}>
        <Pill label={t('sponsored.business.offer')} tone="accent" />
        <Text style={styles.offerTitle}>{ad.title}</Text>
        <Text style={styles.body}>{ad.description}</Text>
      </Card>

      {b.about ? (
        <>
          <SectionLabel>{t('sponsored.business.about')}</SectionLabel>
          <Card style={styles.block}><Text style={styles.body}>{b.about}</Text></Card>
        </>
      ) : null}

      {[['services', services], ['products', products]].map(([key, list]) => (list.length ? (
        <View key={key}>
          <SectionLabel>{t(`sponsored.business.${key}`)}</SectionLabel>
          <Card style={[styles.block, { paddingVertical: 4 }]}>
            {list.map((o, i) => (
              <View key={o.name} style={[styles.offeringRow, i > 0 && styles.divider]}>
                <Text style={styles.offeringName}>{o.name}</Text>
                {o.price != null ? <Text style={styles.offeringPrice}>{rand(o.price)}</Text> : null}
              </View>
            ))}
          </Card>
        </View>
      ) : null))}

      {b.hours || b.whatsapp || b.phone || b.email || b.website ? (
        <>
          <SectionLabel>{t('sponsored.business.details')}</SectionLabel>
          <Card style={[styles.block, { paddingVertical: 4 }]}>
            {[
              b.hours && ['time-outline', t('sponsored.business.hours'), b.hours],
              b.whatsapp && ['logo-whatsapp', t('sponsored.business.whatsapp'), displayPhone(b.whatsapp)],
              b.phone && ['call-outline', t('sponsored.business.phone'), displayPhone(b.phone)],
              b.email && ['mail-outline', t('sponsored.business.email'), b.email],
              b.website && ['globe-outline', t('sponsored.business.website'), b.website.replace(/^https?:\/\//, '').replace(/\/$/, '')],
            ].filter(Boolean).map(([icon, label, value], i) => (
              <View key={label} style={[styles.detailRow, i > 0 && styles.divider]}>
                <Icon name={icon} size={17} color={colors.textMuted} />
                <Text style={styles.detailLabel}>{label}</Text>
                <Text style={styles.detailValue} selectable>{value}</Text>
              </View>
            ))}
          </Card>
        </>
      ) : null}

      {b.instagram || b.facebook ? (
        <View style={styles.socialRow}>
          {b.instagram ? <SocialLink icon="logo-instagram" label="Instagram" onPress={() => contact('website_click', b.instagram)} /> : null}
          {b.facebook ? <SocialLink icon="logo-facebook" label="Facebook" onPress={() => contact('website_click', b.facebook)} /> : null}
        </View>
      ) : null}

      {data.moreFromBusiness?.length ? (
        <>
          <SectionLabel>{t('sponsored.business.more')}</SectionLabel>
          {data.moreFromBusiness.map((o) => (
            <SponsoredAdCard key={o.id} ad={o} style={{ marginBottom: 12 }} onLearnMore={() => navigation.push('SponsoredBusiness', { adId: o.id })} />
          ))}
        </>
      ) : null}

      {!isPreview ? (
        <Pressable onPress={() => setReporting(true)} accessibilityRole="button" style={styles.reportLink} hitSlop={8}>
          <Icon name="flag-outline" size={14} color={colors.textMuted} />
          <Text style={styles.reportText}>{t('sponsored.report.link')}</Text>
        </Pressable>
      ) : null}
      <Text style={styles.disclaimer}>{t('sponsored.business.disclaimer')}</Text>

      <ConfirmDialog
        visible={reporting}
        title={t('sponsored.report.title')}
        message={t('sponsored.report.body')}
        confirmLabel={t('sponsored.report.send')}
        tone="danger"
        loading={reportBusy}
        onConfirm={reason ? sendReport : () => {}}
        onCancel={() => { setReporting(false); setReason(null); }}
      >
        <View style={styles.reasons}>
          {REPORT_REASONS.map((r) => (
            <Pressable key={r} onPress={() => setReason(r)} accessibilityRole="radio" accessibilityState={{ checked: reason === r }} style={styles.reasonRow}>
              <Icon name={reason === r ? 'radio-button-on' : 'radio-button-off'} size={18} color={reason === r ? colors.primary : colors.textMuted} />
              <Text style={styles.reasonText}>{t(`sponsored.report.reason.${r}`)}</Text>
            </Pressable>
          ))}
          <Input value={details} onChangeText={setDetails} placeholder={t('sponsored.report.detailsPlaceholder')} multiline maxLength={500} style={{ marginTop: 8, marginBottom: 0 }} />
        </View>
      </ConfirmDialog>
    </Screen>
  );
}

function SocialLink({ icon, label, onPress }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="link" accessibilityLabel={label} style={({ pressed }) => [styles.social, pressed && { opacity: 0.7 }]}>
      <Icon name={icon} size={18} color={colors.primary} />
      <Text style={styles.socialText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  preview: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.primaryLight, borderRadius: radius.md, padding: 12, marginBottom: 14 },
  previewText: { flex: 1, fontSize: 13, color: colors.primaryDark, fontWeight: '600', lineHeight: 18 },
  hero: { marginBottom: 44 },
  cover: { width: '100%', aspectRatio: 16 / 9, borderRadius: radius.xl, backgroundColor: colors.surfaceLow },
  logoWrap: { position: 'absolute', left: 16, bottom: -36, borderRadius: 22, padding: 4, backgroundColor: colors.bg, ...shadow.card },
  logo: { width: 72, height: 72, borderRadius: 18, backgroundColor: colors.surfaceLow },
  logoInitials: { backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center' },
  logoInitialsText: { fontSize: 24, fontWeight: '800', color: colors.primaryDark },
  identity: { marginBottom: 16 },
  name: { fontSize: 24, fontWeight: '800', color: colors.text, letterSpacing: -0.5, lineHeight: 30 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  meta: { fontSize: 13.5, color: colors.textSoft },
  primaryBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: radius.pill, paddingVertical: 15, shadowColor: colors.primary, shadowOpacity: 0.3, shadowOffset: { width: 0, height: 4 }, shadowRadius: 12, elevation: 3 },
  primaryText: { color: colors.white, fontWeight: '700', fontSize: 15.5 },
  contactRow: { flexDirection: 'row', gap: 10, marginTop: 10 },
  contactTile: { flex: 1, alignItems: 'center', gap: 6, paddingVertical: 12, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  contactLabel: { fontSize: 12.5, fontWeight: '700', color: colors.text },
  offer: { marginTop: 22, marginBottom: 22, gap: 8 },
  offerTitle: { fontSize: 18, fontWeight: '800', color: colors.text, letterSpacing: -0.3, lineHeight: 23 },
  body: { fontSize: 14.5, color: colors.textSoft, lineHeight: 22 },
  block: { marginBottom: 20 },
  offeringRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 12 },
  offeringName: { flex: 1, fontSize: 14.5, color: colors.text, fontWeight: '600' },
  offeringPrice: { fontSize: 14.5, color: colors.primaryDark, fontWeight: '700' },
  divider: { borderTopWidth: 1, borderTopColor: colors.surfaceLow },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12 },
  detailLabel: { width: 82, fontSize: 13, color: colors.textMuted },
  detailValue: { flex: 1, fontSize: 14, color: colors.text, fontWeight: '600' },
  socialRow: { flexDirection: 'row', gap: 10, marginBottom: 22 },
  social: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 9, paddingHorizontal: 14, borderRadius: radius.pill, backgroundColor: colors.surfaceLow },
  socialText: { fontSize: 13, fontWeight: '700', color: colors.primary },
  reportLink: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'center', marginTop: 10 },
  reportText: { fontSize: 13, color: colors.textMuted, fontWeight: '600' },
  disclaimer: { fontSize: 11.5, color: colors.textMuted, textAlign: 'center', lineHeight: 16, marginTop: 12 },
  reasons: { marginTop: 14 },
  reasonRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  reasonText: { fontSize: 14, color: colors.text },
});
