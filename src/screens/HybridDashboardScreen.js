import { useMemo } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
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
  recommendCustomerRetention,
  recommendBusinessGrowth,
  restockRecommendation,
  stockNeedingAttention,
} from '../lib/aiEngine';
import { addDays, todayISO } from '../lib/schedule';
import { splitBookings } from '../lib/bookings';
import { colors, type } from '../theme';
import { useTranslation } from '../i18n/I18nContext';

const sameName = (a, b) => Boolean(a && b) && String(a).trim().toLowerCase() === String(b).trim().toLowerCase();

export default function HybridDashboardScreen({ navigation }) {
  const { t, formatMoney } = useTranslation();
  const { state , reloadData } = useApp();
  const { products, services, customers, upcomingWork, transactions } = state;
  const summary = useMemo(() => summarise(transactions), [transactions]);
  const lowStock = useMemo(() => stockNeedingAttention(products), [products]); // low OR out of stock
  // Different customers with a completed appointment this calendar month.
  const servedThisMonth = useMemo(() => {
    const monthStart = `${todayISO().slice(0, 7)}-01`;
    return new Set(upcomingWork.filter((w) => w.status === 'Completed' && w.customerId && w.date >= monthStart && w.date <= todayISO()).map((w) => w.customerId)).size;
  }, [upcomingWork]);

  const productRevenue = useMemo(
    () =>
      transactions
        .filter((tx) => tx.type === 'sale' && products.some((p) => sameName(p.name, tx.product) || sameName(p.name, tx.title)))
        .reduce((sum, tx) => sum + Number(tx.amount || 0), 0),
    [transactions, products]
  );
  const serviceRevenue = useMemo(
    () =>
      transactions
        .filter((tx) => tx.type === 'sale' && services.some((s) => sameName(s.name, tx.product) || sameName(s.name, tx.title)))
        .reduce((sum, tx) => sum + Number(tx.amount || 0), 0),
    [transactions, services]
  );

  // Bookings still ahead in the next 7 days (what the row below says it counts).
  const weekBookings = useMemo(() => {
    const limit = addDays(todayISO(), 7);
    // Same definition of "upcoming" as Manage bookings (bookings whose time is over are not counted).
    return splitBookings(upcomingWork, new Date(), services).upcoming.filter((w) => w.date <= limit).length;
  }, [upcomingWork, services]);

  const atRisk = useMemo(
    () => recommendCustomerRetention(customers, upcomingWork, services),
    [customers, upcomingWork, services]
  );
  const growth = useMemo(() => recommendBusinessGrowth(transactions), [transactions]);
  const insight = atRisk.length
    ? atRisk[0].insight
    : growth.growthPct !== null
    ? growth.insight
    : products.length
    ? restockRecommendation(products)
    : t('hybridDashboard.addProductsAndServices');

  return (
    <Screen onRefresh={reloadData}>
      <View style={{ marginBottom: 16 }}>
        <BusinessTitle navigation={navigation} />
        <Text style={styles.subtitle}>{t('common.trackManageGrow')}</Text>
      </View>

      <GradientHeroCard
        label={t('common.totalBalance')}
        value={formatMoney(summary.profit, { decimals: 2 })}
        delta={growth.growthPct !== null ? t('common.growthFromLastMonth', { value: `${growth.growthPct >= 0 ? '+' : ''}${growth.growthPct}` }) : undefined}
      />

      <View style={styles.statGrid}>
        <StatCard label={t('hybridDashboard.productRevenue')} value={formatMoney(productRevenue, { decimals: 0 })} tone="plain" />
        <StatCard label={t('common.serviceRevenue')} value={formatMoney(serviceRevenue, { decimals: 0 })} tone="plain" />
      </View>

      <UpcomingWorkSection navigation={navigation} />
      <FollowUpCard navigation={navigation} />

      <Text style={styles.sectionTitle}>{t('hybridDashboard.businessSnapshot')}</Text>
      <View style={styles.row}>
        <View>
          <Text style={styles.rowTitle}>{t('hybridDashboard.customersServed')}</Text>
          <Text style={styles.rowMeta}>{t('hybridDashboard.thisMonth')}</Text>
        </View>
        <Text style={[styles.rowValue, { color: colors.primary }]}>{servedThisMonth}</Text>
      </View>
      <Pressable style={styles.row} onPress={() => navigation.navigate('StockTab')} accessibilityRole="button">
        <View>
          <Text style={styles.rowTitle}>{t('hybridDashboard.lowStockItems')}</Text>
          <Text style={styles.rowMeta}>{t('hybridDashboard.needsAttention')}</Text>
        </View>
        <Text style={[styles.rowValue, { color: lowStock.length ? colors.danger : colors.success }]}>{lowStock.length}</Text>
      </Pressable>
      <View style={styles.row}>
        <View>
          <Text style={styles.rowTitle}>{t('hybridDashboard.serviceBookings')}</Text>
          <Text style={styles.rowMeta}>{t('hybridDashboard.thisWeek')}</Text>
        </View>
        <Text style={[styles.rowValue, { color: colors.success }]}>{weekBookings}</Text>
      </View>

      <InsightCard icon="sparkles-outline" title={t('aiInsight')}>
        {products.length || services.length ? insight : t('hybridDashboard.addProductsAndServices')}
      </InsightCard>

      <View style={styles.actions}>
        <Button onPress={() => navigation.navigate('StockTab')}>{t('hybridDashboard.manageStockServices')}</Button>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: type.pageTitle,
  subtitle: type.pageSubtitle,
  sectionTitle: { ...type.sectionTitle, marginTop: 20, marginBottom: 4 },
  statGrid: { flexDirection: 'row', gap: 8, marginBottom: 4 },
  actions: {},
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  rowTitle: { fontSize: 14, fontWeight: '600', color: colors.text },
  rowMeta: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  rowValue: { fontSize: 16, fontWeight: '800' },
  empty: { color: colors.textMuted, fontSize: 13, fontStyle: 'italic' },
});
