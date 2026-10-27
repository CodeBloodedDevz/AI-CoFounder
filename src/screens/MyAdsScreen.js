import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, Image, Pressable, ActivityIndicator, AppState, StyleSheet } from 'react-native';
import Screen from '../components/Screen';
import ScreenHeader from '../components/ScreenHeader';
import Button from '../components/Button';
import Banner from '../components/Banner';
import Icon from '../components/Icon';
import { Card, Pill, SectionLabel } from '../components/ui';
import { useTranslation } from '../i18n/I18nContext';
import { colors, radius } from '../theme';
import {
  useSponsoredApi, statusTone, endsSoon, initialsOf, openCheckout,
  getTrackedAdPayment, clearTrackedAdPayment, trackAdPayment,
} from '../lib/sponsored';

const POLL_MS = 4000;
const POLL_GIVE_UP_MS = 10 * 60_000;

// The business owner's side of the Sponsored page: their business page, what their plan allows, every advert
// with its status and figures, and any payment that is still being confirmed.
export default function MyAdsScreen({ navigation }) {
  const { t, formatDate, formatNumber } = useTranslation();
  const api = useSponsoredApi();
  const [ads, setAds] = useState(null);
  const [eligibility, setEligibility] = useState(null);
  const [profile, setProfile] = useState(null);
  const [error, setError] = useState('');
  const [banner, setBanner] = useState(null);
  const [payment, setPayment] = useState(null); // { reference, adId } while Paystack hasn't confirmed
  const [gaveUp, setGaveUp] = useState(false);
  const [busy, setBusy] = useState(false);
  const waitingSince = useRef(0);
  const mounted = useRef(true);
  useEffect(() => () => { mounted.current = false; }, []);

  const load = useCallback(async () => {
    const [a, p] = await Promise.all([api.myAds(), api.profile()]);
    if (!mounted.current) return;
    if (!a.ok) return setError(a.error);
    setError('');
    setAds(a.data.ads);
    setEligibility(a.data.eligibility);
    if (p.ok) setProfile(p.data.profile);
  }, [api]);

  // Ask the server (which asks Paystack) about the payment that was opened.
  const check = useCallback(async ({ cancel = false } = {}) => {
    const tracked = payment || (await getTrackedAdPayment());
    if (!tracked) return;
    const r = cancel ? await api.cancelPayment(tracked.reference) : await api.verifyPayment(tracked.reference);
    if (!mounted.current) return;
    if (!r.ok) {
      if (r.status === 404) { await clearTrackedAdPayment(); setPayment(null); }
      else setBanner({ type: 'error', text: r.error });
      return;
    }
    const status = r.data.payment.status;
    if (status === 'pending') return;
    await clearTrackedAdPayment();
    setPayment(null);
    setBanner({ type: status === 'success' ? 'success' : 'error', text: t(`sponsored.payment.${status}`, { reference: tracked.reference }) });
    load();
  }, [api, payment, load, t]);

  useEffect(() => navigation.addListener('focus', async () => {
    load();
    const tracked = await getTrackedAdPayment();
    if (tracked && mounted.current) {
      setPayment(tracked);
      setGaveUp(false);
      waitingSince.current = Date.now();
    }
  }), [navigation, load]);

  useEffect(() => {
    if (!payment || gaveUp) return undefined;
    check();
    const timer = setInterval(() => {
      if (Date.now() - waitingSince.current > POLL_GIVE_UP_MS) return setGaveUp(true);
      check();
    }, POLL_MS);
    const sub = AppState.addEventListener('change', (s) => s === 'active' && check());
    return () => { clearInterval(timer); sub?.remove?.(); };
  }, [payment, gaveUp, check]);

  const reopen = async () => {
    setBusy(true);
    const r = await api.checkout(payment.adId);
    setBusy(false);
    if (!r.ok) return setBanner({ type: 'error', text: r.error });
    if (!r.data.checkout) return check(); // it was paid in the meantime
    await trackAdPayment(r.data.checkout.reference, payment.adId);
    setPayment({ reference: r.data.checkout.reference, adId: payment.adId });
    await openCheckout(r.data.checkout.authorizationUrl);
  };

  const pageReady = profile && profile.problems.length === 0;
  const canAdvertise = eligibility && (eligibility.canPurchase || eligibility.includedAvailable > 0);
  const totals = (ads || []).reduce((s, a) => ({ views: s.views + (a.stats?.impressions || 0), clicks: s.clicks + (a.stats?.clicks || 0), contacts: s.contacts + (a.stats?.contacts || 0) }), { views: 0, clicks: 0, contacts: 0 });

  if (!ads && !error) {
    return (
      <Screen>
        <ScreenHeader navigation={navigation} title={t('sponsored.myAds.title')} />
        <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
      </Screen>
    );
  }

  return (
    <Screen onRefresh={load}>
      <ScreenHeader navigation={navigation} title={t('sponsored.myAds.title')} subtitle={t('sponsored.myAds.subtitle')} />
      {error ? <Banner type="error" text={error} /> : null}
      {banner ? <Banner type={banner.type} text={banner.text} onClose={() => setBanner(null)} /> : null}

      {payment ? (
        <Card style={styles.payCard}>
          <View style={styles.payHead}>
            {gaveUp ? <Icon name="time-outline" size={20} color={colors.warning} /> : <ActivityIndicator color={colors.primary} />}
            <Text style={styles.payTitle}>{gaveUp ? t('sponsored.payment.slow') : t('sponsored.payment.waiting')}</Text>
          </View>
          <Text style={styles.small}>{t('sponsored.payment.waitingBody')}</Text>
          <View style={styles.row}>
            <Button size="sm" fullWidth={false} variant="outline-accent" loading={busy} onPress={reopen}>{t('sponsored.payment.reopen')}</Button>
            <Button size="sm" fullWidth={false} variant="outline" onPress={gaveUp ? () => { setGaveUp(false); waitingSince.current = Date.now(); } : () => check({ cancel: true })}>
              {gaveUp ? t('sponsored.payment.checkAgain') : t('sponsored.payment.dontPay')}
            </Button>
          </View>
        </Card>
      ) : null}

      {/* What the plan allows */}
      {eligibility ? <PlanCard eligibility={eligibility} navigation={navigation} t={t} formatDate={formatDate} /> : null}

      {/* The business page "Learn More" opens */}
      <SectionLabel>{t('sponsored.myAds.businessPage')}</SectionLabel>
      <Card style={styles.block}>
        <View style={styles.pageRow}>
          {profile?.current?.logoUrl ? <Image source={{ uri: profile.current.logoUrl }} style={styles.pageLogo} /> : (
            <View style={[styles.pageLogo, styles.pageLogoEmpty]}><Text style={styles.pageLogoText}>{initialsOf(profile?.current?.displayName)}</Text></View>
          )}
          <View style={{ flex: 1 }}>
            <Text style={styles.pageName} numberOfLines={1}>{profile?.current?.displayName || t('sponsored.myAds.pageNotSetUp')}</Text>
            <PageStatus profile={profile} t={t} />
          </View>
        </View>
        {profile?.reviewNote ? <Text style={styles.note}>{t('sponsored.myAds.pageRejected', { note: profile.reviewNote })}</Text> : null}
        <View style={[styles.row, { marginTop: 12 }]}>
          <Button size="sm" fullWidth={false} variant={pageReady ? 'outline' : 'primary'} icon="create-outline" onPress={() => navigation.navigate('BusinessPageEditor')}>
            {pageReady ? t('sponsored.myAds.editPage') : t('sponsored.myAds.setUpPage')}
          </Button>
        </View>
      </Card>

      {/* Adverts */}
      <View style={styles.listHead}>
        <SectionLabel style={{ marginBottom: 0 }}>{t('sponsored.myAds.adverts')}</SectionLabel>
      </View>
      {ads?.length ? (
        <View style={styles.totals}>
          <Total label={t('sponsored.stats.views')} value={formatNumber(totals.views)} />
          <Total label={t('sponsored.stats.clicks')} value={formatNumber(totals.clicks)} />
          <Total label={t('sponsored.stats.contacts')} value={formatNumber(totals.contacts)} />
        </View>
      ) : null}

      {canAdvertise ? (
        <Button icon="add" disabled={!pageReady} onPress={() => navigation.navigate('AdEditor')} style={{ marginBottom: 6 }}>{t('sponsored.myAds.create')}</Button>
      ) : null}
      {canAdvertise && !pageReady ? <Text style={[styles.small, { textAlign: 'center', marginBottom: 12 }]}>{t('sponsored.myAds.pageFirst')}</Text> : <View style={{ height: 12 }} />}

      {ads?.length === 0 ? (
        <View style={styles.steps}>
          <Step n={1} done={pageReady} title={t('sponsored.myAds.step1')} body={t('sponsored.myAds.step1Body')} />
          <Step n={2} done={false} title={t('sponsored.myAds.step2')} body={t('sponsored.myAds.step2Body')} />
          <Step n={3} done={false} title={t('sponsored.myAds.step3')} body={t('sponsored.myAds.step3Body')} last />
        </View>
      ) : null}

      {(ads || []).map((ad) => (
        <Pressable key={ad.id} onPress={() => navigation.navigate('AdDetail', { adId: ad.id })} accessibilityRole="button" accessibilityLabel={ad.title} style={({ pressed }) => [styles.adCard, pressed && { opacity: 0.9 }]}>
          <View style={styles.adTop}>
            {ad.imageUrl ? <Image source={{ uri: ad.imageUrl }} style={styles.thumb} /> : <View style={[styles.thumb, styles.thumbEmpty]}><Icon name="megaphone-outline" size={20} color={colors.primary} /></View>}
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.adTitle} numberOfLines={2}>{ad.title}</Text>
              <View style={styles.adMeta}>
                <Pill label={t(`sponsored.status.${ad.status}`)} tone={statusTone(ad.status)} />
                {ad.revision?.status === 'pending' ? <Pill label={t('sponsored.myAds.changesWaiting')} tone="accent" /> : null}
              </View>
            </View>
            <Icon name="chevron-forward" size={18} color={colors.textMuted} />
          </View>
          <Text style={styles.adLine}>
            {t(`sponsored.package.${ad.packageId}`)} · {ad.status === 'active' ? t('sponsored.myAds.daysLeft', { count: ad.daysLeft }) : ad.status === 'scheduled' ? t('sponsored.myAds.startsOn', { date: formatDate(ad.startsAt) }) : ad.endsAt && ad.status === 'expired' ? t('sponsored.myAds.endedOn', { date: formatDate(ad.endsAt) }) : t('sponsored.myAds.days', { count: ad.durationDays })}
          </Text>
          {ad.status === 'rejected' && ad.reviewNote ? <Text style={styles.note}>{ad.reviewNote}</Text> : null}
          {endsSoon(ad) ? (
            <View style={styles.soon}>
              <Icon name="alarm-outline" size={15} color={colors.warning} />
              <Text style={styles.soonText}>{t('sponsored.myAds.endsSoon', { count: ad.daysLeft })}</Text>
            </View>
          ) : null}
          {['active', 'expired', 'suspended'].includes(ad.status) ? (
            <View style={styles.adStats}>
              <Text style={styles.adStat}>{t('sponsored.myAds.statLine', { views: formatNumber(ad.stats.impressions), clicks: formatNumber(ad.stats.clicks), contacts: formatNumber(ad.stats.contacts) })}</Text>
            </View>
          ) : null}
        </Pressable>
      ))}
    </Screen>
  );
}

function PlanCard({ eligibility: e, navigation, t, formatDate }) {
  if (!e.canPurchase && e.includedPerMonth === 0) {
    return (
      <Card tone="low" style={styles.block}>
        <Text style={styles.planTitle}>{t('sponsored.plan.freeTitle')}</Text>
        <Text style={styles.small}>{t('sponsored.plan.freeBody')}</Text>
        <Button size="sm" fullWidth={false} icon="diamond-outline" onPress={() => navigation.navigate('Subscription')} style={{ marginTop: 12 }}>{t('sponsored.plan.seePlans')}</Button>
      </Card>
    );
  }
  if (e.includedPerMonth > 0) {
    return (
      <Card tone="low" style={styles.block}>
        <View style={styles.row}>
          <Icon name="gift-outline" size={18} color={colors.primary} />
          <Text style={styles.planTitle}>{e.includedAvailable > 0 ? t('sponsored.plan.includedAvailable') : t('sponsored.plan.includedUsed')}</Text>
        </View>
        <Text style={styles.small}>{e.includedAvailable > 0 ? t('sponsored.plan.includedAvailableBody') : t('sponsored.plan.includedUsedBody', { date: formatDate(e.includedRenewsOn) })}</Text>
      </Card>
    );
  }
  return (
    <Card tone="low" style={styles.block}>
      <Text style={styles.planTitle}>{t('sponsored.plan.proTitle')}</Text>
      <Text style={styles.small}>{t('sponsored.plan.proBody')}</Text>
    </Card>
  );
}

function PageStatus({ profile, t }) {
  if (!profile?.current) return <Text style={styles.small}>{t('sponsored.myAds.pageMissing')}</Text>;
  if (profile.problems.length) return <Text style={[styles.small, { color: colors.warning }]}>{t('sponsored.myAds.pageIncomplete')}</Text>;
  if (profile.reviewStatus === 'pending') return <Pill label={t('sponsored.myAds.pageInReview')} tone="accent" style={{ marginTop: 4 }} />;
  if (profile.reviewStatus === 'rejected') return <Pill label={t('sponsored.myAds.pageChangesRejected')} tone="danger" style={{ marginTop: 4 }} />;
  if (profile.published && !profile.hasChanges) return <Pill label={t('sponsored.myAds.pageLive')} tone="success" style={{ marginTop: 4 }} />;
  if (profile.published) return <Text style={styles.small}>{t('sponsored.myAds.pageChangesSaved')}</Text>;
  return <Text style={styles.small}>{t('sponsored.myAds.pageReady')}</Text>;
}

function Total({ label, value }) {
  return (
    <View style={styles.total}>
      <Text style={styles.totalValue}>{value}</Text>
      <Text style={styles.totalLabel}>{label}</Text>
    </View>
  );
}

function Step({ n, done, title, body, last }) {
  return (
    <View style={styles.step}>
      <View style={styles.stepRail}>
        <View style={[styles.stepDot, done && styles.stepDotDone]}>
          {done ? <Icon name="checkmark" size={14} color={colors.white} /> : <Text style={styles.stepNum}>{n}</Text>}
        </View>
        {!last ? <View style={styles.stepLine} /> : null}
      </View>
      <View style={{ flex: 1, paddingBottom: last ? 0 : 16 }}>
        <Text style={styles.stepTitle}>{title}</Text>
        <Text style={styles.small}>{body}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  block: { marginBottom: 20 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  small: { fontSize: 13, color: colors.textSoft, lineHeight: 19 },
  note: { fontSize: 13, color: colors.danger, lineHeight: 19, marginTop: 8 },
  payCard: { marginBottom: 18, gap: 10, borderColor: colors.primaryLight },
  payHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  payTitle: { flex: 1, fontSize: 15, fontWeight: '700', color: colors.text },
  planTitle: { fontSize: 15, fontWeight: '700', color: colors.text, marginBottom: 4 },
  pageRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  pageLogo: { width: 48, height: 48, borderRadius: 14, backgroundColor: colors.surfaceLow },
  pageLogoEmpty: { backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center' },
  pageLogoText: { fontSize: 16, fontWeight: '800', color: colors.primaryDark },
  pageName: { fontSize: 15.5, fontWeight: '700', color: colors.text, marginBottom: 2 },
  listHead: { marginBottom: 10 },
  totals: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  total: { flex: 1, backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, paddingVertical: 12, alignItems: 'center' },
  totalValue: { fontSize: 20, fontWeight: '800', color: colors.text, letterSpacing: -0.4 },
  totalLabel: { fontSize: 11.5, fontWeight: '600', color: colors.textMuted, marginTop: 2 },
  steps: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: 16, marginBottom: 16 },
  step: { flexDirection: 'row', gap: 12 },
  stepRail: { alignItems: 'center' },
  stepDot: { width: 26, height: 26, borderRadius: 13, borderWidth: 1.5, borderColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  stepDotDone: { backgroundColor: colors.success, borderColor: colors.success },
  stepNum: { fontSize: 12, fontWeight: '800', color: colors.primary },
  stepLine: { flex: 1, width: 1.5, backgroundColor: colors.border, marginTop: 4 },
  stepTitle: { fontSize: 14.5, fontWeight: '700', color: colors.text, marginBottom: 2, marginTop: 3 },
  adCard: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: 14, marginBottom: 12 },
  adTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  thumb: { width: 64, height: 48, borderRadius: 10, backgroundColor: colors.surfaceLow },
  thumbEmpty: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primaryLight },
  adTitle: { fontSize: 15, fontWeight: '700', color: colors.text, lineHeight: 20 },
  adMeta: { flexDirection: 'row', gap: 6, marginTop: 6, flexWrap: 'wrap' },
  adLine: { fontSize: 12.5, color: colors.textSoft, marginTop: 10 },
  soon: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.warningBg, borderRadius: radius.sm, paddingVertical: 7, paddingHorizontal: 10, marginTop: 10 },
  soonText: { flex: 1, fontSize: 12.5, fontWeight: '600', color: colors.warning },
  adStats: { borderTopWidth: 1, borderTopColor: colors.surfaceLow, marginTop: 10, paddingTop: 10 },
  adStat: { fontSize: 12.5, color: colors.textSoft, fontWeight: '600' },
});
