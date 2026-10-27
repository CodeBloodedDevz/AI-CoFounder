import { useMemo, useRef, useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet } from 'react-native';
import Screen from '../components/Screen';
import InsightCard from '../components/InsightCard';
import Button from '../components/Button';
import AddStockForm from '../components/AddStockForm';
import ProductRow, { STOCK_BADGE } from '../components/ProductRow';
import ProductEditSheet from '../components/ProductEditSheet';
import { useApp } from '../context/AppContext';
import { stockStatus, restockRecommendation, restockPlan } from '../lib/aiEngine';
import { useTranslation } from '../i18n/I18nContext';
import { colors, radius, type } from '../theme';
import Icon from '../components/Icon';
import EmptyState from '../components/EmptyState';

// The Stock tab (product businesses): add stock, see what is low or out, edit a product, restock plan.
export default function StockManagementScreen({ navigation }) {
  const { state , reloadData } = useApp();
  const { t, formatNumber, formatMoney } = useTranslation();
  const { products, transactions } = state;
  const scrollRef = useRef(null);

  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [showPlan, setShowPlan] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [prefill, setPrefill] = useState(null);

  const counts = useMemo(() => {
    const c = { all: products.length, low: 0, out: 0 };
    products.forEach((p) => {
      const s = stockStatus(p);
      if (s === 'LOW') c.low += 1;
      if (s === 'OUT') c.out += 1;
    });
    return c;
  }, [products]);

  const FILTERS = [
    { key: 'all', label: t('all') },
    { key: 'low', label: t('lowStock') },
    { key: 'out', label: t('outOfStock') },
  ];

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return products
      .filter((p) => !q || p.name.toLowerCase().includes(q) || String(p.category || '').toLowerCase().includes(q))
      .filter((p) => {
        const status = stockStatus(p);
        if (filter === 'low') return status === 'LOW';
        if (filter === 'out') return status === 'OUT';
        return true;
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [products, query, filter]);

  const stockValue = useMemo(() => products.reduce((sum, p) => sum + Math.max(0, p.stock) * (p.cost || 0), 0), [products]);
  const recommendation = useMemo(() => restockRecommendation(products), [products]);
  const plan = useMemo(() => restockPlan(products, transactions), [products, transactions]);
  const editing = products.find((p) => p.id === editingId) || null;

  // "Restock" in the plan fills the Add stock form with the product and the suggested amount.
  const restock = (item) => {
    setPrefill({ id: `${item.id}-${Date.now()}`, product: item.name, quantity: item.suggestedQty });
    scrollRef.current?.scrollTo?.({ y: 0, animated: true });
  };

  return (
    <Screen scrollRef={scrollRef} onRefresh={reloadData}>
      <View style={styles.header}>
        <Text style={styles.title}>{t('stockManagement')}</Text>
        {products.length ? (
          <Text style={styles.subtitle}>
            {t('stock.summary', { count: products.length, value: formatMoney(stockValue, { decimals: 0 }) })}
          </Text>
        ) : (
          <Text style={styles.subtitle}>{t('stock.emptySubtitle')}</Text>
        )}
      </View>

      <AddStockForm prefill={prefill} />

      {products.length ? (
        <>
          <View style={styles.searchWrap}>
            <Icon name="search-outline" size={16} color={colors.textMuted} style={{ marginRight: 8 }} />
            <TextInput
              style={styles.searchInput}
              placeholder={t('searchProduct')}
              placeholderTextColor={colors.textMuted}
              value={query}
              onChangeText={setQuery}
              accessibilityLabel={t('searchProduct')}
            />
            {query ? (
              <Pressable onPress={() => setQuery('')} hitSlop={8} accessibilityRole="button" accessibilityLabel={t('common.clearSearch')}>
                <Icon name="close-circle" size={16} color={colors.textMuted} />
              </Pressable>
            ) : null}
          </View>

          <View style={styles.chipRow}>
            {FILTERS.map((f) => (
              <Pressable
                key={f.key}
                onPress={() => setFilter(f.key)}
                style={[styles.chip, filter === f.key ? styles.chipActive : styles.chipOutline]}
                accessibilityRole="button"
                accessibilityState={{ selected: filter === f.key }}
              >
                <Text style={[styles.chipText, filter === f.key && styles.chipTextActive]}>
                  {f.label} ({formatNumber(counts[f.key])})
                </Text>
              </Pressable>
            ))}
          </View>
        </>
      ) : null}

      <View style={{ marginBottom: 8 }}>
        {filtered.length ? (
          filtered.map((p) => <ProductRow key={p.id} product={p} onPress={() => setEditingId(p.id)} />)
        ) : (
          products.length ? (
            <EmptyState compact icon="search-outline" title={t('stockManagement.noProductsMatchThisFilter')} />
          ) : (
            <EmptyState icon="cube-outline" title={t('stock.noProductsYet')} />
          )
        )}
      </View>

      {products.length ? (
        <InsightCard
          icon="cube-outline"
          title={t('restockRecommendation')}
          action={
            <Button
              size="sm"
              icon={showPlan ? 'chevron-up-outline' : 'chevron-forward-outline'}
              iconPosition="right"
              onPress={() => setShowPlan((s) => !s)}
            >
              {showPlan ? t('stock.hideRecommendation') : t('viewRecommendation')}
            </Button>
          }
        >
          {recommendation}
        </InsightCard>
      ) : null}

      {showPlan && (
        <View style={{ marginTop: -6, marginBottom: 20 }}>
          {plan.length ? (
            plan.map((item) => (
              <View style={styles.planRow} key={item.id}>
                <View style={{ flex: 1, paddingRight: 8 }}>
                  <View style={styles.planLeft}>
                    <View style={[styles.badge, { backgroundColor: STOCK_BADGE[item.status].bg }]}>
                      <Text style={[styles.badgeText, { color: STOCK_BADGE[item.status].text }]}>{t(STOCK_BADGE[item.status].labelKey)}</Text>
                    </View>
                    <Text style={styles.rowTitle}>{item.name}</Text>
                  </View>
                  <Text style={styles.rowSub}>
                    {t('stock.planLine', { left: formatNumber(item.currentStock), order: formatNumber(item.suggestedQty) })}
                  </Text>
                </View>
                <Pressable style={styles.recordBtn} onPress={() => restock(item)} accessibilityRole="button">
                  <Text style={styles.recordBtnText}>{t('stock.restock')}</Text>
                </Pressable>
              </View>
            ))
          ) : (
            <Text style={styles.empty}>{t('stockManagement.nothingNeedsRestockingRightNow')}</Text>
          )}
        </View>
      )}

      <ProductEditSheet product={editing} visible={Boolean(editing)} onClose={() => setEditingId(null)} navigation={navigation} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { marginBottom: 16 },
  title: type.pageTitle,
  subtitle: type.pageSubtitle,
  searchWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.inputBg, borderRadius: radius.md, paddingHorizontal: 14, marginBottom: 12 },
  searchInput: { flex: 1, paddingVertical: 12, fontSize: 14, color: colors.text },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.pill },
  chipOutline: { borderWidth: 1.5, borderColor: colors.border },
  chipActive: { backgroundColor: colors.primary },
  chipText: { fontSize: 12.5, fontWeight: '700', color: colors.text },
  chipTextActive: { color: colors.white },
  planRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  planLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rowTitle: { fontSize: 14, color: colors.text, fontWeight: '600' },
  rowSub: { fontSize: 12, color: colors.textMuted, marginTop: 3 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill },
  badgeText: { fontSize: 10.5, fontWeight: '800' },
  recordBtn: { borderWidth: 1.5, borderColor: colors.primary, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 6 },
  recordBtnText: { color: colors.primary, fontSize: 12, fontWeight: '700' },
  empty: { color: colors.textMuted, fontSize: 13, fontStyle: 'italic', paddingVertical: 8 },
});
