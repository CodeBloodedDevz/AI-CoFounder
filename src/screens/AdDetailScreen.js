import { useCallback, useEffect, useState } from 'react';
import { View, Text, Image, ActivityIndicator, StyleSheet } from 'react-native';
import Screen from '../components/Screen';
import ScreenHeader from '../components/ScreenHeader';
import Button from '../components/Button';
import Banner from '../components/Banner';
import Icon from '../components/Icon';
import ConfirmDialog from '../components/ConfirmDialog';
import { Card, Pill, SectionLabel } from '../components/ui';
import { useTranslation } from '../i18n/I18nContext';
import { colors, radius } from '../theme';
import { useSponsoredApi, statusTone, endsSoon, openCheckout, trackAdPayment } from '../lib/sponsored';

// One of the owner's adverts: where it is in its life, how it is doing, and what can be done with it.
export default function AdDetailScreen({ navigation, route }) {
  const { t, formatDate, formatDateTime, formatMoney, formatNumber } = useTranslation();
  const api = useSponsoredApi();
  const adId = route.params?.adId;
  const [ad, setAd] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmWithdraw, setConfirmWithdraw] = useState(false);
  const [banner, setBanner] = useState(null);

  const load = useCallback(async () => {
    const r = await api.myAd(adId);
    if (!r.ok) return setError(r.error);
    setError('');
    setAd(r.data);
  }, [api, adId]);
  useEffect(() => navigation.addListener('focus', load), [navigation, load]);
  useEffect(() => { load(); }, [load]);

  const pay = async () => {
    setBusy(true);
    const r = await api.checkout(adId);
    setBusy(false);
    if (!r.ok) return setBanner({ type: 'error', text: r.error });
    if (!r.data.checkout) return load(); // already paid (or covered by Premium)
    await trackAdPayment(r.data.checkout.reference, adId);
    navigation.navigate('MyAds');
    await openCheckout(r.data.checkout.authorizationUrl);
  };

  const withdraw = async () => {
    setBusy(true);
    const r = await api.withdraw(adId);
    setBusy(false);
    setConfirmWithdraw(false);
    if (!r.ok) return setBanner({ type: 'error', text: r.error });
    setBanner({ type: 'success', text: r.data.refundRequested ? t('sponsored.detail.withdrawnRefund') : t('sponsored.detail.withdrawn') });
    load();
  };

  if (!ad) {
    return (
      <Screen>
        <ScreenHeader navigation={navigation} title={t('sponsored.detail.title')} />
        {error ? <Banner type="error" text={error} /> : <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />}
      </Screen>
    );
  }

  const s = ad.stats || {};
  const rand = (n) => formatMoney(n, { symbol: 'R', decimals: Number.isInteger(Number(n)) ? 0 : 2 });
  const showStats = ['active', 'expired', 'suspended', 'removed'].includes(ad.status) || s.impressions > 0;
  const maxDay = Math.max(1, ...(ad.series || []).map((d) => d.impressions));

  return (
    <Screen onRefresh={load}>
      <ScreenHeader navigation={navigation} title={ad.title} />
      {banner ? <Banner type={banner.type} text={banner.text} onClose={() => setBanner(null)} /> : null}

      <View style={styles.statusRow}>
        <Pill label={t(`sponsored.status.${ad.status}`)} tone={statusTone(ad.status)} />
        {ad.revision?.status === 'pending' ? <Pill label={t('sponsored.myAds.changesWaiting')} tone="accent" /> : null}
      </View>
      <Text style={styles.explain}>{t(`sponsored.detail.explain.${ad.status}`, { date: formatDate(ad.status === 'scheduled' ? ad.startsAt : ad.endsAt), count: ad.daysLeft ?? 0 })}</Text>

      {ad.reviewNote ? (
        <Card tone="danger" style={styles.block}>
          <Text style={styles.noteTitle}>{t('sponsored.detail.adminNote')}</Text>
          <Text style={styles.small}>{ad.reviewNote}</Text>
        </Card>
      ) : null}
      {ad.revision?.status === 'rejected' && ad.revision.note ? (
        <Card tone="danger" style={styles.block}>
          <Text style={styles.noteTitle}>{t('sponsored.detail.changesRejected')}</Text>
          <Text style={styles.small}>{ad.revision.note}</Text>
        </Card>
      ) : null}
      {endsSoon(ad) ? (
        <Card tone="low" style={styles.block}>
          <View style={styles.inline}>
            <Icon name="alarm-outline" size={18} color={colors.warning} />
            <Text style={[styles.noteTitle, { color: colors.warning, marginBottom: 0 }]}>{t('sponsored.myAds.endsSoon', { count: ad.daysLeft })}</Text>
          </View>
          <Text style={[styles.small, { marginTop: 4 }]}>{t('sponsored.detail.renewHint')}</Text>
        </Card>
      ) : null}

      {/* What can be done now */}
      <View style={styles.actions}>
        {ad.status === 'awaiting_payment' ? <Button icon="lock-closed" loading={busy} onPress={pay}>{t('sponsored.detail.pay', { amount: rand(ad.price) })}</Button> : null}
        {ad.canRenew ? <Button icon="refresh" variant={ad.status === 'expired' || endsSoon(ad) ? 'primary' : 'outline'} onPress={() => navigation.navigate('AdEditor', { renewFrom: ad.id })}>{t('sponsored.detail.renew')}</Button> : null}
        <View style={styles.actionRow}>
          <Button size="sm" variant="outline" icon="eye-outline" fullWidth={false} style={{ flex: 1 }} onPress={() => navigation.navigate('SponsoredBusiness', { adId: ad.id })}>{t('sponsored.detail.preview')}</Button>
          {ad.canEdit ? <Button size="sm" variant="outline" icon="create-outline" fullWidth={false} style={{ flex: 1 }} onPress={() => navigation.navigate('AdEditor', { adId: ad.id })}>{t('common.edit')}</Button> : null}
        </View>
        {ad.canWithdraw ? <Button size="sm" variant="outline-danger" onPress={() => setConfirmWithdraw(true)}>{t('sponsored.detail.withdraw')}</Button> : null}
      </View>

      {showStats ? (
        <>
          <SectionLabel>{t('sponsored.detail.performance')}</SectionLabel>
          <View style={styles.tiles}>
            <Tile label={t('sponsored.stats.views')} value={formatNumber(s.impressions)} hint={t('sponsored.stats.viewsHint')} />
            <Tile label={t('sponsored.stats.clicks')} value={formatNumber(s.clicks)} hint={t('sponsored.stats.clicksHint')} />
            <Tile label={t('sponsored.stats.pageViews')} value={formatNumber(s.pageViews)} hint={t('sponsored.stats.pageViewsHint')} />
            <Tile label={t('sponsored.stats.clickRate')} value={s.clickRate == null ? '—' : `${formatNumber(s.clickRate)}%`} hint={t('sponsored.stats.clickRateHint')} />
          </View>
          <Card style={styles.block}>
            <Text style={styles.cardTitle}>{t('sponsored.stats.contactsTitle')}</Text>
            {[
              ['logo-whatsapp', t('sponsored.business.whatsapp'), s.whatsappClicks],
              ['call-outline', t('sponsored.business.call'), s.callClicks],
              ['mail-outline', t('sponsored.business.email'), s.emailClicks],
              ['globe-outline', t('sponsored.business.website'), s.websiteClicks],
            ].map(([icon, label, n]) => (
              <View key={label} style={styles.contactRow}>
                <Icon name={icon} size={16} color={colors.textMuted} />
                <Text style={styles.contactLabel}>{label}</Text>
                <Text style={styles.contactValue}>{formatNumber(n || 0)}</Text>
              </View>
            ))}
          </Card>
          {ad.series?.some((d) => d.impressions || d.clicks) ? (
            <Card style={styles.block}>
              <Text style={styles.cardTitle}>{t('sponsored.stats.last30')}</Text>
              <View style={styles.chart} accessibilityLabel={t('sponsored.stats.chartA11y')}>
                {ad.series.map((d) => (
                  <View key={d.day} style={styles.barSlot}>
                    <View style={[styles.bar, { height: `${(d.impressions / maxDay) * 100}%` }]} />
                    <View style={[styles.barClicks, { height: `${(d.clicks / maxDay) * 100}%` }]} />
                  </View>
                ))}
              </View>
              <View style={styles.chartAxis}>
                <Text style={styles.axis}>{formatDate(ad.series[0].day, { day: 'numeric', month: 'short' })}</Text>
                <Text style={styles.axis}>{formatDate(ad.series[ad.series.length - 1].day, { day: 'numeric', month: 'short' })}</Text>
              </View>
              <View style={styles.legend}>
                <View style={[styles.dot, { backgroundColor: colors.primaryLight }]} /><Text style={styles.axis}>{t('sponsored.stats.views')}</Text>
                <View style={[styles.dot, { backgroundColor: colors.primary }]} /><Text style={styles.axis}>{t('sponsored.stats.clicks')}</Text>
              </View>
            </Card>
          ) : null}
          <Text style={styles.footnote}>{t('sponsored.stats.footnote')}</Text>
        </>
      ) : null}

      <SectionLabel>{t('sponsored.detail.campaign')}</SectionLabel>
      <Card style={[styles.block, { paddingVertical: 4 }]}>
        {ad.imageUrl ? <Image source={{ uri: ad.imageUrl }} style={styles.image} /> : null}
        {[
          [t('sponsored.detail.package'), `${t.has(`sponsored.package.${ad.packageId}`) ? t(`sponsored.package.${ad.packageId}`) : ad.packageId} · ${t(`sponsored.placement.${ad.placement}`)}`],
          [t('sponsored.detail.length'), t('sponsored.editor.days', { count: ad.durationDays })],
          [t('sponsored.detail.category'), t(`sponsored.category.${ad.category}`)],
          ad.startsAt && [t('sponsored.detail.runs'), `${formatDate(ad.startsAt)} – ${formatDate(ad.endsAt)}`],
          [t('sponsored.detail.paid'), ad.funding === 'included' ? t('sponsored.editor.included') : ad.payment?.status === 'success' ? rand(ad.price) : t('sponsored.detail.notPaid')],
          ad.payment?.refundStatus && ad.payment.refundStatus !== 'none' && [t('sponsored.detail.refund'), t(`sponsored.detail.refund_${ad.payment.refundStatus}`)],
          ad.payment?.reference && ad.funding === 'paid' && [t('sponsored.detail.reference'), ad.payment.reference],
        ].filter(Boolean).map(([label, value], i) => (
          <View key={label} style={[styles.infoRow, i > 0 && styles.divider]}>
            <Text style={styles.infoLabel}>{label}</Text>
            <Text style={styles.infoValue} selectable>{value}</Text>
          </View>
        ))}
      </Card>

      {ad.history?.length ? (
        <>
          <SectionLabel>{t('sponsored.detail.history')}</SectionLabel>
          <View style={styles.history}>
            {ad.history.map((h, i) => (
              <View key={i} style={styles.historyItem}>
                <View style={styles.historyDot} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.historyWhat}>{t.has(`sponsored.history.${h.action}`) ? t(`sponsored.history.${h.action}`) : h.action}</Text>
                  <Text style={styles.historyWhen}>{formatDateTime(h.at)}</Text>
                  {h.note && !['submitted', 'created', 'renewal_created'].includes(h.action) ? <Text style={styles.small}>{h.note}</Text> : null}
                </View>
              </View>
            ))}
          </View>
        </>
      ) : null}

      <ConfirmDialog
        visible={confirmWithdraw}
        title={t('sponsored.detail.withdrawQuestion')}
        message={ad.funding === 'included' ? t('sponsored.detail.withdrawIncludedBody') : ad.status === 'awaiting_payment' ? t('sponsored.detail.withdrawUnpaidBody') : t('sponsored.detail.withdrawPaidBody')}
        confirmLabel={t('sponsored.detail.withdraw')}
        loading={busy}
        onConfirm={withdraw}
        onCancel={() => setConfirmWithdraw(false)}
      />
    </Screen>
  );
}

function Tile({ label, value, hint }) {
  return (
    <View style={styles.tile} accessibilityLabel={`${label}: ${value}. ${hint}`}>
      <Text style={styles.tileValue}>{value}</Text>
      <Text style={styles.tileLabel}>{label}</Text>
      <Text style={styles.tileHint}>{hint}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  block: { marginBottom: 20 },
  small: { fontSize: 13, color: colors.textSoft, lineHeight: 19 },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  statusRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginTop: -6, marginBottom: 8 },
  explain: { fontSize: 13.5, color: colors.textSoft, lineHeight: 20, marginBottom: 16 },
  noteTitle: { fontSize: 14.5, fontWeight: '700', color: colors.danger, marginBottom: 4 },
  actions: { gap: 10, marginBottom: 24 },
  actionRow: { flexDirection: 'row', gap: 10 },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 12 },
  tile: { flexBasis: '47%', flexGrow: 1, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: 14 },
  tileValue: { fontSize: 24, fontWeight: '800', color: colors.text, letterSpacing: -0.6 },
  tileLabel: { fontSize: 13, fontWeight: '700', color: colors.text, marginTop: 2 },
  tileHint: { fontSize: 11.5, color: colors.textMuted, marginTop: 2, lineHeight: 15 },
  cardTitle: { fontSize: 14.5, fontWeight: '700', color: colors.text, marginBottom: 10 },
  contactRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
  contactLabel: { flex: 1, fontSize: 13.5, color: colors.textSoft },
  contactValue: { fontSize: 14, fontWeight: '700', color: colors.text },
  chart: { flexDirection: 'row', alignItems: 'flex-end', height: 96, gap: 2 },
  barSlot: { flex: 1, height: '100%', justifyContent: 'flex-end' },
  bar: { width: '100%', backgroundColor: colors.primaryLight, borderTopLeftRadius: 2, borderTopRightRadius: 2 },
  barClicks: { position: 'absolute', bottom: 0, left: '20%', right: '20%', backgroundColor: colors.primary, borderTopLeftRadius: 2, borderTopRightRadius: 2 },
  chartAxis: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  axis: { fontSize: 11, color: colors.textMuted },
  legend: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 },
  dot: { width: 10, height: 10, borderRadius: 3, marginLeft: 6 },
  footnote: { fontSize: 11.5, color: colors.textMuted, lineHeight: 16, marginTop: -8, marginBottom: 22 },
  image: { width: '100%', aspectRatio: 16 / 9, borderRadius: radius.md, marginVertical: 10, backgroundColor: colors.surfaceLow },
  infoRow: { flexDirection: 'row', gap: 12, paddingVertical: 11 },
  divider: { borderTopWidth: 1, borderTopColor: colors.surfaceLow },
  infoLabel: { width: 96, fontSize: 13, color: colors.textMuted },
  infoValue: { flex: 1, fontSize: 13.5, color: colors.text, fontWeight: '600' },
  history: { borderLeftWidth: 1.5, borderLeftColor: colors.border, marginLeft: 6, paddingLeft: 16, gap: 14, marginBottom: 10 },
  historyItem: { flexDirection: 'row' },
  historyDot: { position: 'absolute', left: -21.5, top: 4, width: 9, height: 9, borderRadius: 5, backgroundColor: colors.primary },
  historyWhat: { fontSize: 13.5, fontWeight: '700', color: colors.text },
  historyWhen: { fontSize: 12, color: colors.textMuted, marginTop: 1 },
});
