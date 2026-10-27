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
import { summarise, topSellingProducts, dashboardInsight, stockNeedingAttention, recommendBusinessGrowth } from '../lib/aiEngine';
import { dayLabel } from '../lib/schedule';
import { useTranslation } from '../i18n/I18nContext';
import { colors, type } from '../theme';
import EmptyState from '../components/EmptyState';

export default function DashboardScreen({ navigation }) {
  const { state , reloadData } = useApp();
  const { t, formatMoney } = useTranslation();
  const { transactions, products } = state;

  const summary = useMemo(() => summarise(transactions), [transactions]);
  const topProducts = useMemo(() => topSellingProducts(transactions), [transactions]);
  const attention = useMemo(() => stockNeedingAttention(products), [products]);
  const insight = useMemo(() => dashboardInsight(summary, attention, products), [summary, attention, products]);
  // Newest first (the list from the server is by date; inside a day, latest recorded first).
  const recent = useMemo(
    () => [...transactions].sort((a, b) => String(b.date).localeCompare(String(a.date)) || String(b.createdAt || '').localeCompare(String(a.createdAt || ''))).slice(0, 3),
    [transactions]
  );
  const growth = useMemo(() => recommendBusinessGrowth(transactions), [transactions]);

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
        <StatCard label={t('sales')} value={formatMoney(summary.totalSales, { decimals: 0 })} tone="plain" />
        <StatCard label={t('expenses')} value={formatMoney(summary.totalExpenses, { decimals: 0 })} tone="plain" />
      </View>

      <UpcomingWorkSection navigation={navigation} />
      <FollowUpCard navigation={navigation} />

      {attention.length ? (
        <Pressable style={styles.alert} onPress={() => navigation.navigate('StockTab')} accessibilityRole="button">
          <Text style={styles.alertText}>{t('dashboard.stockAlert', { count: attention.length })}</Text>
          <Text style={styles.link}>{t('common.seeAll')}</Text>
        </Pressable>
      ) : null}

      <View style={styles.sectionHeader}>
        <Text style={[styles.sectionTitle, { marginTop: 0, marginBottom: 0 }]}>{t('dashboard.recentActivity')}</Text>
        {transactions.length ? (
          <Pressable onPress={() => navigation.navigate('Activity')} hitSlop={8} accessibilityRole="button">
            <Text style={styles.link}>{t('common.seeAll')}</Text>
          </Pressable>
        ) : null}
      </View>
      {recent.length ? null : <EmptyState compact title={t('dashboard.noActivity')} />}
      {recent.map((tx) => (
        <View style={styles.listRow} key={tx.id}>
          <View style={{ flex: 1, paddingRight: 8 }}>
            <Text style={styles.rowTitle} numberOfLines={1}>{tx.title || tx.product}</Text>
            <Text style={styles.rowMeta}>{dayLabel(String(tx.date || '').slice(0, 10))}</Text>
          </View>
          <Text style={[styles.rowValue, { color: tx.type === 'sale' ? colors.success : colors.danger }]}>
            {tx.type === 'sale' ? '' : '- '}{formatMoney(Number(tx.amount), { decimals: 0 })}
          </Text>
        </View>
      ))}

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
            <Text style={styles.rowValue}>{formatMoney(p.value, { decimals: 0 })}</Text>
          </View>
        ))
      ) : (
        <EmptyState compact title={t('dashboard.recordASaleToSee')} />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: type.pageTitle,
  subtitle: { marginTop: 4, color: colors.textMuted, fontSize: 13.5, marginBottom: 4 },
  sectionTitle: { ...type.sectionTitle, marginTop: 18, marginBottom: 10 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 20, marginBottom: 4 },
  link: { fontSize: 12.5, fontWeight: '700', color: colors.primary },
  alert: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10, backgroundColor: colors.warningBg, borderRadius: 14, padding: 12, marginTop: 18 },
  alertText: { flex: 1, fontSize: 13, fontWeight: '600', color: colors.text },
  statGrid: { flexDirection: 'row', gap: 8, marginBottom: 4 },
  actions: { marginBottom: 8 },
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
  rowMeta: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  rowValue: { fontSize: 14, color: colors.text, fontWeight: '700' },
  empty: { color: colors.textMuted, fontSize: 13, fontStyle: 'italic', paddingVertical: 8 },
});
