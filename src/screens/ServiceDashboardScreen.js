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
  serviceBookingCounts,
  recommendBusyHours,
  recommendCustomerRetention,
  recommendBusinessGrowth,
} from '../lib/aiEngine';
import { colors } from '../theme';

export default function ServiceDashboardScreen({ navigation }) {
  const { state } = useApp();
  const { business, services, transactions, customers, upcomingWork } = state;
  const summary = useMemo(() => summarise(transactions), [transactions]);

  const completedCount = useMemo(
    () => upcomingWork.filter((w) => w.status === 'Completed').length,
    [upcomingWork]
  );
  const salesCount = useMemo(() => transactions.filter((t) => t.type === 'sale').length, [transactions]);
  const popularServices = useMemo(() => serviceBookingCounts(upcomingWork), [upcomingWork]);
  const busy = useMemo(() => recommendBusyHours(upcomingWork), [upcomingWork]);
  const atRisk = useMemo(
    () => recommendCustomerRetention(customers, upcomingWork, services),
    [customers, upcomingWork, services]
  );
  const growth = useMemo(() => recommendBusinessGrowth(transactions), [transactions]);

  const insight = atRisk.length ? atRisk[0].insight : growth.growthPct !== null ? growth.insight : busy.insight;

  return (
    <Screen>
      <View style={{ marginBottom: 16 }}>
        <Text style={styles.title}>{business?.name || 'Your Business'}</Text>
        <Text style={styles.subtitle}>Track. Manage. Grow.</Text>
      </View>

      <GradientHeroCard
        label="Service Revenue"
        value={`R ${summary.totalSales.toFixed(2)}`}
        delta={growth.growthPct !== null ? `${growth.growthPct >= 0 ? '+' : ''}${growth.growthPct}% from last month` : undefined}
      />

      <View style={styles.statGrid}>
        <StatCard label="Customers Served" value={String(customers.length)} tone="plain" />
        <StatCard label="Transactions" value={String(salesCount)} tone="plain" />
      </View>

      <UpcomingWorkSection navigation={navigation} />
      <FollowUpCard navigation={navigation} />

      <Text style={styles.sectionTitle}>Popular Services</Text>
      {popularServices.length ? (
        popularServices.slice(0, 5).map((s) => {
          const svc = services.find((item) => item.name === s.name);
          const revenue = svc ? svc.price * s.count : 0;
          return (
            <View style={styles.row} key={s.name}>
              <View>
                <Text style={styles.rowTitle}>{s.name}</Text>
                <Text style={styles.rowMeta}>{s.count} customer{s.count === 1 ? '' : 's'}</Text>
              </View>
              <Text style={styles.rowValue}>R{revenue.toFixed(0)}</Text>
            </View>
          );
        })
      ) : (
        <Text style={styles.empty}>Add services and bookings to see your most popular ones here.</Text>
      )}

      <InsightCard icon="sparkles-outline" title="AI Co-Founder insight">
        {services.length || upcomingWork.length ? insight : 'Add your first service and a booking to start getting personalised insights.'}
      </InsightCard>

      <Button onPress={() => navigation.navigate('StockTab')}>Manage services</Button>
      <View style={{ height: 10 }} />
      <Button variant="outline-accent" onPress={() => navigation.navigate('Operations')}>Customers & upcoming work</Button>
      <View style={{ height: 10 }} />
      <Button variant="outline-accent" onPress={() => navigation.navigate('RecordTransaction', { type: 'sale' })}>Record payment</Button>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 22, fontWeight: '800', color: colors.text },
  subtitle: { marginTop: 4, color: colors.textMuted, fontSize: 13.5 },
  sectionTitle: { fontSize: 14.5, fontWeight: '700', color: colors.text, marginBottom: 10, marginTop: 20 },
  statGrid: { flexDirection: 'row', gap: 8 },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  rowTitle: { fontSize: 14, fontWeight: '600', color: colors.text },
  rowMeta: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  rowValue: { fontSize: 14, fontWeight: '700', color: colors.success },
  rowStatus: { fontSize: 11.5, fontWeight: '700', color: colors.primary, marginTop: 2 },
  empty: { color: colors.textMuted, fontSize: 13, fontStyle: 'italic' },
});
