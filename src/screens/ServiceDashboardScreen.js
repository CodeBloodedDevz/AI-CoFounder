import { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Screen from '../components/Screen';
import StatCard from '../components/StatCard';
import InsightCard from '../components/InsightCard';
import Button from '../components/Button';
import { useApp } from '../context/AppContext';
import { summarise } from '../lib/aiEngine';
import { colors } from '../theme';

export default function ServiceDashboardScreen({ navigation }) {
  const { state } = useApp();
  const { business, user, services, transactions, customers, upcomingWork } = state;
  const summary = useMemo(() => summarise(transactions), [transactions]);

  return (
    <Screen>
      <View style={styles.header}>
        <Text style={styles.title}>{business?.name || 'Your Business'}</Text>
        <Text style={styles.subtitle}>Welcome back, {user?.name || 'there'}.</Text>
      </View>

      <Text style={styles.sectionTitle}>Service overview</Text>
      <View style={styles.statGrid}>
        <StatCard label="Revenue" value={`R${summary.totalSales.toFixed(0)}`} tone="sales" />
        <StatCard label="Expenses" value={`R${summary.totalExpenses.toFixed(0)}`} tone="expenses" />
        <StatCard label="Services" value={String(services.length)} tone="profit" />
      </View>
      <View style={styles.statGrid}>
        <StatCard label="Customers" value={String(customers.length)} tone="profit" />
        <StatCard label="Upcoming work" value={String(upcomingWork.length)} tone="expenses" />
        <StatCard label="Transactions" value={String(transactions.length)} tone="sales" />
      </View>

      <InsightCard icon="sparkles-outline" title="Business insight">
        {services.length ? 'Your service menu is ready. Keep your availability and pricing up to date.' : 'Add your first service to start building a service menu.'}
      </InsightCard>

      <Button onPress={() => navigation.navigate('ServiceManagement')}>Manage services</Button>
      <View style={{ height: 10 }} />
      <Button variant="outline-accent" onPress={() => navigation.navigate('Operations')}>Customers & upcoming work</Button>
      <View style={{ height: 10 }} />
      <Button variant="outline-accent" onPress={() => navigation.navigate('RecordTransaction', { type: 'sale' })}>Record payment</Button>

      <Text style={styles.sectionTitle}>Upcoming work</Text>
      {upcomingWork.length ? upcomingWork.map((work) => (
        <View style={styles.row} key={work.id}>
          <Text style={styles.rowTitle}>{work.title || work.service}</Text>
          <Text style={styles.rowMeta}>{work.date}</Text>
        </View>
      )) : <Text style={styles.empty}>No upcoming work scheduled.</Text>}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { marginBottom: 20 },
  title: { fontSize: 22, fontWeight: '800', color: colors.primary },
  subtitle: { marginTop: 4, color: colors.textMuted, fontSize: 13.5 },
  sectionTitle: { fontSize: 14.5, fontWeight: '700', color: colors.text, marginBottom: 10, marginTop: 22 },
  statGrid: { flexDirection: 'row', gap: 8 },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  rowTitle: { fontSize: 14, fontWeight: '600', color: colors.text },
  rowMeta: { fontSize: 12, color: colors.textMuted },
  empty: { color: colors.textMuted, fontSize: 13, fontStyle: 'italic' },
});
