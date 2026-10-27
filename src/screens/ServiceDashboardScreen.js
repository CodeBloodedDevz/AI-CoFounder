import { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Screen from '../components/Screen';
import BusinessTitle from '../components/BusinessTitle';
import StatCard from '../components/StatCard';
import GradientHeroCard from '../components/GradientHeroCard';
import InsightCard from '../components/InsightCard';
import Button from '../components/Button';
import UpcomingWorkSection from '../components/UpcomingWorkSection';
import FollowUpCard from '../components/FollowUpCard';
import { useApp } from '../context/AppContext';
import {
  summarise,
  serviceBookingCounts,
  recommendBusyHours,
  recommendCustomerRetention,
  recommendBusinessGrowth,
} from '../lib/aiEngine';
import { colors, type } from '../theme';
import { useTranslation } from '../i18n/I18nContext';

export default function ServiceDashboardScreen({ navigation }) {
  const { t, formatMoney } = useTranslation();
  const { state , reloadData } = useApp();
  const { services, transactions, customers, upcomingWork } = state;
  const summary = useMemo(() => summarise(transactions), [transactions]);

  // Customers who have had at least one completed appointment (not just everyone in the list).
  const customersServed = useMemo(
    () => new Set(upcomingWork.filter((w) => w.status === 'Completed' && w.customerId).map((w) => w.customerId)).size,
    [upcomingWork]
  );
  const salesCount = useMemo(() => transactions.filter((tx) => tx.type === 'sale').length, [transactions]);
  const popularServices = useMemo(() => serviceBookingCounts(upcomingWork), [upcomingWork]);
  const completedByService = useMemo(() => {
    const out = {};
    upcomingWork.forEach((w) => {
      if (w.status === 'Completed' && w.service) out[w.service] = (out[w.service] || 0) + 1;
    });
    return out;
  }, [upcomingWork]);
  const busy = useMemo(() => recommendBusyHours(upcomingWork), [upcomingWork]);
  const atRisk = useMemo(
    () => recommendCustomerRetention(customers, upcomingWork, services),
    [customers, upcomingWork, services]
  );
  const growth = useMemo(() => recommendBusinessGrowth(transactions), [transactions]);

  const insight = atRisk.length ? atRisk[0].insight : growth.growthPct !== null ? growth.insight : busy.insight;

  return (
    <Screen onRefresh={reloadData}>
      <View style={{ marginBottom: 16 }}>
        <BusinessTitle navigation={navigation} />
        <Text style={styles.subtitle}>{t('common.trackManageGrow')}</Text>
      </View>

      <GradientHeroCard
        label={t('common.serviceRevenue')}
        value={formatMoney(summary.totalSales, { decimals: 2 })}
        delta={growth.growthPct !== null ? t('common.growthFromLastMonth', { value: `${growth.growthPct >= 0 ? '+' : ''}${growth.growthPct}` }) : undefined}
      />

      <View style={styles.statGrid}>
        <StatCard label={t('serviceDashboard.customersServed')} value={String(customersServed)} tone="plain" />
        <StatCard label={t('serviceDashboard.paymentsRecorded')} value={String(salesCount)} tone="plain" />
      </View>

      <UpcomingWorkSection navigation={navigation} />
      <FollowUpCard navigation={navigation} />

      <Text style={styles.sectionTitle}>{t('common.popularServices')}</Text>
      {popularServices.length ? (
        popularServices.slice(0, 5).map((s) => {
          const svc = services.find((item) => item.name === s.name);
          const completed = completedByService[s.name] || 0;
          // Earned so far = completed bookings × today's price (planned ones haven't been paid yet).
          const revenue = svc ? svc.price * completed : 0;
          return (
            <View style={styles.row} key={s.name}>
              <View style={{ flex: 1, paddingRight: 8 }}>
                <Text style={styles.rowTitle}>{s.name}</Text>
                <Text style={styles.rowMeta}>{t('serviceDashboard.bookingsLine', { count: s.count, done: completed })}</Text>
              </View>
              <Text style={styles.rowValue}>{formatMoney(revenue, { decimals: 0 })}</Text>
            </View>
          );
        })
      ) : (
        <Text style={styles.empty}>{t('serviceDashboard.addServicesAndBookingsTo')}</Text>
      )}

      <InsightCard icon="sparkles-outline" title={t('serviceDashboard.aiCoFounderInsight')}>
        {services.length || upcomingWork.length ? insight : t('serviceDashboard.addFirstService')}
      </InsightCard>

      <Button onPress={() => navigation.navigate('StockTab')}>{t('serviceDashboard.manageServices')}</Button>
      <View style={{ height: 10 }} />
      <Button variant="outline-accent" onPress={() => navigation.navigate('RecordTransaction', { type: 'sale' })}>{t('serviceDashboard.recordPayment')}</Button>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: type.pageTitle,
  subtitle: type.pageSubtitle,
  sectionTitle: { ...type.sectionTitle, marginTop: 20, marginBottom: 10 },
  statGrid: { flexDirection: 'row', gap: 8 },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  rowTitle: { fontSize: 14, fontWeight: '600', color: colors.text },
  rowMeta: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  rowValue: { fontSize: 14, fontWeight: '700', color: colors.success },
  rowStatus: { fontSize: 11.5, fontWeight: '700', color: colors.primary, marginTop: 2 },
  empty: { color: colors.textMuted, fontSize: 13, fontStyle: 'italic' },
});
