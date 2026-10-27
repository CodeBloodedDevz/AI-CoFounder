import { useMemo, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import Screen from '../components/Screen';
import StatCard from '../components/StatCard';
import FinanceChart from '../components/FinanceChart';
import InsightCard from '../components/InsightCard';
import BackButton from '../components/BackButton';
import { useApp } from '../context/AppContext';
import { analyticsFor } from '../lib/analytics';
import { compactMoney } from '../lib/numbers';
import { useTranslation } from '../i18n/I18nContext';
import { colors, radius, type } from '../theme';
import EmptyState from '../components/EmptyState';

// Income, expenses and profit for this week / month / year, worked out from the recorded transactions,
// with a graph of all three per day / week / month, the best sellers and a comparison with the period
// before. Everything is recalculated from state.transactions, so adding, editing or deleting a record
// updates the cards and the graph straight away.

export default function BusinessAnalyticsScreen({ navigation }) {
  const { state } = useApp();
  const { t, formatMoney, formatDate, currencySymbol } = useTranslation();
  const { transactions } = state;

  const RANGES = [
    { key: 'week', label: t('thisWeek') },
    { key: 'month', label: t('thisMonth') },
    { key: 'year', label: t('thisYear') },
  ];
  const [range, setRange] = useState('week');
  const data = useMemo(() => analyticsFor(transactions, range), [transactions, range]);
  const { summary, previous, salesChangePct, trend, top, bounds } = data;
  const hasRecordsInTrend = trend.some((p) => p.income > 0 || p.expenses > 0);
  const money = (v) => formatMoney(v, { decimals: 0 });
  // The dates behind one point of the graph: a day this week, a week of this month, a month of this year.
  const formatPeriod = (p) => {
    if (range === 'year') return formatDate(p.from, { month: 'long', year: 'numeric' });
    if (p.from === p.to) return formatDate(p.from, { weekday: 'long', day: 'numeric', month: 'long' });
    return t('analytics.dateRange', { from: formatDate(p.from, { day: 'numeric', month: 'short' }), to: formatDate(p.to, { day: 'numeric', month: 'short', year: 'numeric' }) });
  };

  const change =
    salesChangePct === null
      ? previous.totalSales === 0 && summary.totalSales > 0
        ? t('analytics.noEarlierSales')
        : null
      : salesChangePct === 0
      ? t('analytics.sameAsBefore')
      : t(salesChangePct > 0 ? 'analytics.upOnBefore' : 'analytics.downOnBefore', { pct: Math.abs(salesChangePct) });

  return (
    <Screen>
      <View style={styles.header}>
        <BackButton navigation={navigation} />
        <Text style={styles.title}>{t('businessAnalytics')}</Text>
        <Text style={styles.subtitle}>
          {t('analytics.dateRange', { from: formatDate(bounds.from, { day: 'numeric', month: 'short' }), to: formatDate(bounds.to, { day: 'numeric', month: 'short', year: 'numeric' }) })}
        </Text>
      </View>

      <View style={styles.rangeRow}>
        {RANGES.map((r) => (
          <Pressable
            key={r.key}
            onPress={() => setRange(r.key)}
            style={[styles.rangeChip, range === r.key ? styles.rangeChipActive : styles.rangeChipOutline]}
            accessibilityRole="button"
            accessibilityState={{ selected: range === r.key }}
          >
            <Text style={[styles.rangeChipText, range === r.key && styles.rangeChipTextActive]}>{r.label}</Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.statGrid}>
        <StatCard label={t('common.income')} value={formatMoney(summary.totalSales, { decimals: 0 })} tone="sales" />
        <StatCard label={t('expenses')} value={formatMoney(summary.totalExpenses, { decimals: 0 })} tone="expenses" />
        <StatCard label={t('profit')} value={formatMoney(summary.profit, { decimals: 0 })} tone="profit" />
      </View>
      {change ? (
        <Text style={[styles.change, salesChangePct > 0 && { color: colors.success }, salesChangePct < 0 && { color: colors.danger }]}>{change}</Text>
      ) : null}

      <Text style={styles.sectionTitle}>{t('analytics.chartTitle')}</Text>
      {hasRecordsInTrend ? (
        <FinanceChart
          points={trend}
          labels={{ income: t('common.income'), expenses: t('expenses'), profit: t('profit') }}
          formatValue={money}
          formatAxis={(v) => compactMoney(v, currencySymbol)}
          formatPeriod={formatPeriod}
        />
      ) : (
        <EmptyState compact title={t('analytics.noRecordsInPeriod')} />
      )}

      <Text style={styles.sectionTitle}>{t('topSellingProducts')}</Text>
      {top.length ? (
        top.map((p, i) => (
          <View style={styles.listRow} key={p.name}>
            <View style={styles.listRowLeft}>
              <Text style={styles.rank}>{i + 1}</Text>
              <Text style={styles.rowTitle}>{p.name}</Text>
            </View>
            <Text style={styles.rowValue}>{formatMoney(p.value, { decimals: 0 })}</Text>
          </View>
        ))
      ) : (
        <EmptyState compact title={transactions.length ? t('analytics.noSalesInPeriod') : t('businessAnalytics.noSalesRecordedYet')} />
      )}

      <View style={{ height: 16 }} />
      <InsightCard icon="bar-chart-outline" title={t('businessInsight')}>
        {data.insight}
      </InsightCard>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { marginBottom: 16 },
  title: type.pageTitle,
  subtitle: type.pageSubtitle,
  rangeRow: { flexDirection: 'row', gap: 8, marginBottom: 18 },
  rangeChip: { flex: 1, borderRadius: radius.pill, paddingVertical: 9, alignItems: 'center' },
  rangeChipOutline: { borderWidth: 1.5, borderColor: colors.border },
  rangeChipActive: { backgroundColor: colors.primary },
  rangeChipText: { fontSize: 12.5, fontWeight: '700', color: colors.text },
  rangeChipTextActive: { color: colors.white },
  statGrid: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  change: { fontSize: 12.5, fontWeight: '700', color: colors.textMuted, marginBottom: 14 },
  sectionTitle: { ...type.sectionTitle, marginTop: 12, marginBottom: 10 },
  listRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  listRowLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
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
  rowTitle: { fontSize: 14, color: colors.text, fontWeight: '600', flexShrink: 1 },
  rowValue: { fontSize: 14, color: colors.text, fontWeight: '700' },
  empty: { color: colors.textMuted, fontSize: 13, fontStyle: 'italic', paddingVertical: 8 },
});
