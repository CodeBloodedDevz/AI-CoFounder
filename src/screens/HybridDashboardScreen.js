import { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Screen from '../components/Screen';
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
  lowStockProducts,
} from '../lib/aiEngine';
import { addDays, splitWork, todayISO } from '../lib/schedule';
import { colors } from '../theme';

export default function HybridDashboardScreen({ navigation }) {
  const { state } = useApp();
  const { business, products, services, customers, upcomingWork, transactions } = state;
  const summary = useMemo(() => summarise(transactions), [transactions]);
  const lowStock = useMemo(() => lowStockProducts(products), [products]);

  const productRevenue = useMemo(
    () =>
      transactions
        .filter((t) => t.type === 'sale' && products.some((p) => p.name === (t.title || t.product)))
        .reduce((sum, t) => sum + Number(t.amount || 0), 0),
    [transactions, products]
  );
  const serviceRevenue = useMemo(
    () =>
      transactions
        .filter((t) => t.type === 'sale' && services.some((s) => s.name === (t.title || t.product)))
        .reduce((sum, t) => sum + Number(t.amount || 0), 0),
    [transactions, services]
  );

  // Bookings still ahead in the next 7 days (what the row below says it counts).
  const weekBookings = useMemo(() => {
    const limit = addDays(todayISO(), 7);
    return splitWork(upcomingWork).upcoming.filter((w) => w.date <= limit).length;
  }, [upcomingWork]);

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
    : 'Add products and services to see a complete view of your business.';

  return (
    <Screen>
      <View style={{ marginBottom: 16 }}>
        <Text style={styles.title}>{business?.name || 'Your Business'}</Text>
        <Text style={styles.subtitle}>Track. Manage. Grow.</Text>
      </View>

      <GradientHeroCard
        label="Total Balance"
        value={`R ${summary.profit.toFixed(2)}`}
        delta={growth.growthPct !== null ? `${growth.growthPct >= 0 ? '+' : ''}${growth.growthPct}% from last month` : undefined}
      />

      <View style={styles.statGrid}>
        <StatCard label="Product Revenue" value={`R${productRevenue.toFixed(0)}`} tone="plain" />
        <StatCard label="Service Revenue" value={`R${serviceRevenue.toFixed(0)}`} tone="plain" />
      </View>

      <UpcomingWorkSection navigation={navigation} />
      <FollowUpCard navigation={navigation} />

      <Text style={styles.sectionTitle}>Business Snapshot</Text>
      <View style={styles.row}>
        <View>
          <Text style={styles.rowTitle}>Customers served</Text>
          <Text style={styles.rowMeta}>This month</Text>
        </View>
        <Text style={[styles.rowValue, { color: colors.primary }]}>{customers.length}</Text>
      </View>
      <View style={styles.row}>
        <View>
          <Text style={styles.rowTitle}>Low stock items</Text>
          <Text style={styles.rowMeta}>Needs attention</Text>
        </View>
        <Text style={[styles.rowValue, { color: colors.danger }]}>{lowStock.length}</Text>
      </View>
      <View style={styles.row}>
        <View>
          <Text style={styles.rowTitle}>Service bookings</Text>
          <Text style={styles.rowMeta}>This week</Text>
        </View>
        <Text style={[styles.rowValue, { color: colors.success }]}>{weekBookings}</Text>
      </View>

      <InsightCard icon="sparkles-outline" title="AI Co-Founder Insight">
        {products.length || services.length ? insight : 'Add products and services to see a complete view of your business.'}
      </InsightCard>

      <View style={styles.actions}>
        <Button onPress={() => navigation.navigate('StockTab')}>Manage stock & services</Button>
        <View style={{ height: 10 }} />
        <Button variant="outline-accent" onPress={() => navigation.navigate('Operations')}>Customers & upcoming work</Button>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 22, fontWeight: '800', color: colors.text },
  subtitle: { marginTop: 4, color: colors.textMuted, fontSize: 13.5 },
  sectionTitle: { fontSize: 14.5, fontWeight: '700', color: colors.text, marginBottom: 4, marginTop: 20 },
  statGrid: { flexDirection: 'row', gap: 8, marginBottom: 4 },
  actions: { marginTop: 16 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  rowTitle: { fontSize: 14, fontWeight: '600', color: colors.text },
  rowMeta: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  rowValue: { fontSize: 16, fontWeight: '800' },
  empty: { color: colors.textMuted, fontSize: 13, fontStyle: 'italic' },
});
