import { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Screen from '../components/Screen';
import StatCard from '../components/StatCard';
import InsightCard from '../components/InsightCard';
import Button from '../components/Button';
import { useApp } from '../context/AppContext';
import { summarise, topSellingProducts, dashboardInsight, lowStockProducts } from '../lib/aiEngine';
import { greetingKey } from '../lib/greeting';
import { useTranslation } from '../i18n/I18nContext';
import { colors } from '../theme';

export default function DashboardScreen({ navigation }) {
  const { state } = useApp();
  const { t } = useTranslation();
  const { transactions, products, business, user } = state;

  const summary = useMemo(() => summarise(transactions), [transactions]);
  const topProducts = useMemo(() => topSellingProducts(transactions), [transactions]);
  const lowStock = useMemo(() => lowStockProducts(products), [products]);
  const insight = useMemo(() => dashboardInsight(summary, lowStock), [summary, lowStock]);

  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);
  const greeting = t(greetingKey(now));

  return (
    <Screen>
      <View style={{ marginBottom: 20 }}>
        <Text style={styles.title}>{business?.name || 'Your Business'}</Text>
        <Text style={styles.subtitle}>
          {greeting}, {user?.name || 'there'} 👋
        </Text>
      </View>

      <Text style={styles.sectionTitle}>{t('todaysSummary')}</Text>
      <View style={styles.statGrid}>
        <StatCard label={t('sales')} value={`R${summary.totalSales.toFixed(0)}`} tone="sales" />
        <StatCard label={t('expenses')} value={`R${summary.totalExpenses.toFixed(0)}`} tone="expenses" />
        <StatCard label={t('profit')} value={`R${summary.profit.toFixed(0)}`} tone="profit" />
      </View>

      <Text style={[styles.sectionTitle, { color: colors.primary }]}>{t('aiInsight')}</Text>
      <InsightCard>{insight}</InsightCard>

      <View style={styles.actions}>
        <Button onPress={() => navigation.navigate('RecordTransaction', { type: 'sale' })}>{t('recordSale')}</Button>
        <View style={{ height: 10 }} />
        <Button variant="outline-accent" onPress={() => navigation.navigate('RecordTransaction', { type: 'expense' })}>
          {t('addExpense')}
        </Button>
      </View>

      <Text style={styles.sectionTitle}>{t('topSellingProducts')}</Text>
      {topProducts.length ? (
        topProducts.map((p, i) => (
          <View style={styles.listRow} key={p.name}>
            <View style={styles.listRowLeft}>
              <Text style={styles.rank}>{i + 1}</Text>
              <Text style={styles.rowTitle}>{p.name}</Text>
            </View>
            <Text style={styles.rowValue}>R{p.value.toFixed(0)}</Text>
          </View>
        ))
      ) : (
        <Text style={styles.empty}>Record a sale to see your top products here.</Text>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 22, fontWeight: '800', color: colors.primary },
  subtitle: { marginTop: 4, color: colors.textMuted, fontSize: 13.5 },
  sectionTitle: { fontSize: 14.5, fontWeight: '700', color: colors.text, marginBottom: 10, marginTop: 4 },
  statGrid: { flexDirection: 'row', gap: 8, marginBottom: 20 },
  actions: { marginBottom: 24 },
  listRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  listRowLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  rank: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.inputBg,
    color: colors.textSoft,
    fontSize: 11,
    fontWeight: '700',
    textAlign: 'center',
    lineHeight: 20,
    overflow: 'hidden',
  },
  rowTitle: { fontSize: 14, color: colors.text, fontWeight: '600' },
  rowValue: { fontSize: 14, color: colors.text, fontWeight: '700' },
  empty: { color: colors.textMuted, fontSize: 13, fontStyle: 'italic', paddingVertical: 8 },
});
