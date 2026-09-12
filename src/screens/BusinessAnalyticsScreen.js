import { useMemo, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import Screen from '../components/Screen';
import StatCard from '../components/StatCard';
import TrendChart from '../components/TrendChart';
import InsightCard from '../components/InsightCard';
import { useApp } from '../context/AppContext';
import { summarise, topSellingProducts, analyticsInsight } from '../lib/aiEngine';
import { useTranslation } from '../i18n/I18nContext';
import { colors, radius } from '../theme';

const DAILY_TREND = [
  { label: 'Mon', value: 1200 },
  { label: 'Tue', value: 1800 },
  { label: 'Wed', value: 1450 },
  { label: 'Thu', value: 2100 },
  { label: 'Fri', value: 1750 },
  { label: 'Sat', value: 2450 },
  { label: 'Sun', value: 1900 },
];

export default function BusinessAnalyticsScreen() {
  const { state } = useApp();
  const { t } = useTranslation();
  const { transactions } = state;

  const RANGES = [
    { key: 'week', label: t('thisWeek') },
    { key: 'month', label: t('thisMonth') },
    { key: 'year', label: t('thisYear') },
  ];
  const [range, setRange] = useState('week');

  const summary = useMemo(() => summarise(transactions), [transactions]);
  const topProducts = useMemo(() => topSellingProducts(transactions), [transactions]);
  const insight = useMemo(() => analyticsInsight(transactions), [transactions]);

  return (

    <Screen>
      <View style={styles.header}>
        <Text style={styles.title}>{t('businessAnalytics')}</Text>
      </View>

      <View style={styles.rangeRow}>
        {RANGES.map((r) => (
          <Pressable
            key={r.key}
            onPress={() => setRange(r.key)}
            style={[styles.rangeChip, range === r.key ? styles.rangeChipActive : styles.rangeChipOutline]}
          >
            <Text style={[styles.rangeChipText, range === r.key && styles.rangeChipTextActive]}>{r.label}</Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.statGrid}>
        <StatCard label={t('sales')} value={`R${summary.totalSales.toFixed(0)}`} tone="sales" />
        <StatCard label={t('expenses')} value={`R${summary.totalExpenses.toFixed(0)}`} tone="expenses" />
        <StatCard label={t('profit')} value={`R${summary.profit.toFixed(0)}`} tone="profit" />
      </View>

      <Text style={styles.sectionTitle}>{t('salesTrend')}</Text>
      <TrendChart points={DAILY_TREND} />

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
        <Text style={styles.empty}>No sales recorded yet.</Text>
      )}

      <View style={{ height: 8 }} />
      <InsightCard icon="📊" title={t('businessInsight')}>
        {insight}
      </InsightCard>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { marginBottom: 16 },
  title: { fontSize: 22, fontWeight: '800', color: colors.text },
  rangeRow: { flexDirection: 'row', gap: 8, marginBottom: 18 },
  rangeChip: { flex: 1, borderRadius: radius.pill, paddingVertical: 9, alignItems: 'center' },
  rangeChipOutline: { borderWidth: 1.5, borderColor: colors.border },
  rangeChipActive: { backgroundColor: colors.primary },
  rangeChipText: { fontSize: 12.5, fontWeight: '700', color: colors.text },
  rangeChipTextActive: { color: colors.white },
  statGrid: { flexDirection: 'row', gap: 8, marginBottom: 20 },
  sectionTitle: { fontSize: 14.5, fontWeight: '700', color: colors.text, marginBottom: 10, marginTop: 4 },
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
