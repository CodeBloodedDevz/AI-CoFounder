import { useMemo, useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet } from 'react-native';
import Screen from '../components/Screen';
import InsightCard from '../components/InsightCard';
import Button from '../components/Button';
import { useApp } from '../context/AppContext';
import { stockStatus, restockRecommendation, restockPlan } from '../lib/aiEngine';
import { useTranslation } from '../i18n/I18nContext';
import { colors, radius } from '../theme';

const ICONS = { Beverages: '🥤', Bakery: '🍞', Snacks: '🍟', Dairy: '🥛' };
const BADGE = {
  GOOD: { bg: colors.successBg, text: colors.success, label: 'Good' },
  LOW: { bg: colors.warningBg, text: colors.warning, label: 'LOW' },
  OUT: { bg: colors.dangerBg, text: colors.danger, label: 'OUT' },
};

export default function StockManagementScreen({ navigation }) {
  const { state } = useApp();
  const { t } = useTranslation();
  const { products, transactions } = state;

  const FILTERS = [
    { key: 'all', label: t('all') },
    { key: 'low', label: t('lowStock') },
    { key: 'out', label: t('outOfStock') },
  ];

  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [showPlan, setShowPlan] = useState(false);

  const filtered = useMemo(() => {
    return products
      .filter((p) => p.name.toLowerCase().includes(query.toLowerCase()))
      .filter((p) => {
        const status = stockStatus(p);
        if (filter === 'low') return status === 'LOW';
        if (filter === 'out') return status === 'OUT';
        return true;
      });
  }, [products, query, filter]);

  const recommendation = useMemo(() => restockRecommendation(products), [products]);
  const plan = useMemo(() => restockPlan(products, transactions), [products, transactions]);

  return (
    <Screen>
      <View style={{ marginBottom: 16 }}>
        <Text style={styles.title}>{t('stockManagement')}</Text>
      </View>

      <View style={styles.searchWrap}>
        <TextInput
          style={styles.searchInput}
          placeholder={t('searchProduct')}
          placeholderTextColor={colors.textMuted}
          value={query}
          onChangeText={setQuery}
        />
      </View>

      <View style={styles.chipRow}>
        {FILTERS.map((f) => (
          <Pressable
            key={f.key}
            onPress={() => setFilter(f.key)}
            style={[styles.chip, filter === f.key ? styles.chipActive : styles.chipOutline]}
          >
            <Text style={[styles.chipText, filter === f.key && styles.chipTextActive]}>{f.label}</Text>
          </Pressable>
        ))}
      </View>

      <View style={{ marginBottom: 8 }}>
        {filtered.length ? (
          filtered.map((p) => {
            const status = stockStatus(p);
            const badge = BADGE[status];
            return (
              <Pressable
                key={p.id}
                style={styles.listRow}
                onPress={() => navigation.navigate('PricingAssistant', { productId: p.id })}
              >
                <View style={styles.rowLeft}>
                  <Text style={{ fontSize: 16 }}>{ICONS[p.category] || '📦'}</Text>
                  <Text style={styles.rowTitle}>{p.name}</Text>
                </View>
                <View style={styles.rowRight}>
                  <Text style={styles.rowValue}>{p.stock}</Text>
                  <View style={[styles.badge, { backgroundColor: badge.bg }]}>
                    <Text style={[styles.badgeText, { color: badge.text }]}>{badge.label}</Text>
                  </View>
                </View>
              </Pressable>
            );
          })
        ) : (
          <Text style={styles.empty}>No products match this filter.</Text>
        )}
      </View>

      <InsightCard
        icon="📦"
        title={t('restockRecommendation')}
        action={
          <Button size="sm" onPress={() => setShowPlan((s) => !s)}>
            {showPlan ? '↑ Hide Recommendation' : `${t('viewRecommendation')} →`}
          </Button>
        }
      >
        {recommendation}
      </InsightCard>

      {showPlan && (
        <View style={{ marginTop: -6, marginBottom: 20 }}>
          {plan.length ? (
            plan.map((item) => (
              <View style={styles.listRow} key={item.id}>
                <View style={{ flex: 1, paddingRight: 8 }}>
                  <View style={styles.rowLeft}>
                    <View style={[styles.badge, { backgroundColor: item.status === 'OUT' ? colors.dangerBg : colors.warningBg }]}>
                      <Text style={[styles.badgeText, { color: item.status === 'OUT' ? colors.danger : colors.warning }]}>
                        {item.status}
                      </Text>
                    </View>
                    <Text style={styles.rowTitle}>{item.name}</Text>
                  </View>
                  <Text style={styles.rowSub}>currently {item.currentStock} left</Text>
                </View>
                <View style={styles.rowRight}>
                  <Text style={styles.rowValue}>Order {item.suggestedQty}</Text>
                  <Pressable
                    style={styles.recordBtn}
                    onPress={() =>
                      navigation.navigate('RecordTransaction', {
                        type: 'stock_purchase',
                        product: item.name,
                        quantity: item.suggestedQty,
                      })
                    }
                  >
                    <Text style={styles.recordBtnText}>Record</Text>
                  </Pressable>
                </View>
              </View>
            ))
          ) : (
            <Text style={styles.empty}>Nothing needs restocking right now.</Text>
          )}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 22, fontWeight: '800', color: colors.text },
  searchWrap: { backgroundColor: colors.inputBg, borderRadius: radius.md, paddingHorizontal: 14, marginBottom: 14 },
  searchInput: { paddingVertical: 12, fontSize: 14, color: colors.text },
  chipRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.pill },
  chipOutline: { borderWidth: 1.5, borderColor: colors.border },
  chipActive: { backgroundColor: colors.primary },
  chipText: { fontSize: 12.5, fontWeight: '700', color: colors.text },
  chipTextActive: { color: colors.white },
  listRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  rowLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rowRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  rowTitle: { fontSize: 14, color: colors.text, fontWeight: '600' },
  rowSub: { fontSize: 11.5, color: colors.textMuted, marginLeft: 2, marginTop: 2 },
  rowValue: { fontSize: 13.5, color: colors.text, fontWeight: '700' },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill },
  badgeText: { fontSize: 10.5, fontWeight: '800' },
  recordBtn: { borderWidth: 1.5, borderColor: colors.primary, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 5 },
  recordBtnText: { color: colors.primary, fontSize: 11.5, fontWeight: '700' },
  empty: { color: colors.textMuted, fontSize: 13, fontStyle: 'italic', paddingVertical: 8 },
});
